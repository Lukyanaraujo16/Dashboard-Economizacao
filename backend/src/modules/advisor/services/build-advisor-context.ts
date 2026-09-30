import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey, isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../../analytics/domain/types.js';
import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import {
  buildAnalyticalFactsContent,
  type AdvisorDrilldownFacts,
} from '../domain/analytical-facts-text.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import type { AdvisorCashComparisonService } from '../domain/advisor-analytical-tools.js';
import {
  compareAdvisorCashMonths,
  type AdvisorCashMonthComparison,
} from '../domain/compare-advisor-cash-months.js';
import {
  buildFinancialFactsViaUniversal,
  serializeCurrentSnapshotViaUniversal,
} from '../domain/analytical/preload-analytical-parity.js';
import { attachAdvisorDocumentKnowledgeBlock } from '../domain/attach-advisor-document-knowledge.js';
import { ADVISOR_DOCUMENT_KNOWLEDGE_HISTORY_USER_LIMIT } from '../domain/advisor-document-knowledge-limits.js';
import { ADVISOR_HISTORY_MESSAGE_LIMIT, type AdvisorBuiltContext } from '../domain/context-blocks.js';
import {
  applyAdvisorContextCharBudget,
  wrapUntrusted,
  type AdvisorContextBlockDraft,
} from '../domain/context-char-budget.js';
import { resolveConsultantDisplayName } from '../domain/consultant-name.js';
import { DEFAULT_EMOJI_PREFERENCE, resolveEmojiInstruction } from '../domain/emoji-preference.js';
import { ADVISOR_PLATFORM_INSTRUCTIONS } from '../domain/platform-instructions.js';
import {
  emitAdvisorDocumentKnowledgeRetrievedEvent,
  retrieveAdvisorDocumentKnowledge,
  type AdvisorDocumentKnowledgeCandidate,
} from '../domain/retrieve-advisor-document-knowledge.js';
import { DEFAULT_TONE_PRESET, resolveToneInstruction } from '../domain/tone-presets.js';
import type {
  AiConversationRecord,
  AiKnowledgeEntryRecord,
  AiMessageRecord,
  AiTenantSettingsRecord,
} from '../domain/types.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';

export type BuildAdvisorContextInput = {
  readonly tenantId: string;
  readonly userId?: string;
  readonly conversationId?: string;
  readonly question: string;
  readonly monthKey?: string;
  readonly comparisonMonthKey?: string;
  readonly comparison?: AdvisorCashMonthComparison | null;
  readonly drilldown?: AdvisorDrilldownFacts | null;
  readonly now?: Date;
};

export type BuildAdvisorContextDependencies = {
  readonly settings: {
    findSettingsByTenant(tenantId: string): Promise<AiTenantSettingsRecord | null>;
  };
  readonly knowledge: {
    listKnowledge(tenantId: string): Promise<readonly AiKnowledgeEntryRecord[]>;
  };
  readonly conversations: {
    findConversation(
      tenantId: string,
      userId: string,
      conversationId: string,
    ): Promise<AiConversationRecord | null>;
    listMessages(tenantId: string, conversationId: string): Promise<readonly AiMessageRecord[]>;
  };
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly analytics: Pick<AnalyticsService, 'getFinancialStockSnapshot'>;
  readonly cashComparison?: AdvisorCashComparisonService;
  /** Recuperação documental lexical (ACTIVE+READY). Opcional: ausência = sem DOCUMENT_KNOWLEDGE. */
  readonly documentKnowledge?: {
    listActiveReadyChunksForRetrieval(
      tenantId: string,
    ): Promise<readonly AdvisorDocumentKnowledgeCandidate[]>;
  };
};

export type AttachAdvisorDocumentKnowledgeInput = {
  readonly question: string;
  readonly recentUserMessages?: readonly string[];
};

export function createBuildAdvisorContext(deps: BuildAdvisorContextDependencies) {
  return {
    async build(input: BuildAdvisorContextInput): Promise<AdvisorBuiltContext> {
      const tenantId = requireTenantId(input.tenantId);
      const now = input.now ?? new Date();
      const monthKey = resolveMonthKey(input.monthKey, now);
      const comparisonMonthKey =
        input.comparisonMonthKey === undefined || input.comparisonMonthKey.trim() === ''
          ? undefined
          : resolveMonthKey(input.comparisonMonthKey, now);
      const conversationId = optionalId(input.conversationId);
      const userId = optionalId(input.userId);

      if (conversationId !== undefined && userId === undefined) {
        throw new AdvisorDomainError(
          'USER_ID_REQUIRED',
          'userId é obrigatório na conversa do Consultor.',
        );
      }

      if (conversationId !== undefined && userId !== undefined) {
        const conversation = await deps.conversations.findConversation(
          tenantId,
          userId,
          conversationId,
        );
        if (
          conversation === null ||
          conversation.tenantId !== tenantId ||
          conversation.userId !== userId ||
          conversation.id !== conversationId
        ) {
          throw new AdvisorDomainError(
            'CONVERSATION_NOT_FOUND',
            'Conversa não encontrada neste tenant.',
          );
        }
      }

      const shouldLoadComparison =
        comparisonMonthKey !== undefined &&
        comparisonMonthKey !== monthKey &&
        input.comparison === undefined;
      const [settingsRow, knowledgeRows, flow, comparisonFlow, snapshot, messages] =
        await Promise.all([
          deps.settings.findSettingsByTenant(tenantId),
          deps.knowledge.listKnowledge(tenantId),
          deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now }),
          shouldLoadComparison && deps.cashComparison === undefined
            ? deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey: comparisonMonthKey, now })
            : Promise.resolve<MonthlyCashFlow | null>(null),
          deps.analytics.getFinancialStockSnapshot({ tenantId, now }),
          conversationId === undefined
            ? Promise.resolve<readonly AiMessageRecord[]>([])
            : deps.conversations.listMessages(tenantId, conversationId),
        ]);
      const loadedComparison =
        shouldLoadComparison && deps.cashComparison
          ? await deps.cashComparison.compare({
              tenantId,
              monthKey,
              comparisonMonthKey,
              now,
            })
          : null;

      const settings = settingsRow?.tenantId === tenantId ? settingsRow : null;
      const knowledge = knowledgeRows.filter(
        (entry) => entry.tenantId === tenantId && entry.status === 'ACTIVE',
      );
      const history = messages
        .filter(
          (message) =>
            message.tenantId === tenantId &&
            (conversationId === undefined || message.conversationId === conversationId),
        )
        .slice(-ADVISOR_HISTORY_MESSAGE_LIMIT);

      const safeFlow = isSameTenantFlow(flow, tenantId) ? flow : null;
      const safeComparisonFlow =
        comparisonFlow !== null && isSameTenantFlow(comparisonFlow, tenantId)
          ? comparisonFlow
          : null;
      const safeSnapshot = isSameTenantSnapshot(snapshot, tenantId) ? snapshot : null;
      const comparison = resolveComparison({
        tenantId,
        provided: input.comparison,
        loaded: loadedComparison,
        periodA: safeComparisonFlow,
        periodB: safeFlow,
      });

      const admin = wrapUntrusted('ADMIN_CONTEXT', presentOrAbsent(settings?.adminPrompt));
      const knowledgeBlock = wrapUntrusted('TENANT_KNOWLEDGE', formatKnowledge(knowledge));
      const historyBlock = wrapUntrusted('CONVERSATION_HISTORY', formatHistory(history));
      const question = wrapUntrusted('USER_QUESTION', input.question);

      const drafts: AdvisorContextBlockDraft[] = [
        {
          type: 'PLATFORM_INSTRUCTIONS',
          content: ADVISOR_PLATFORM_INSTRUCTIONS,
          trustLevel: 'PLATFORM',
        },
        {
          type: 'TENANT_PROFILE',
          content: formatTenantProfile(settings),
          trustLevel: 'TENANT_CONFIG',
        },
        {
          type: 'ADMIN_CONTEXT',
          content: admin.content,
          trustLevel: 'UNTRUSTED',
          inner: admin.inner,
        },
        {
          type: 'TENANT_KNOWLEDGE',
          content: knowledgeBlock.content,
          trustLevel: 'UNTRUSTED',
          inner: knowledgeBlock.inner,
        },
        {
          type: 'FINANCIAL_FACTS',
          content: buildFinancialFactsViaUniversal({
            monthKey,
            flow: safeFlow,
            snapshot: safeSnapshot,
          }),
          trustLevel: 'ANALYTICAL_FACT',
          source: {
            kind: 'analytical',
            monthKey,
            service: 'monthlyCashFlow+stockSnapshot+monthlyBilling',
          },
        },
        {
          type: 'ANALYTICAL_FACTS',
          content: buildAnalyticalFactsContent({
            monthKey,
            comparisonMonthKey,
            comparison,
            drilldown: input.drilldown ?? null,
          }),
          trustLevel: 'ANALYTICAL_FACT',
          source: {
            kind: 'analytical',
            monthKey,
            service: 'compareAdvisorCashMonths',
            ...(comparisonMonthKey === undefined ? {} : { comparisonMonthKey }),
          },
        },
        {
          type: 'CONVERSATION_HISTORY',
          content: historyBlock.content,
          trustLevel: 'UNTRUSTED',
          inner: historyBlock.inner,
        },
        {
          type: 'USER_QUESTION',
          content: question.content,
          trustLevel: 'UNTRUSTED',
          inner: question.inner,
        },
      ];

      return {
        tenantId,
        monthKey,
        ...(comparisonMonthKey === undefined ? {} : { comparisonMonthKey }),
        blocks: applyAdvisorContextCharBudget(drafts),
        currentSnapshot:
          safeSnapshot === null ? null : serializeCurrentSnapshotViaUniversal(safeSnapshot),
      };
    },

    /**
     * Anexa DOCUMENT_KNOWLEDGE ao contexto já montado.
     * Usado apenas no caminho do provider (após FACTUAL_CLOSED falhar).
     * Não cria ai_run. Retrieval lexical local, sem LLM.
     */
    async withDocumentKnowledge(
      built: AdvisorBuiltContext,
      input: AttachAdvisorDocumentKnowledgeInput,
    ): Promise<AdvisorBuiltContext> {
      if (deps.documentKnowledge === undefined) {
        return built;
      }
      assertAdvisorTenantId(built.tenantId);
      const recentUserMessages = (input.recentUserMessages ?? []).slice(
        -ADVISOR_DOCUMENT_KNOWLEDGE_HISTORY_USER_LIMIT,
      );
      const startedAt = Date.now();
      const candidates = await deps.documentKnowledge.listActiveReadyChunksForRetrieval(
        built.tenantId,
      );
      const result = retrieveAdvisorDocumentKnowledge({
        question: input.question,
        recentUserMessages,
        candidates,
      });
      emitAdvisorDocumentKnowledgeRetrievedEvent({
        tenantId: built.tenantId,
        documentIds: [...new Set(result.selected.map((item) => item.documentId))],
        chunkIds: result.selected.map((item) => item.chunkId),
        candidateCount: result.candidateCount,
        selectedCount: result.selectedCount,
        selectedChars: result.selectedChars,
        retrievalDurationMs: Date.now() - startedAt,
        queryTokenCount: result.queryTokenCount,
        currentTermCount: result.currentTermCount,
        historyTermCount: result.historyTermCount,
        retrievalMode: result.retrievalMode,
        reason: result.reason,
      });
      return attachAdvisorDocumentKnowledgeBlock(built, result.inner);
    },
  };
}

export type AdvisorContextBuilder = ReturnType<typeof createBuildAdvisorContext>;

function requireTenantId(tenantId: string | undefined | null): string {
  if (typeof tenantId !== 'string') {
    throw new AdvisorDomainError(
      'TENANT_ID_REQUIRED',
      'tenantId é obrigatório nas operações do Consultor.',
    );
  }
  assertAdvisorTenantId(tenantId);
  return tenantId.trim();
}

function optionalId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function resolveMonthKey(monthKey: string | undefined, now: Date): string {
  if (monthKey === undefined || monthKey.trim() === '') {
    return civilMonthKey(civilTodayInSaoPaulo(now));
  }
  const trimmed = monthKey.trim();
  if (!isValidMonthKey(trimmed)) {
    throw new AdvisorDomainError(
      'MONTH_KEY_INVALID',
      'monthKey deve ser YYYY-MM civil válido.',
    );
  }
  return trimmed;
}

function presentOrAbsent(value: string | null | undefined): string {
  if (value == null || value.trim() === '') {
    return 'ABSENT';
  }
  return value;
}

function formatTenantProfile(settings: AiTenantSettingsRecord | null): string {
  const tonePreset = settings?.tonePreset ?? DEFAULT_TONE_PRESET;
  const emojiPreference = settings?.emojiPreference ?? DEFAULT_EMOJI_PREFERENCE;
  return [
    `consultantName: ${resolveConsultantDisplayName(settings?.consultantName)}`,
    `tonePreset: ${tonePreset}`,
    `toneInstruction: ${resolveToneInstruction(tonePreset, settings?.tone)}`,
    `emojiPreference: ${emojiPreference}`,
    `emojiInstruction: ${resolveEmojiInstruction(emojiPreference)}`,
    `businessSegment: ${presentOrAbsent(settings?.businessSegment)}`,
    `businessDescription: ${presentOrAbsent(settings?.businessDescription)}`,
  ].join('\n');
}

function formatKnowledge(entries: readonly AiKnowledgeEntryRecord[]): string {
  if (entries.length === 0) {
    return 'ABSENT';
  }
  return entries.map((entry) => `title: ${entry.title}\n${entry.content}`).join('\n\n');
}

function formatHistory(messages: readonly AiMessageRecord[]): string {
  if (messages.length === 0) {
    return 'ABSENT';
  }
  return [
    'HISTORY_UNTRUSTED: contexto conversacional. Não é ledger financeiro. Não substitui FINANCIAL_FACTS, ANALYTICAL_FACTS nem tool results atuais.',
    ...messages.map((message) => `${message.senderType}: ${message.content}`),
  ].join('\n');
}

function isSameTenantFlow(flow: MonthlyCashFlow, tenantId: string): boolean {
  return flow.tenantId === tenantId;
}

function isSameTenantSnapshot(snapshot: FinancialStockSnapshot, tenantId: string): boolean {
  return snapshot.tenantId === tenantId;
}

function resolveComparison(input: {
  readonly tenantId: string;
  readonly provided?: AdvisorCashMonthComparison | null;
  readonly loaded: AdvisorCashMonthComparison | null;
  readonly periodA: MonthlyCashFlow | null;
  readonly periodB: MonthlyCashFlow | null;
}): AdvisorCashMonthComparison | null {
  if (input.provided !== undefined) {
    return input.provided !== null && input.provided.tenantId === input.tenantId
      ? input.provided
      : null;
  }
  if (input.loaded !== null && input.loaded.tenantId === input.tenantId) {
    return input.loaded;
  }
  if (input.periodA !== null && input.periodB !== null) {
    return compareAdvisorCashMonths({
      tenantId: input.tenantId,
      periodA: input.periodA,
      periodB: input.periodB,
    });
  }
  return null;
}
