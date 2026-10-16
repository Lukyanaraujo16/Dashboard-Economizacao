import type { IaProviderRegistry } from '../../../infrastructure/ai/ia-provider-registry.js';
import {
  IaProviderError,
  type GenerationInput,
  type GenerationOutput,
  type GenerationUsage,
  type IaToolRound,
} from '../../../infrastructure/ai/types.js';
import {
  IntegrationUnavailableError,
  RateLimitedError,
} from '../../../shared/errors/application-error.js';
import {
  ADVISOR_MAX_TOOL_ROUNDS,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  type AdvisorAnalyticalToolExecutor,
  type AdvisorCashComparisonService,
} from '../domain/advisor-analytical-tools.js';
import { serializeAdvisorMonthlyComparisonFacts } from '../domain/compare-advisor-cash-months.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { deriveConsultantConversationTitle } from '../domain/conversation-title.js';
import { resolveAdvisorConversationalPeriod } from '../domain/resolve-advisor-conversational-period.js';
import { resolveAdvisorDrilldownIntent } from '../domain/resolve-advisor-drilldown-intent.js';
import { resolveAdvisorConversationalNominal } from '../domain/resolve-advisor-conversational-nominal.js';
import { resolveAdvisorNominalIntent } from '../domain/resolve-advisor-nominal-intent.js';
import {
  composeCapabilityDeniedAnswer,
  resolveUniversalAnalyticalIntent,
} from '../domain/resolve-universal-analytical-intent.js';
import { isAdvisorInterpretiveQuestion } from '../domain/classify-advisor-factual-response.js';
import { runAdvisorMonthlyPlanning } from '../domain/run-advisor-monthly-planning.js';
import { runAdvisorBillingAnswer } from '../domain/run-advisor-billing-answer.js';
import { runAdvisorBillingCostCenterAnswer } from '../domain/run-advisor-billing-cost-center-answer.js';
import {
  extractAdvisorBillingCostCenterMention,
  resolveAdvisorBillingIntent,
  resolveAdvisorBillingIntentForCostCenter,
} from '../domain/resolve-advisor-billing-intent.js';
import { runAdvisorDailyCashMovement } from '../domain/run-advisor-daily-cash-movement.js';
import type { CashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { MonthlyPlanningServices } from '../domain/load-monthly-planning-fact.js';
import { executeAnalyticalQuery } from '../domain/analytical/execute-analytical-query.js';
import { validateAnalyticalCapability } from '../domain/analytical/validate-analytical-capability.js';
import {
  type AnalyticalConversationState,
} from '../domain/analytical-conversation-state.js';
import {
  composeOrdinalAnswer,
  resolveCounterpartyFollowUp,
} from '../domain/resolve-counterparty-follow-up.js';
import type { AnalyticalQuery } from '../domain/analytical/analytical-query.js';
import type { CounterpartyIdentityService } from '../domain/load-counterparty-identity-population.js';
import {
  ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
} from '../domain/advisor-current-snapshot-facts.js';
import {
  ADVISOR_FACTUAL_COMPOSER_VERSION,
  composeAdvisorFactualAnswer,
  type AdvisorFactualAnswerMeta,
} from '../domain/compose-advisor-factual-answer.js';
import { resolveAdvisorCurrentSnapshotIntent } from '../domain/resolve-advisor-current-snapshot-intent.js';
import { resolveAdvisorCostCenterIntent } from '../domain/resolve-advisor-cost-center-intent.js';
import { resolveAdvisorConversationalCostCenter } from '../domain/resolve-advisor-conversational-cost-center.js';
import { loadAnalyticalCostCenterCatalog } from '../domain/load-analytical-cost-center-catalog.js';
import {
  answerCostCenterEntityComparison,
  isCostCenterEntityComparisonQuestion,
} from '../domain/plan-cost-center-entity-comparison.js';
import { assembleCostCenterOutflowMovementsPlan } from '../domain/assemble-cost-center-outflow-movements-plan.js';
import {
  costCenterOutflowMovementsState,
} from '../domain/cost-center-outflow-movements-conversation-state.js';
import {
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
  type AdvisorConversationBag,
} from '../domain/advisor-conversation-bag.js';
import { applyAnalyticalDimensionPatch } from '../domain/analytical-dimension-patch.js';
import {
  classifyAnalyticalContinuity,
  describeUnsupportedPeriod,
} from '../domain/classify-analytical-continuity.js';
import {
  lastAnalyticalQueryFromBilling,
  lastAnalyticalQueryFromCostCenterMovements,
} from '../domain/build-last-analytical-query-from-answer.js';
import { runAnalyticalContinuityAnswer } from '../domain/run-analytical-continuity-answer.js';
import {
  resolveSemanticAnalyticalContinuity,
  shouldAttemptSemanticContinuity,
} from '../domain/resolve-semantic-analytical-continuity.js';
import {
  applyPendingPatch,
  buildPendingAlternativesClarification,
  isPendingActionExecutable,
  isPendingAlternativesOffer,
  markPendingConsumed,
  markPendingExpired,
  markPendingRejected,
  materializePendingAlternative,
  pendingActionHasSnapshotPreloadStep,
  type PendingAnalyticalAction,
} from '../domain/pending-analytical-action.js';
import {
  extractPendingAnalyticalActionFromOffer,
  resolvePendingAnalyticalActionDecision,
} from '../domain/pending-analytical-action-classify.js';
import {
  buildPendingActionComposeBlocks,
  executePendingAnalyticalAction,
  pendingActionCompositionFallback,
  pendingAnswerLooksLikeTechnicalDump,
} from '../domain/pending-analytical-action-execute.js';
import {
  isReplyEligibleForPendingExtract,
  type PendingExtractPathKind,
} from '../domain/pending-extract-eligibility.js';
import {
  extractUserAnalyticalAssumption,
  isEligibleForUserAssumptionExtract,
} from '../domain/user-assumption-classify.js';
import {
  buildDerivedScenarioEvidence,
  serializeUserAssumptionsEvidenceBlock,
} from '../domain/user-assumption-scenario.js';
import {
  listActiveUserAssumptions,
  type UserAnalyticalAssumption,
} from '../domain/user-analytical-assumption.js';
import {
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
  COMPARE_CASH_COST_CENTER_TOOL_NAME,
  readAdvisorCostCenterRankingWinner,
} from '../domain/advisor-cost-center-dimension.js';
import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
  readAdvisorNominalRankingWinner,
} from '../domain/advisor-nominal-dimension.js';
import { assertAllowedAiModel } from '../domain/ai-provider-models.js';
import {
  answerSourceFromIntent,
  classifyAnalyticalOutcome,
  signalFromCounterparty,
  signalFromDailyStatus,
  unresolvedFromTraces,
  type AnalyticalAnswerSource,
  type AnalyticalOutcome,
  type AnalyticalTrailFacts,
} from '../domain/classify-analytical-outcome.js';
import {
  deriveAnalyticalToolTrace,
  readStructuredStatus,
  type AnalyticalToolTraceDraft,
} from '../domain/derive-analytical-tool-trace.js';
import { advisorTextLooksLikeLatexMath } from '../domain/advisor-formula-presentation.js';
import {
  applyAdvisorEvidenceBoundRewrite,
  gateAdvisorEvidenceBoundAnswer,
  inferEvidenceEntityScope,
  normalizeAdvisorToolCallFingerprint,
  resolveAdvisorNumericEvidenceMode,
  type AdvisorEvidenceItem,
} from '../domain/advisor-evidence-bound-answer.js';
import {
  buildAnalyticalCompletionFeedback,
  buildAnalyticalPartialLimitationText,
  deriveAnalyticalObligations,
  evaluateAnalyticalCompletion,
  type AnalyticalCompletionState,
  type AnalyticalObligation,
  type AnalyticalToolEvidence,
} from '../domain/advisor-analytical-completion.js';
import {
  canDeterministicPathFullyAnswer,
  deriveQuestionAnalyticalDemand,
  deterministicPathCapabilityFromComposer,
  type AdvisorQuestionAnalyticalDemand,
  type ExplicitCostCenterScope,
} from '../domain/advisor-question-scope.js';
import {
  CONSULTANT_PLATFORM_LIMIT_MESSAGE,
  CONSULTANT_UNAVAILABLE_MESSAGE,
  type ConsultantRateLimiter,
} from '../domain/consultant-rate-limit.js';
import type {
  AiMessageRecord,
  AiRunErrorCode,
  AiRunRecord,
  AiRunStatus,
  AiTenantSettingsRecord,
} from '../domain/types.js';
import {
  COST_CENTER_MOVEMENTS_WINDOW_FACT_KIND,
  composeCostCenterMovementsWindowAnswer,
  runCostCenterMovementsWindow,
} from '../domain/cost-center-movements-window.js';
import { interpretAdvisorQuestion } from '../domain/advisor-question-interpretation.js';

import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
import type { AdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import type { AdvisorAnalyticalResultRepository } from '../repositories/advisor-analytical-result.repository.js';
import type { AdvisorRunRepository } from '../repositories/advisor-run.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type { AdvisorContextBuilder } from './build-advisor-context.js';

const CONSULTANT_REPLY_MAX_CHARS = 20_000;

export type SendAdvisorMessageInput = {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly question: string;
  readonly monthKey?: string;
  readonly now?: Date;
};

export type SendAdvisorMessageResult = {
  readonly conversationId: string;
  readonly userMessage: AiMessageRecord;
  readonly consultantMessage: AiMessageRecord;
  readonly run: AiRunRecord | null;
  readonly factualAnswer: AdvisorFactualAnswerMeta | null;
  readonly analyticalOutcome: AnalyticalOutcome;
};

export class AdvisorExecutionError extends AdvisorDomainError {
  readonly run: AiRunRecord;
  readonly userMessage: AiMessageRecord;

  constructor(code: string, message: string, run: AiRunRecord, userMessage: AiMessageRecord) {
    super(code, message);
    this.name = 'AdvisorExecutionError';
    this.run = run;
    this.userMessage = userMessage;
  }
}

export type SendAdvisorMessageDependencies = {
  readonly settings: Pick<AdvisorSettingsRepository, 'findSettingsByTenant'>;
  readonly conversations: Pick<
    AdvisorConversationRepository,
    | 'findConversation'
    | 'createMessage'
    | 'updateConversationTitle'
    | 'listMessages'
    | 'saveAnalyticalContext'
  >;
  readonly runs: Pick<AdvisorRunRepository, 'createRun' | 'updateRun'>;
  readonly analyticalResults?: Pick<AdvisorAnalyticalResultRepository, 'record'>;
  readonly context: AdvisorContextBuilder;
  readonly providers: IaProviderRegistry;
  readonly rateLimiter: ConsultantRateLimiter;
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
  readonly cashComparison?: AdvisorCashComparisonService;
  readonly counterpartyIdentity?: CounterpartyIdentityService;
  readonly monthlyPlanning?: MonthlyPlanningServices;
  readonly dailyCashMovements?: {
    readonly details: Pick<CashRealizedDetailsService, 'getCashRealizedDayDetails'>;
    readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
  };
};

/**
 * Caso de uso reativo. Rate limit da plataforma ocorre antes do contexto e do provider.
 * Comparação já resolvida é pré-carregada. Tools têm teto de rodadas.
 */
export function createSendAdvisorMessage(deps: SendAdvisorMessageDependencies) {
  return {
    async execute(input: SendAdvisorMessageInput): Promise<SendAdvisorMessageResult> {
      assertAdvisorTenantId(input.tenantId);
      const tenantId = input.tenantId.trim();
      const userId = requireId(input.userId, 'USER_ID_REQUIRED', 'userId é obrigatório na conversa do Consultor.');
      const conversationId = requireId(
        input.conversationId,
        'CONVERSATION_ID_REQUIRED',
        'conversationId é obrigatório.',
      );
      const question = requireText(input.question, 'QUESTION_REQUIRED', 'Pergunta do usuário é obrigatória.');

      const settings = await deps.settings.findSettingsByTenant(tenantId);
      const ready = requireActiveSettings(settings, tenantId);
      const model = assertAllowedAiModel(ready.provider, ready.model);

      const conversation = await deps.conversations.findConversation(tenantId, userId, conversationId);
      if (conversation === null || conversation.tenantId !== tenantId || conversation.userId !== userId) {
        throw new AdvisorDomainError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada neste tenant.');
      }

      const limit = await deps.rateLimiter.consume({ tenantId, userId });
      if (limit.ok === false && limit.kind === 'store_unavailable') {
        await persistBlockedRun(deps.runs, {
          tenantId,
          userId,
          conversationId: conversation.id,
          provider: ready.provider,
          model,
          status: 'FAILED',
          errorCode: 'UNKNOWN',
        });
        throw new IntegrationUnavailableError(CONSULTANT_UNAVAILABLE_MESSAGE);
      }
      if (limit.ok === false && limit.kind === 'limit') {
        await persistBlockedRun(deps.runs, {
          tenantId,
          userId,
          conversationId: conversation.id,
          provider: ready.provider,
          model,
          status: 'LIMIT_BLOCKED',
          errorCode: 'RATE_LIMIT',
        });
        throw new RateLimitedError(CONSULTANT_PLATFORM_LIMIT_MESSAGE);
      }

      const userMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
        senderType: 'USER',
        content: question,
      });
      const trailStartedAt = Date.now();
      const recordTrail = async (input: {
        readonly consultantMessageId: string | null;
        readonly runId: string | null;
        readonly answerSource: AnalyticalAnswerSource;
        readonly toolRoundCount: number;
        readonly traces: readonly AnalyticalToolTraceDraft[];
        readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
      }): Promise<AnalyticalOutcome> => {
        const outcome = classifyAnalyticalOutcome({ ...input.facts, traces: input.traces });
        const unresolved = unresolvedFromTraces(input.traces);
        if (deps.analyticalResults) {
          await deps.analyticalResults.record(tenantId, {
            conversationId: conversation.id,
            userMessageId: userMessage.id,
            consultantMessageId: input.consultantMessageId,
            runId: input.runId,
            outcome,
            answerSource: input.answerSource,
            toolCallCount: input.traces.length,
            toolRoundCount: input.toolRoundCount,
            unresolvedDimension: unresolved?.dimension ?? null,
            unresolvedEntity: unresolved?.entity ?? null,
            durationMs: Date.now() - trailStartedAt,
            traces: input.traces.map((trace) => ({
              round: trace.round,
              toolName: trace.toolName,
              known: trace.known,
              status: trace.status,
              reason: trace.reason,
              durationMs: trace.durationMs,
              resultCardinality: trace.resultCardinality,
            })),
          });
        }
        return outcome;
      };

      if (conversation.title === null) {
        await deps.conversations.updateConversationTitle(
          tenantId,
          conversation.id,
          deriveConsultantConversationTitle(question),
        );
      }

      const history = await deps.conversations.listMessages(tenantId, conversation.id);
      const priorUserContents = history
        .filter(
          (item) =>
            item.tenantId === tenantId &&
            item.conversationId === conversation.id &&
            item.senderType === 'USER' &&
            item.id !== userMessage.id,
        )
        .map((item) => item.content);
      const period = resolveAdvisorConversationalPeriod({
        content: question,
        referenceMonthKey: input.monthKey,
        now: input.now,
        priorUserContents,
      });
      const scopeCatalog =
        deps.dailyCashMovements === undefined
          ? []
          : (
              await loadAnalyticalCostCenterCatalog(tenantId, deps.dailyCashMovements.costCenters)
            ).map((row) => ({
              id: row.id,
              name: row.name,
              code: row.code,
            }));
      const questionDemand = deriveQuestionAnalyticalDemand({
        content: question,
        comparison: period.comparison,
        catalog: scopeCatalog,
      });
      const questionToolScope = toQuestionToolScope(questionDemand.explicitCostCenter);
      console.info(
        JSON.stringify({
          event: 'advisor_period_resolved',
          tenantId,
          conversationId: conversation.id,
          monthKey: period.monthKey,
          source: period.source,
          comparison: period.comparison,
          comparisonMonthKey: period.comparisonMonthKey ?? null,
          explicitCostCenterStatus: questionDemand.explicitCostCenter.status,
        }),
      );

      let conversationBag = parseAdvisorConversationBag(conversation.analyticalContext);
      const persistBag = async (next: AdvisorConversationBag): Promise<void> => {
        await deps.conversations.saveAnalyticalContext(
          tenantId,
          conversation.id,
          serializeAdvisorConversationBag(next) as never,
        );
        conversationBag = next;
      };
      /** Finalização comum B.1.1: extract semântico após resposta analítica elegível. */
      const afterAnalyticalReply = async (
        consultantMessage: AiMessageRecord,
        answerSource: AnalyticalAnswerSource,
        toolEvidence?: readonly {
          readonly toolName: string;
          readonly ok: boolean;
          readonly contentPreview: string;
        }[],
      ): Promise<void> => {
        await maybePersistPendingOfferFromAssistant({
          deps,
          tenantId,
          conversationId: conversation.id,
          consultantMessageId: consultantMessage.id,
          assistantText: consultantMessage.content,
          resolvedMonthKey: period.monthKey,
          providerId: ready.provider,
          model,
          conversationBag,
          persistBag,
          now: input.now,
          answerSource,
          pathKind: 'ANALYTICAL',
          toolEvidence,
        });
      };

      const pendingGate = await tryHandlePendingAnalyticalAction({
        deps,
        tenantId,
        userId,
        conversationId: conversation.id,
        question,
        periodMonthKey: period.monthKey,
        now: input.now,
        readyProvider: ready.provider,
        readyModel: model,
        conversationBag,
        persistBag,
        userMessage,
        recordTrail,
      });
      if (pendingGate !== null) {
        return pendingGate;
      }

      // Marco A2 — interpretação canônica, calculada uma vez e repassada aos handlers.
      // "nesse período" herda o período da investigação mais recente (last, senão C.1).
      const priorMovementsState = conversationBag.slots.costCenterOutflowMovements;
      const inheritedPeriod =
        conversationBag.slots.lastAnalyticalQuery?.query.period ??
        (priorMovementsState === null
          ? null
          : priorMovementsState.windowMonths !== undefined
            ? {
                kind: 'MONTH_WINDOW' as const,
                endMonthKey: priorMovementsState.monthKey,
                count: priorMovementsState.windowMonths,
              }
            : { kind: 'MONTH' as const, monthKey: priorMovementsState.monthKey });
      const interpretation = interpretAdvisorQuestion({
        content: question,
        conversationalPeriod: period,
        demand: questionDemand,
        inheritedPeriod,
        referenceMonthKey: input.monthKey,
        now: input.now,
      });

      // Marco A2 — invalidação centralizada (política C.2.7): uma NEW_QUERY explícita
      // invalida o last antes de qualquer handler de família, para que uma falha
      // posterior não deixe o contexto antigo vivo para o próximo "E de X?".
      const priorLastQuery = conversationBag.slots.lastAnalyticalQuery;
      if (priorLastQuery !== null && !isAdvisorInterpretiveQuestion(question)) {
        const probe = classifyAnalyticalContinuity({
          content: question,
          period,
          prior: priorLastQuery,
        });
        if (probe.decision === 'NEW_QUERY') {
          await persistBag(
            mergeAdvisorConversationBag(conversationBag, { lastAnalyticalQuery: null }),
          );
        }
      }

      // Premissas explícitas do usuário (cenário) — só quando há magnitude estrutural.
      if (isEligibleForUserAssumptionExtract({ userMessage: question })) {
        const recentConsultant = [...history]
          .reverse()
          .find(
            (item) =>
              item.senderType === 'CONSULTANT' &&
              item.conversationId === conversation.id &&
              item.tenantId === tenantId,
          );
        try {
          const provider = deps.providers.resolve(ready.provider);
          if (provider.id === ready.provider) {
            const extracted = await extractUserAnalyticalAssumption({
              provider,
              providerId: ready.provider,
              model,
              tenantId,
              userMessage: question,
              createdFromMessageId: userMessage.id,
              existingAssumptions: conversationBag.slots.userAssumptions,
              recentConsultantSnippet: recentConsultant?.content ?? null,
              now: input.now,
            });
            if (extracted.decision === 'USER_ASSUMPTION') {
              await persistBag(
                mergeAdvisorConversationBag(conversationBag, {
                  userAssumptions: extracted.assumptions,
                }),
              );
              console.info(
                JSON.stringify({
                  event: 'advisor_user_assumption_extracted',
                  tenantId,
                  conversationId: conversation.id,
                  assumptionId: extracted.assumption.id,
                  valueKind: extracted.assumption.valueKind,
                  cadence: extracted.assumption.cadence,
                  role: extracted.assumption.role,
                  extraProviderCalls: 1,
                }),
              );
            } else {
              console.info(
                JSON.stringify({
                  event: 'advisor_user_assumption_extracted',
                  tenantId,
                  conversationId: conversation.id,
                  decision: 'NO_ASSUMPTION',
                  extraProviderCalls: 1,
                }),
              );
            }
          }
        } catch (error) {
          console.info(
            JSON.stringify({
              event: 'advisor_user_assumption_extract_failed',
              tenantId,
              conversationId: conversation.id,
              message: error instanceof Error ? error.message : 'unknown',
            }),
          );
        }
      }

      const priorState = conversationBag.slots.counterparty;
      if (
        questionDemand.wantsAccountingProfit &&
        !isAdvisorInterpretiveQuestion(question)
      ) {
        const content =
          'Não tenho um indicador oficial de lucro contábil (competência) nesta base. O resultado de caixa realizado não substitui lucro líquido, lucro contábil, EBITDA nem margem.';
        const consultantMessage = await deps.conversations.createMessage(
          tenantId,
          conversation.id,
          { senderType: 'CONSULTANT', content },
        );
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: 'CAPABILITY_DENIED',
          toolRoundCount: 0,
          traces: [],
          facts: closedTrailFacts('UNAVAILABLE'),
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run: null,
          factualAnswer: {
            classification: 'FACTUAL_CLOSED',
            providerCalled: false,
            intentKind: 'FACTUAL_LIMITATION',
            factKind: null,
            identityStatus: null,
            returnedCount: null,
            coveragePercent: null,
            composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
          },
          analyticalOutcome,
        };
      }
      if (deps.monthlyPlanning !== undefined && !isAdvisorInterpretiveQuestion(question)) {
        const planned = await runAdvisorMonthlyPlanning({
          content: question,
          monthKey: period.monthKey,
          runtime: {
            tenantId,
            now: input.now,
            planningCashFlow: deps.monthlyPlanning.cashFlow,
            revenueGoals: deps.monthlyPlanning.revenueGoals,
            expenseCeilings: deps.monthlyPlanning.expenseCeilings,
          },
        });
        if (planned !== null) {
          const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
            senderType: 'CONSULTANT',
            content: planned.answer,
          });
          const analyticalOutcome = await recordTrail({
            consultantMessageId: consultantMessage.id,
            runId: null,
            answerSource: 'PLANNING',
            toolRoundCount: 0,
            traces: [],
            facts: closedTrailFacts('OK'),
          });
          return {
            conversationId: conversation.id,
            userMessage,
            consultantMessage,
            run: null,
            factualAnswer: {
              classification: 'FACTUAL_CLOSED',
              providerCalled: false,
              intentKind: 'MONTHLY_PLANNING',
              factKind: 'MONTHLY_PLANNING',
              identityStatus: null,
              returnedCount: null,
              coveragePercent: null,
              composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
            },
            analyticalOutcome,
          };
        }
      }
      if (deps.monthlyPlanning !== undefined && !isAdvisorInterpretiveQuestion(question)) {
        const billingCcScope = questionDemand.explicitCostCenter;
        const billingForCostCenter = resolveAdvisorBillingIntentForCostCenter(question);
        const billingTenant = resolveAdvisorBillingIntent(question);
        const billingCcMention =
          billingCcScope.status === 'FOUND' || billingCcScope.status === 'AMBIGUOUS'
            ? billingCcScope.query
            : extractAdvisorBillingCostCenterMention(question);
        const wantsBillingCostCenter =
          billingForCostCenter !== null &&
          (billingCcScope.status === 'FOUND' ||
            billingCcScope.status === 'AMBIGUOUS' ||
            billingCcMention !== null);

        if (wantsBillingCostCenter) {
          if (billingCcScope.status === 'AMBIGUOUS') {
            const content =
              'Há mais de um centro de custo correspondente. Especifique o nome ou o código.';
            const consultantMessage = await deps.conversations.createMessage(
              tenantId,
              conversation.id,
              { senderType: 'CONSULTANT', content },
            );
            const analyticalOutcome = await recordTrail({
              consultantMessageId: consultantMessage.id,
              runId: null,
              answerSource: 'BILLING',
              toolRoundCount: 0,
              traces: [],
              facts: {
                ...closedTrailFacts('AMBIGUOUS'),
                clarificationRequired: true,
              },
            });
            return {
              conversationId: conversation.id,
              userMessage,
              consultantMessage,
              run: null,
              factualAnswer: {
                classification: 'FACTUAL_CLOSED',
                providerCalled: false,
                intentKind: 'FACTUAL_LIMITATION',
                factKind: 'BILLING_COST_CENTER_MONTH',
                identityStatus: null,
                returnedCount: null,
                coveragePercent: null,
                composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
              },
              analyticalOutcome,
            };
          }

          if (deps.dailyCashMovements === undefined) {
            const content =
              'Não consigo consultar o faturamento oficial por centro de custo neste momento (catálogo indisponível).';
            const consultantMessage = await deps.conversations.createMessage(
              tenantId,
              conversation.id,
              { senderType: 'CONSULTANT', content },
            );
            const analyticalOutcome = await recordTrail({
              consultantMessageId: consultantMessage.id,
              runId: null,
              answerSource: 'BILLING',
              toolRoundCount: 0,
              traces: [],
              facts: closedTrailFacts('UNAVAILABLE'),
            });
            return {
              conversationId: conversation.id,
              userMessage,
              consultantMessage,
              run: null,
              factualAnswer: {
                classification: 'FACTUAL_CLOSED',
                providerCalled: false,
                intentKind: 'FACTUAL_LIMITATION',
                factKind: 'BILLING_COST_CENTER_MONTH',
                identityStatus: null,
                returnedCount: null,
                coveragePercent: null,
                composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
              },
              analyticalOutcome,
            };
          }

          const costCenterQueryForBilling =
            billingCcScope.status === 'FOUND'
              ? billingCcScope.query
              : (billingCcMention ?? '');
          // Sem menção resolvível: não inventa consolidado neste ramo.
          if (costCenterQueryForBilling !== '') {
            const billingCc = await runAdvisorBillingCostCenterAnswer({
              content: question,
              tenantId,
              monthKey: period.monthKey,
              costCenterQuery: costCenterQueryForBilling,
              now: input.now,
              cashFlow: deps.monthlyPlanning.cashFlow,
              costCenters: deps.dailyCashMovements.costCenters,
            });
            if (billingCc !== null) {
              const consultantMessage = await deps.conversations.createMessage(
                tenantId,
                conversation.id,
                { senderType: 'CONSULTANT', content: billingCc.answer },
              );
              const billingSource: AnalyticalAnswerSource =
                billingCc.intentKind === 'BILLING_SERIES' ? 'BILLING_SERIES' : 'BILLING';
              const analyticalOutcome = await recordTrail({
                consultantMessageId: consultantMessage.id,
                runId: null,
                answerSource: billingSource,
                toolRoundCount: 0,
                traces: [],
                facts: closedTrailFacts(billingCc.structuredStatus),
              });
              // UNAVAILABLE / NOT_FOUND / AMBIGUOUS não promovem last — só OK.
              if (billingCc.structuredStatus === 'OK') {
                const billingCcLast = lastAnalyticalQueryFromBilling({
                  capabilityKey: billingCc.capabilityKey,
                  monthKey: period.monthKey,
                  count:
                    billingForCostCenter?.kind === 'MONTH_SERIES'
                      ? billingForCostCenter.count
                      : undefined,
                  costCenterQuery: costCenterQueryForBilling,
                  structuredStatus: 'OK',
                });
                if (billingCcLast !== null) {
                  await persistBag(
                    mergeAdvisorConversationBag(conversationBag, {
                      lastAnalyticalQuery: billingCcLast,
                    }),
                  );
                }
              }
              return {
                conversationId: conversation.id,
                userMessage,
                consultantMessage,
                run: null,
                factualAnswer: {
                  classification: 'FACTUAL_CLOSED',
                  providerCalled: false,
                  intentKind: billingCc.intentKind,
                  factKind: billingCc.factKind,
                  identityStatus: null,
                  returnedCount: null,
                  coveragePercent: null,
                  composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
                },
                analyticalOutcome,
              };
            }
          }
        } else if (
          billingTenant !== null &&
          billingCcScope.status === 'ABSENT' &&
          billingCcMention === null
        ) {
          const billing = await runAdvisorBillingAnswer({
            content: question,
            tenantId,
            monthKey: period.monthKey,
            now: input.now,
            cashFlow: deps.monthlyPlanning.cashFlow,
          });
          if (billing !== null) {
            const consultantMessage = await deps.conversations.createMessage(
              tenantId,
              conversation.id,
              {
                senderType: 'CONSULTANT',
                content: billing.answer,
              },
            );
            const billingSource: AnalyticalAnswerSource =
              billing.intentKind === 'BILLING_SERIES' ? 'BILLING_SERIES' : 'BILLING';
            const analyticalOutcome = await recordTrail({
              consultantMessageId: consultantMessage.id,
              runId: null,
              answerSource: billingSource,
              toolRoundCount: 0,
              traces: [],
              facts: closedTrailFacts('OK'),
            });
            const billingLast = lastAnalyticalQueryFromBilling({
              capabilityKey: billing.capabilityKey,
              monthKey: period.monthKey,
              count:
                billingTenant.kind === 'MONTH_SERIES' ? billingTenant.count : undefined,
              structuredStatus: 'OK',
            });
            if (billingLast !== null) {
              await persistBag(
                mergeAdvisorConversationBag(conversationBag, {
                  lastAnalyticalQuery: billingLast,
                }),
              );
            }
            return {
              conversationId: conversation.id,
              userMessage,
              consultantMessage,
              run: null,
              factualAnswer: {
                classification: 'FACTUAL_CLOSED',
                providerCalled: false,
                intentKind: billing.intentKind,
                factKind: billing.factKind,
                identityStatus: null,
                returnedCount: null,
                coveragePercent: null,
                composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
              },
              analyticalOutcome,
            };
          }
        }
      }
      if (deps.dailyCashMovements !== undefined && !isAdvisorInterpretiveQuestion(question)) {
        const daily = await runAdvisorDailyCashMovement({
          content: question,
          referenceMonthKey: period.monthKey,
          now: input.now,
          priorState: conversationBag.slots.dailyCashMovement,
          tenantId,
          details: deps.dailyCashMovements.details,
          costCenters: deps.dailyCashMovements.costCenters,
        });
        if (daily !== null) {
          if (daily.state !== null) {
            await persistBag(
              mergeAdvisorConversationBag(conversationBag, {
                dailyCashMovement: daily.state,
              }),
            );
          }
          const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
            senderType: 'CONSULTANT',
            content: daily.answer,
          });
          const dailyFacts = signalFromDailyStatus(daily.analyticalStatus);
          const analyticalOutcome = await recordTrail({
            consultantMessageId: consultantMessage.id,
            runId: null,
            answerSource: 'DAILY_CASH_MOVEMENT',
            toolRoundCount: 0,
            traces: [],
            facts: {
              providerFailed: false,
              capabilityDenied: false,
              ...dailyFacts,
            },
          });
          return {
            conversationId: conversation.id,
            userMessage,
            consultantMessage,
            run: null,
            factualAnswer: {
              classification: 'FACTUAL_CLOSED',
              providerCalled: false,
              intentKind: 'DAILY_CASH_MOVEMENT',
              factKind: 'DAILY_CASH_MOVEMENTS',
              identityStatus: null,
              returnedCount: null,
              coveragePercent: null,
              composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
            },
            analyticalOutcome,
          };
        }
      }
      const universalIntent = resolveUniversalAnalyticalIntent({
        content: question,
        now: input.now,
        referenceMonthKey: input.monthKey,
      });
      if (
        universalIntent.kind === 'RESOLVED' &&
        universalIntent.validation.ok === true &&
        isPartyProfileAnalyticalQuery(universalIntent.query) &&
        !isAdvisorInterpretiveQuestion(question)
      ) {
        return answerCounterpartyQuery({
          deps,
          tenantId,
          conversationId: conversation.id,
          userId,
          userMessage,
          query: universalIntent.query,
          now: input.now,
          existingBag: conversationBag,
          recordTrail,
        });
      }
      if (!isAdvisorInterpretiveQuestion(question)) {
        const followUp = resolveCounterpartyFollowUp({
          content: question,
          state: priorState,
          now: input.now,
          referenceMonthKey: input.monthKey,
        });
        if (followUp.kind === 'CLEAR' && priorState !== null) {
          await persistBag(
            mergeAdvisorConversationBag(conversationBag, { counterparty: null }),
          );
        }
        if (followUp.kind === 'ORDINAL' && priorState !== null) {
          const ordinal = composeOrdinalAnswer({ state: priorState, rank: followUp.rank });
          await persistBag(
            mergeAdvisorConversationBag(conversationBag, {
              counterparty: {
                ...priorState,
                focusDisplayName: ordinal.focusDisplayName,
              },
            }),
          );
          const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
            senderType: 'CONSULTANT',
            content: ordinal.answer,
          });
          const rankFound = priorState.rows.some((row) => row.rank === followUp.rank);
          const analyticalOutcome = await recordTrail({
            consultantMessageId: consultantMessage.id,
            runId: null,
            answerSource: 'COUNTERPARTY',
            toolRoundCount: 0,
            traces: [],
            facts: closedTrailFacts(rankFound ? 'OK' : 'EMPTY_RESULT'),
          });
          return {
            ...closedCounterparty(conversation.id, userMessage, consultantMessage, priorState.decision),
            analyticalOutcome,
          };
        }
        if (followUp.kind === 'QUERY') {
          const validation = validatePartyQuery(followUp.query);
          if (validation) {
            return answerCounterpartyQuery({
              deps,
              tenantId,
              conversationId: conversation.id,
              userId,
              userMessage,
              query: followUp.query,
              now: input.now,
              existingBag: conversationBag,
              recordTrail,
            });
          }
        }
      }
      if (
        universalIntent.kind === 'RESOLVED' &&
        universalIntent.validation.ok === false &&
        !isAdvisorInterpretiveQuestion(question)
      ) {
        const deniedAnswer = composeCapabilityDeniedAnswer({
          query: universalIntent.query,
          validation: universalIntent.validation,
        });
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content: deniedAnswer,
        });
        console.info(
          JSON.stringify({
            event: 'advisor_capability_denied',
            tenantId,
            conversationId: conversation.id,
            reason: universalIntent.validation.reason,
            operation: universalIntent.query.operation,
            dimension: universalIntent.query.dimension ?? null,
            direction: universalIntent.query.direction ?? null,
          }),
        );
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: 'CAPABILITY_DENIED',
          toolRoundCount: 0,
          traces: [],
          facts: {
            providerFailed: false,
            capabilityDenied: true,
            clarificationRequired: false,
            factualClosed: true,
            factualPartial: false,
            structuredStatus: null,
          },
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run: null,
          factualAnswer: {
            classification: 'FACTUAL_CLOSED',
            providerCalled: false,
            intentKind: 'FACTUAL_LIMITATION',
            factKind: null,
            identityStatus: null,
            returnedCount: null,
            coveragePercent: null,
            composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
          },
          analyticalOutcome,
        };
      }

      if (
        deps.dailyCashMovements !== undefined &&
        deps.analyticalTools !== undefined &&
        !isAdvisorInterpretiveQuestion(question) &&
        isCostCenterEntityComparisonQuestion(question)
      ) {
        const catalog = await loadAnalyticalCostCenterCatalog(
          tenantId,
          deps.dailyCashMovements.costCenters,
        );
        const analyticalTools = deps.analyticalTools;
        const compared = await answerCostCenterEntityComparison({
          content: question,
          period: { monthKey: period.monthKey, comparison: period.comparison },
          catalog,
          lookup: async (request) => {
            const result = await analyticalTools.execute({
              tenantId,
              resolvedMonthKey: period.monthKey,
              now: input.now,
              call: {
                id: `cc-entity-${request.costCenterId}`,
                name: request.toolName,
                arguments: {
                  monthKey: request.monthKey,
                  direction: request.direction,
                  costCenterQuery: request.costCenterQuery,
                },
              },
            });
            return {
              ok: result.ok,
              name: result.name,
              content: result.content,
              ...(result.resultCardinality === undefined
                ? {}
                : { resultCardinality: result.resultCardinality }),
            };
          },
        });
        if (compared !== null) {
          const entityAnswer = composeAdvisorFactualAnswer({
            content: question,
            anaphora: 'NONE',
            toolName: compared.plan.toolName,
            toolOk: compared.facts.status === 'OK',
            toolContent: JSON.stringify(compared.facts),
          });
          if (entityAnswer.answer !== null && entityAnswer.meta !== null) {
            const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
              senderType: 'CONSULTANT',
              content: entityAnswer.answer,
            });
            const analyticalOutcome = await recordTrail({
              consultantMessageId: consultantMessage.id,
              runId: null,
              answerSource: 'COST_CENTER',
              toolRoundCount: compared.traces.length > 0 ? 1 : 0,
              traces: compared.traces,
              facts: compared.trail,
            });
            return {
              conversationId: conversation.id,
              userMessage,
              consultantMessage,
              run: null,
              factualAnswer: entityAnswer.meta,
              analyticalOutcome,
            };
          }
        }
      }

      if (!isAdvisorInterpretiveQuestion(question)) {
        const assembled = assembleCostCenterOutflowMovementsPlan({
          content: question,
          period,
          priorState: priorMovementsState,
          interpretation,
        });
        if (assembled.kind !== 'UNMATCHED') {
          const movementsAnswer = await answerCostCenterOutflowMovementsPlan({
            assembled,
            tenantId,
            conversationId: conversation.id,
            question,
            now: input.now,
            analyticalTools: deps.analyticalTools,
            conversations: deps.conversations,
            recordTrail,
            existingBag: conversationBag,
            onBagPersisted: async (next) => {
              conversationBag = next;
            },
          });
          if (movementsAnswer !== null) {
            return {
              conversationId: conversation.id,
              userMessage,
              consultantMessage: movementsAnswer.consultantMessage,
              run: null,
              factualAnswer: movementsAnswer.factualAnswer,
              analyticalOutcome: movementsAnswer.analyticalOutcome,
            };
          }
        }
      }

      // C.2.4/C.2.5 — continuidade tipada sobre lastAnalyticalQuery (após C.1).
      if (
        !isAdvisorInterpretiveQuestion(question) &&
        deps.monthlyPlanning !== undefined
      ) {
        const continuity = await answerAnalyticalContinuityTurn({
          question,
          period,
          tenantId,
          conversationId: conversation.id,
          now: input.now,
          conversationBag,
          persistBag,
          monthlyPlanning: deps.monthlyPlanning,
          dailyCashMovements: deps.dailyCashMovements,
          analyticalTools: deps.analyticalTools,
          providers: deps.providers,
          readyProvider: ready.provider,
          model,
          conversations: deps.conversations,
          recordTrail,
        });
        if (continuity !== null) {
          return {
            conversationId: conversation.id,
            userMessage,
            consultantMessage: continuity.consultantMessage,
            run: null,
            factualAnswer: continuity.factualAnswer,
            analyticalOutcome: continuity.analyticalOutcome,
          };
        }
      }

      // Marco A2.1 — "maior movimentação/lançamento" sem direção é ambíguo
      // (entrada ou saída): esclarece em vez de arriscar resposta financeira.
      if (
        !isAdvisorInterpretiveQuestion(question) &&
        isDirectionlessLargestMovementQuestion(question) &&
        !questionDemand.wantsOutflow &&
        !questionDemand.wantsInflow &&
        !questionDemand.wantsBilling
      ) {
        const content =
          'Você quer o maior lançamento de saída (gasto pago) ou de entrada (recebimento)? Informe a direção para eu consultar o valor oficial.';
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content,
        });
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: 'CAPABILITY_DENIED',
          toolRoundCount: 0,
          traces: [],
          facts: {
            ...closedTrailFacts('UNRESOLVED'),
            clarificationRequired: true,
          },
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run: null,
          factualAnswer: {
            classification: 'FACTUAL_CLOSED',
            providerCalled: false,
            intentKind: 'FACTUAL_LIMITATION',
            factKind: null,
            identityStatus: null,
            returnedCount: null,
            coveragePercent: null,
            composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
          },
          analyticalOutcome,
        };
      }

      // Marco A2 — janela de meses de caixa realizado sem capability determinística:
      // os caminhos seguintes (preload/provider) só fazem bind de UM mês. Não converte a
      // janela em mês em silêncio: limitação explícita (BILLING em janela já foi atendido).
      if (
        !isAdvisorInterpretiveQuestion(question) &&
        interpretation.metric === 'REALIZED_CASH' &&
        interpretation.periodExpression.kind === 'MONTH_WINDOW'
      ) {
        const windowCount = interpretation.periodExpression.count;
        const subject = interpretation.direction === 'INFLOW' ? 'entradas' : 'saídas';
        const content =
          `Ainda não consigo consultar ${subject} de caixa de uma janela de ${windowCount} meses de uma vez nesta pergunta. ` +
          'Consigo responder mês a mês (por exemplo, "em setembro")' +
          (interpretation.direction === 'INFLOW'
            ? '.'
            : ' ou, por centro de custo, apontar os maiores gastos individuais da janela (por exemplo, "qual o maior gasto de <centro> nos últimos 3 meses?").');
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content,
        });
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: 'CAPABILITY_DENIED',
          toolRoundCount: 0,
          traces: [],
          facts: {
            providerFailed: false,
            capabilityDenied: true,
            clarificationRequired: false,
            factualClosed: true,
            factualPartial: false,
            structuredStatus: null,
          },
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run: null,
          factualAnswer: {
            classification: 'FACTUAL_CLOSED',
            providerCalled: false,
            intentKind: 'FACTUAL_LIMITATION',
            factKind: null,
            identityStatus: null,
            returnedCount: null,
            coveragePercent: null,
            composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
          },
          analyticalOutcome,
        };
      }

      const conversationalCostCenter = resolveAdvisorConversationalCostCenter({
        content: question,
        period,
        priorUserContents,
        referenceMonthKey: input.monthKey,
        now: input.now,
      });
      let costCenterFollowUp = conversationalCostCenter.intent;
      let costCenterAnaphora = conversationalCostCenter.anaphora;
      if (
        conversationalCostCenter.needsRankingWinner &&
        (conversationalCostCenter.rankingQuestion === null || deps.analyticalTools === undefined)
      ) {
        costCenterAnaphora = 'UNRESOLVED';
        costCenterFollowUp = null;
      } else if (
        conversationalCostCenter.needsRankingWinner &&
        conversationalCostCenter.rankingQuestion !== null &&
        deps.analyticalTools !== undefined
      ) {
        const rankingPeriod = resolveAdvisorConversationalPeriod({
          content: conversationalCostCenter.rankingQuestion,
          referenceMonthKey: input.monthKey,
          now: input.now,
          priorUserContents,
        });
        const ranked = await deps.analyticalTools.execute({
          tenantId,
          resolvedMonthKey: rankingPeriod.monthKey,
          now: input.now,
          ...(questionToolScope === undefined ? {} : { questionScope: questionToolScope }),
          call: {
            id: 'preload-cost-center-winner',
            name: CASH_COST_CENTER_RANKING_TOOL_NAME,
            arguments: {
              monthKey: rankingPeriod.monthKey,
              direction: costCenterFollowUp?.direction ?? 'OUTFLOW',
            },
          },
        });
        const winner = ranked.ok ? readCostCenterWinnerFromToolContent(ranked.content) : null;
        if (winner !== null && costCenterFollowUp !== null) {
          costCenterFollowUp = {
            ...costCenterFollowUp,
            costCenterQuery: winner.name,
          };
          costCenterAnaphora = 'RESOLVED';
        } else {
          costCenterAnaphora = 'UNRESOLVED';
          costCenterFollowUp = null;
        }
      }
      const costCenterMonthKey =
        conversationalCostCenter.inheritComparisonTarget &&
        conversationalCostCenter.inheritedMonthKey !== null
          ? conversationalCostCenter.inheritedMonthKey
          : period.monthKey;
      const hasCostCenterFollowUp =
        costCenterFollowUp !== null ||
        costCenterAnaphora === 'ORDINAL_UNSUPPORTED' ||
        costCenterAnaphora === 'AMBIGUOUS' ||
        costCenterAnaphora === 'UNRESOLVED';

      const comparison =
        period.comparison &&
        period.comparisonMonthKey !== undefined &&
        deps.cashComparison !== undefined &&
        !hasCostCenterFollowUp &&
        questionDemand.explicitCostCenter.status === 'ABSENT'
          ? await deps.cashComparison.compare({
              tenantId,
              monthKey: period.monthKey,
              comparisonMonthKey: period.comparisonMonthKey,
              now: input.now,
            })
          : undefined;

      const conversationalNominal = hasCostCenterFollowUp
        ? {
            intent: null,
            anaphora: 'NONE' as const,
            needsRankingWinner: false,
            rankingQuestion: null,
          }
        : resolveAdvisorConversationalNominal({
            content: question,
            priorUserContents,
            comparison: period.comparison,
            now: input.now,
          });
      let nominalIntent = conversationalNominal.intent;
      let anaphoraStatus = conversationalNominal.anaphora;
      if (
        conversationalNominal.needsRankingWinner &&
        (conversationalNominal.rankingQuestion === null || deps.analyticalTools === undefined)
      ) {
        anaphoraStatus = 'UNRESOLVED';
      } else if (
        conversationalNominal.needsRankingWinner &&
        conversationalNominal.rankingQuestion !== null &&
        deps.analyticalTools !== undefined
      ) {
        const rankingPeriod = resolveAdvisorConversationalPeriod({
          content: conversationalNominal.rankingQuestion,
          referenceMonthKey: input.monthKey,
          now: input.now,
          priorUserContents,
        });
        const rankingCategory = resolveAdvisorNominalIntent(conversationalNominal.rankingQuestion, {
          now: input.now,
        })?.categoryReference;
        if (rankingCategory === undefined) {
          anaphoraStatus = 'UNRESOLVED';
        } else {
          const ranked = await deps.analyticalTools.execute({
            tenantId,
            resolvedMonthKey: rankingPeriod.monthKey,
            now: input.now,
            call: {
              id: 'preload-nominal-winner',
              name: CASH_NOMINAL_RANKING_TOOL_NAME,
              arguments: {
                monthKey: rankingPeriod.monthKey,
                categoryReference: rankingCategory,
              },
            },
          });
          const winner = ranked.ok ? readWinnerFromToolContent(ranked.content) : null;
          if (winner !== null) {
            nominalIntent = {
              toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
              entityQuery: winner.displayName,
              categoryReference: rankingCategory,
              limit: 5,
            };
            anaphoraStatus = 'RESOLVED';
          } else {
            anaphoraStatus = 'UNRESOLVED';
          }
        }
      }
      const costCenterIntent =
        !hasCostCenterFollowUp &&
        period.comparison === false &&
        nominalIntent === null &&
        anaphoraStatus === 'NONE'
          ? resolveAdvisorCostCenterIntent({ content: question, period })
          : null;
      const drilldownIntent =
        !hasCostCenterFollowUp &&
        costCenterIntent === null &&
        nominalIntent === null &&
        anaphoraStatus === 'NONE' &&
        period.comparison === false
          ? resolveAdvisorDrilldownIntent(question)
          : null;
      const preloadedTool =
        deps.analyticalTools === undefined
          ? null
          : hasCostCenterFollowUp
            ? await preloadCostCenterFollowUp({
                analyticalTools: deps.analyticalTools,
                tenantId,
                period,
                costCenterMonthKey,
                followUp: costCenterFollowUp,
                anaphora: costCenterAnaphora,
                now: input.now,
              })
          : costCenterIntent !== null
            ? await deps.analyticalTools.execute({
                tenantId,
                resolvedMonthKey: period.monthKey,
                now: input.now,
                ...(questionToolScope === undefined ? {} : { questionScope: questionToolScope }),
                call: {
                  id: 'preload-cost-center',
                  name: costCenterIntent.toolName,
                  arguments: {
                    monthKey: period.monthKey,
                    direction: costCenterIntent.direction,
                    ...(costCenterIntent.toolName === CASH_COST_CENTER_RANKING_TOOL_NAME
                      ? { limit: costCenterIntent.limit }
                      : {}),
                    ...(costCenterIntent.toolName === CASH_COST_CENTER_LOOKUP_TOOL_NAME &&
                    costCenterIntent.costCenterQuery !== undefined
                      ? { costCenterQuery: costCenterIntent.costCenterQuery }
                      : {}),
                  },
                },
              })
          : nominalIntent !== null
            ? await deps.analyticalTools.execute({
                tenantId,
                resolvedMonthKey: period.monthKey,
                now: input.now,
                ...(questionToolScope === undefined ? {} : { questionScope: questionToolScope }),
                call: {
                  id: 'preload-nominal',
                  name: nominalIntent.toolName,
                  arguments: {
                    ...(nominalIntent.civilRange !== undefined
                      ? {
                          periodKind: nominalIntent.civilRange.kind,
                          year: nominalIntent.civilRange.year,
                        }
                      : { monthKey: period.monthKey }),
                    ...(nominalIntent.toolName === COMPARE_CASH_NOMINAL_TOOL_NAME &&
                    period.comparisonMonthKey !== undefined
                      ? { comparisonMonthKey: period.comparisonMonthKey }
                      : {}),
                    ...(nominalIntent.categoryReference !== undefined
                      ? { categoryReference: nominalIntent.categoryReference }
                      : {}),
                    ...(nominalIntent.entityQuery !== undefined
                      ? { entityQuery: nominalIntent.entityQuery }
                      : {}),
                    ...(nominalIntent.toolName === CASH_NOMINAL_RANKING_TOOL_NAME ||
                    nominalIntent.toolName === COMPARE_CASH_NOMINAL_TOOL_NAME
                      ? { limit: nominalIntent.limit }
                      : {}),
                  },
                },
              })
            : drilldownIntent !== null
              ? await deps.analyticalTools.execute({
                  tenantId,
                  resolvedMonthKey: period.monthKey,
                  now: input.now,
                  ...(questionToolScope === undefined ? {} : { questionScope: questionToolScope }),
                  call: {
                    id: 'preload-drilldown',
                    name: drilldownIntent.toolName,
                    arguments: {
                      monthKey: period.monthKey,
                      direction: drilldownIntent.direction,
                      limit: drilldownIntent.limit,
                      ...(drilldownIntent.toolName === 'cash_movement_lines'
                        ? { sort: drilldownIntent.sort }
                        : {}),
                    },
                  },
                })
              : anaphoraStatus === 'AMBIGUOUS' || anaphoraStatus === 'UNRESOLVED'
                ? {
                    id: 'preload-nominal-anaphora',
                    name: CASH_NOMINAL_LOOKUP_TOOL_NAME,
                    ok: true,
                    content: JSON.stringify({
                      status: anaphoraStatus,
                      monthKey: period.monthKey,
                      scope: 'PERIOD',
                      reason:
                        anaphoraStatus === 'AMBIGUOUS'
                          ? 'MULTIPLE_NOMINAL_ANTECEDENTS'
                          : 'NO_UNEQUIVOCAL_NOMINAL_ANTECEDENT',
                      entity: null,
                    }),
                    monthKey: period.monthKey,
                  }
                : null;
      const drilldown = preloadedTool;
      const snapshotIntent =
        !hasCostCenterFollowUp &&
        period.comparison === false &&
        nominalIntent === null &&
        anaphoraStatus === 'NONE' &&
        costCenterIntent === null &&
        drilldownIntent === null
          ? resolveAdvisorCurrentSnapshotIntent({ content: question, period })
          : null;

      const built = await deps.context.build({
        tenantId,
        userId,
        conversationId: conversation.id,
        question,
        monthKey: period.monthKey,
        comparisonMonthKey: period.comparison ? period.comparisonMonthKey : undefined,
        comparison: comparison ?? null,
        drilldown:
          drilldown === null
            ? null
            : {
                toolName: drilldown.name,
                monthKey: drilldown.monthKey ?? period.monthKey,
                ok: drilldown.ok,
                content: drilldown.content,
              },
        now: input.now,
      });

      const monthlyComparisonFacts =
        !hasCostCenterFollowUp && comparison !== undefined && comparison !== null
          ? serializeAdvisorMonthlyComparisonFacts(comparison)
          : null;
      const composed = composeAdvisorFactualAnswer({
        content: question,
        anaphora: hasCostCenterFollowUp ? costCenterAnaphora : anaphoraStatus,
        toolName:
          snapshotIntent !== null
            ? ADVISOR_CURRENT_SNAPSHOT_FACT_NAME
            : monthlyComparisonFacts !== null
              ? COMPARE_CASH_MONTHS_TOOL_NAME
              : (drilldown?.name ?? null),
        toolOk:
          snapshotIntent !== null
            ? built.currentSnapshot !== null && built.currentSnapshot !== undefined
            : monthlyComparisonFacts !== null
              ? true
              : (drilldown?.ok ?? false),
        toolContent:
          snapshotIntent !== null && built.currentSnapshot !== null && built.currentSnapshot !== undefined
            ? JSON.stringify({
                ...built.currentSnapshot,
                intentKind: snapshotIntent,
              })
            : monthlyComparisonFacts !== null
              ? JSON.stringify(monthlyComparisonFacts)
              : (drilldown?.content ?? null),
      });
      const composedFullyCovers =
        composed.answer !== null &&
        composed.meta !== null &&
        canDeterministicPathFullyAnswer({
          demand: questionDemand,
          path: deterministicPathCapabilityFromComposer({
            intentKind: composed.meta.intentKind,
            toolName:
              snapshotIntent !== null
                ? ADVISOR_CURRENT_SNAPSHOT_FACT_NAME
                : monthlyComparisonFacts !== null
                  ? COMPARE_CASH_MONTHS_TOOL_NAME
                  : (drilldown?.name ?? null),
            hasCostCenterInFacts: toolContentHasCostCenterScope(
              monthlyComparisonFacts !== null
                ? JSON.stringify(monthlyComparisonFacts)
                : (drilldown?.content ?? null),
            ),
          }),
        });
      if (composed.answer !== null && composed.meta !== null && composedFullyCovers) {
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content: composed.answer,
        });
        console.info(
          JSON.stringify({
            event: 'advisor_factual_answer_composed',
            tenantId,
            conversationId: conversation.id,
            intentKind: composed.meta.intentKind,
            factKind: composed.meta.factKind,
            toolName:
              snapshotIntent !== null
                ? ADVISOR_CURRENT_SNAPSHOT_FACT_NAME
                : monthlyComparisonFacts !== null
                  ? COMPARE_CASH_MONTHS_TOOL_NAME
                  : (drilldown?.name ?? null),
            monthKey: period.monthKey,
            comparisonMonthKey: period.comparisonMonthKey ?? null,
            identityStatus: composed.meta.identityStatus,
            returnedCount: composed.meta.returnedCount,
            coveragePercent: composed.meta.coveragePercent,
            composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
          }),
        );
        const sourceTool =
          snapshotIntent !== null
            ? ADVISOR_CURRENT_SNAPSHOT_FACT_NAME
            : monthlyComparisonFacts !== null
              ? COMPARE_CASH_MONTHS_TOOL_NAME
              : (drilldown?.name ?? null);
        const contentStatus = readStructuredStatus(
          snapshotIntent !== null && built.currentSnapshot !== null && built.currentSnapshot !== undefined
            ? JSON.stringify(built.currentSnapshot)
            : monthlyComparisonFacts !== null
              ? JSON.stringify(monthlyComparisonFacts)
              : (drilldown?.content ?? null),
        );
        const structuredStatus =
          composed.meta.intentKind === 'FACTUAL_LIMITATION'
            ? (contentStatus ?? 'UNRESOLVED')
            : (contentStatus ?? 'OK');
        const composerTrace = drilldown === null ? null : traceFromToolResult(drilldown, 1);
        const composerTraces = composerTrace === null ? [] : [composerTrace];
        const factualAnswerSource = answerSourceFromIntent(
          composed.meta.intentKind === 'FACTUAL_LIMITATION' ? null : composed.meta.intentKind,
          sourceTool,
        );
        await afterAnalyticalReply(
          consultantMessage,
          factualAnswerSource,
          drilldown === null
            ? []
            : [
                {
                  toolName: drilldown.name,
                  ok: drilldown.ok,
                  contentPreview: drilldown.content.slice(0, 240),
                },
              ],
        );
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: factualAnswerSource,
          toolRoundCount: composerTraces.length > 0 ? 1 : 0,
          traces: composerTraces,
          facts: {
            ...closedTrailFacts(structuredStatus, composed.meta.identityStatus === 'PARTIAL'),
          },
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run: null,
          factualAnswer: composed.meta,
          analyticalOutcome,
        };
      }

      // DOCUMENT_KNOWLEDGE somente no caminho do provider (não em FACTUAL_CLOSED).
      const contextForProvider =
        typeof deps.context.withDocumentKnowledge === 'function'
          ? await deps.context.withDocumentKnowledge(built, {
              question,
              recentUserMessages: priorUserContents,
            })
          : built;

      const financialFactsText =
        contextForProvider.blocks.find((block) => block.type === 'FINANCIAL_FACTS')?.content ??
        null;
      const assumptionBlocks = buildUserAssumptionContextBlocks({
        assumptions: conversationBag.slots.userAssumptions,
        financialFactsText,
      });
      const blocksForProvider =
        assumptionBlocks.length === 0
          ? contextForProvider.blocks
          : [...contextForProvider.blocks, ...assumptionBlocks];

      let run = await deps.runs.createRun(tenantId, {
        userId,
        conversationId: conversation.id,
        messageId: userMessage.id,
        provider: ready.provider,
        model,
        status: 'STARTED',
      });

      const preloadTrace = drilldown === null ? null : traceFromToolResult(drilldown, 1);
      const observed: { traces: AnalyticalToolTraceDraft[]; rounds: number } = {
        traces: preloadTrace === null ? [] : [preloadTrace],
        rounds: preloadTrace === null ? 0 : 1,
      };
      const startedAt = Date.now();
      try {
        const provider = deps.providers.resolve(ready.provider);
        if (provider.id !== ready.provider) {
          throw new IaProviderError('PROVIDER_ERROR', 'Registry devolveu provider diferente do configurado.');
        }

        const generated = await runAdvisorGeneration({
          tenantId,
          resolvedMonthKey: period.monthKey,
          providerId: ready.provider,
          model,
          blocks: blocksForProvider,
          generate: (payload) => provider.generate(payload),
          analyticalTools: deps.analyticalTools,
          now: input.now,
          observed,
          questionScope: questionToolScope,
          explicitCostCenter: questionDemand.explicitCostCenter,
          questionDemand,
          question,
          activeAssumptionValues: listActiveUserAssumptions(
            conversationBag.slots.userAssumptions,
          ).map((row) => row.value),
          initialToolEvidence:
            drilldown !== null && drilldown.ok
              ? [
                  {
                    toolName: drilldown.name,
                    content: drilldown.content,
                    ok: drilldown.ok,
                  },
                ]
              : [],
        });
        const text = sanitizeConsultantText(generated.text);
        if (advisorTextLooksLikeLatexMath(text)) {
          console.info(
            JSON.stringify({
              event: 'advisor_response_latex_math_detected',
              tenantId,
              conversationId: conversation.id,
              chars: text.length,
            }),
          );
        }
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content: text,
        });

        run = await deps.runs.updateRun(tenantId, run.id, {
          status: 'SUCCEEDED',
          inputTokens: generated.usage.inputTokens,
          outputTokens: generated.usage.outputTokens,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date(),
          messageId: consultantMessage.id,
        });

        await afterAnalyticalReply(
          consultantMessage,
          'PROVIDER',
          observed.traces.map((trace) => ({
            toolName: trace.toolName,
            ok: trace.status === 'SUCCESS' || trace.known,
            contentPreview: '',
          })),
        );

        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: run.id,
          answerSource: 'PROVIDER',
          toolRoundCount: observed.rounds,
          traces: observed.traces,
          facts: openProviderFacts(false),
        });
        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run,
          factualAnswer: null,
          analyticalOutcome,
        };
      } catch (error) {
        const { status, errorCode, message } = normalizeExecutionFailure(error);
        run = await deps.runs.updateRun(tenantId, run.id, {
          status,
          errorCode,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date(),
        });
        await recordTrail({
          consultantMessageId: null,
          runId: run.id,
          answerSource: 'PROVIDER',
          toolRoundCount: observed.rounds,
          traces: observed.traces,
          facts: openProviderFacts(true),
        });
        throw new AdvisorExecutionError(errorCode, message, run, userMessage);
      }
    },
  };
}

export type SendAdvisorMessage = ReturnType<typeof createSendAdvisorMessage>;

function requireActiveSettings(
  settings: AiTenantSettingsRecord | null,
  tenantId: string,
): AiTenantSettingsRecord {
  if (settings === null || settings.tenantId !== tenantId) {
    throw new AdvisorDomainError(
      'CONSULTANT_NOT_CONFIGURED',
      'Consultor não está configurado para este tenant.',
    );
  }
  if (settings.status !== 'ACTIVE') {
    throw new AdvisorDomainError('CONSULTANT_DISABLED', 'Consultor está desabilitado para este tenant.');
  }
  return settings;
}

function requireId(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function requireText(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function sanitizeConsultantText(value: string): string {
  const text = value.split(String.fromCharCode(0)).join('').trim();
  if (!text) {
    throw new IaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou texto vazio.');
  }
  if (text.length > CONSULTANT_REPLY_MAX_CHARS) {
    return text.slice(0, CONSULTANT_REPLY_MAX_CHARS);
  }
  return text;
}

function normalizeExecutionFailure(error: unknown): {
  readonly status: AiRunStatus;
  readonly errorCode: AiRunErrorCode;
  readonly message: string;
} {
  if (error instanceof IaProviderError) {
    return {
      status: statusForErrorCode(error.code),
      errorCode: error.code,
      message: error.message,
    };
  }
  if (error instanceof AdvisorDomainError && isRunErrorCode(error.code)) {
    return {
      status: statusForErrorCode(error.code),
      errorCode: error.code,
      message: error.message,
    };
  }
  return {
    status: 'FAILED',
    errorCode: 'UNKNOWN',
    message: 'Falha ao executar o Consultor.',
  };
}

function statusForErrorCode(code: AiRunErrorCode): AiRunStatus {
  if (code === 'TIMEOUT') {
    return 'TIMEOUT';
  }
  return 'FAILED';
}

async function persistBlockedRun(
  runs: Pick<AdvisorRunRepository, 'createRun'>,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly conversationId: string;
    readonly provider: AiTenantSettingsRecord['provider'];
    readonly model: string;
    readonly status: Extract<AiRunStatus, 'LIMIT_BLOCKED' | 'FAILED'>;
    readonly errorCode: AiRunErrorCode;
  },
): Promise<void> {
  await runs.createRun(input.tenantId, {
    userId: input.userId,
    conversationId: input.conversationId,
    provider: input.provider,
    model: input.model,
    status: input.status,
    errorCode: input.errorCode,
    finishedAt: new Date(),
  });
}

async function runAdvisorGeneration(input: {
  readonly tenantId: string;
  readonly resolvedMonthKey: string;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly blocks: GenerationInput['blocks'];
  readonly generate: (payload: GenerationInput) => Promise<GenerationOutput>;
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
  readonly now?: Date;
  readonly observed: { traces: AnalyticalToolTraceDraft[]; rounds: number };
  readonly questionScope?: { readonly costCenterQuery?: string; readonly resolvedCostCenterName?: string };
  readonly explicitCostCenter?: ExplicitCostCenterScope;
  readonly questionDemand: AdvisorQuestionAnalyticalDemand;
  readonly question?: string;
  readonly activeAssumptionValues?: readonly number[];
  readonly initialToolEvidence?: readonly AnalyticalToolEvidence[];
}): Promise<GenerationOutput> {
  const tools = input.analyticalTools?.tools ?? [];
  const toolRounds: IaToolRound[] = [];
  const seenToolFingerprints = new Set<string>();
  let usage: GenerationUsage = { inputTokens: null, outputTokens: null };
  let executedToolCount = 0;
  const requiredObligations = deriveAnalyticalObligations(input.questionDemand);
  const availableToolNames = tools.map((tool) => tool.name);
  const preloadFactScopes = collectPreloadFactScopes(input.blocks);
  const seededToolEvidence = [...(input.initialToolEvidence ?? [])];
  let completionFeedbackSeq = 0;

  for (let round = 0; round <= ADVISOR_MAX_TOOL_ROUNDS; round += 1) {
    const allowTools = tools.length > 0 && round < ADVISOR_MAX_TOOL_ROUNDS;
    // Orçamento restante para nova tentativa COM tools após este generate.
    // Feedback CONTINUE consome 1 iteração do mesmo teto ADVISOR_MAX_TOOL_ROUNDS.
    const toolRoundsRemainingAfterThis = allowTools
      ? ADVISOR_MAX_TOOL_ROUNDS - round - 1
      : 0;

    const generated = await input.generate({
      tenantId: input.tenantId,
      provider: input.providerId,
      model: input.model,
      blocks: input.blocks,
      ...(allowTools ? { tools } : {}),
      ...(toolRounds.length > 0 ? { toolRounds } : {}),
    });
    usage = addUsage(usage, generated.usage);
    const toolCalls = generated.toolCalls ?? [];

    if (toolCalls.length === 0 || input.analyticalTools === undefined || !allowTools) {
      // Modelo pediu tools após o orçamento: comportamento pré-A.2 (erro de limite).
      if (!allowTools && toolCalls.length > 0 && input.analyticalTools !== undefined) {
        throw new IaProviderError(
          'PROVIDER_ERROR',
          'O provedor excedeu o limite de tool rounds.',
        );
      }

      const completion = evaluateAgentCompletion({
        demand: input.questionDemand,
        requiredObligations,
        toolRounds,
        seededToolEvidence,
        preloadFactScopes,
        availableToolNames,
        roundsRemaining: toolRoundsRemainingAfterThis,
      });
      logCompletionDecision(input.tenantId, completion, {
        round,
        allowTools,
        zeroToolAttempt: executedToolCount === 0 && seededToolEvidence.length === 0,
      });

      if (completion.decision === 'CONTINUE' && allowTools && input.analyticalTools !== undefined) {
        completionFeedbackSeq += 1;
        const feedback = buildAnalyticalCompletionFeedback({
          state: completion,
          zeroToolAttempt: executedToolCount === 0 && seededToolEvidence.length === 0,
        });
        const feedbackId = `completion-gate-${completionFeedbackSeq}`;
        toolRounds.push({
          calls: [
            {
              id: feedbackId,
              name: 'analytical_completion_gate',
              arguments: {
                decision: 'CONTINUE',
                missingObligations: [...completion.missingObligations],
              },
            },
          ],
          results: [
            {
              id: feedbackId,
              name: 'analytical_completion_gate',
              ok: false,
              content: JSON.stringify(feedback),
              resultCardinality: 0,
            },
          ],
        });
        // Feedback consome 1 iteração do loop (mesmo teto ADVISOR_MAX_TOOL_ROUNDS).
        input.observed.rounds += 1;
        continue;
      }

      if (completion.decision === 'PARTIAL_LIMITATION' && completion.missingObligations.length > 0) {
        return {
          text: buildAnalyticalPartialLimitationText(completion),
          usage,
        };
      }

      return finalizeAdvisorAgentAnswer({
        text: generated.text,
        usage,
        blocks: input.blocks,
        toolRounds,
        executedToolCount: executedToolCount + seededToolEvidence.length,
        generate: input.generate,
        tenantId: input.tenantId,
        providerId: input.providerId,
        model: input.model,
        explicitCostCenter: input.explicitCostCenter ?? { status: 'ABSENT' },
        question: input.question,
        activeAssumptionValues: input.activeAssumptionValues,
      });
    }

    const results = [];
    const roundNumber = input.observed.rounds + 1;
    for (const call of toolCalls) {
      const toolStartedAt = Date.now();
      const fingerprint = normalizeAdvisorToolCallFingerprint(call.name, call.arguments);
      if (seenToolFingerprints.has(fingerprint)) {
        const repeated = {
          id: call.id,
          name: call.name,
          ok: false,
          content: JSON.stringify({
            status: 'REPEATED_IDENTICAL_CALL',
            code: 'IDENTICAL_TOOL_CALL',
            message:
              'Esta chamada idêntica já foi executada neste turno. Use o resultado anterior ou escolha outra estratégia.',
          }),
          resultCardinality: 0,
        };
        console.info(
          JSON.stringify({
            event: 'advisor_agent_tool_repeated',
            tenantId: input.tenantId,
            toolName: call.name,
            status: 'REPEATED_IDENTICAL_CALL',
            reason: 'IDENTICAL_TOOL_CALL',
            round: roundNumber,
          }),
        );
        const trace = traceFromToolResult(
          repeated,
          roundNumber,
          Date.now() - toolStartedAt,
          call.arguments,
        );
        if (trace !== null) {
          input.observed.traces.push(trace);
        }
        results.push(repeated);
        continue;
      }
      seenToolFingerprints.add(fingerprint);
      const result = await input.analyticalTools.execute({
        tenantId: input.tenantId,
        resolvedMonthKey: input.resolvedMonthKey,
        call,
        now: input.now,
        ...(input.questionScope === undefined ? {} : { questionScope: input.questionScope }),
      });
      executedToolCount += 1;
      console.info(
        JSON.stringify({
          event: 'advisor_agent_tool_executed',
          tenantId: input.tenantId,
          mode: 'AGENT_TOOL',
          toolName: call.name,
          status: result.ok ? 'OK' : 'ERROR',
          reason: result.ok ? null : readStructuredStatus(result.content),
          resultCardinality: result.resultCardinality ?? null,
          round: roundNumber,
          evidenceSource: 'TOOL_RESULT',
          argShape: safeToolArgShape(call.arguments),
        }),
      );
      const trace = traceFromToolResult(
        result,
        roundNumber,
        Date.now() - toolStartedAt,
        call.arguments,
      );
      if (trace !== null) {
        input.observed.traces.push(trace);
      }
      results.push(result);
    }
    input.observed.rounds = roundNumber;
    toolRounds.push({ calls: toolCalls, results });
  }

  throw new IaProviderError('PROVIDER_ERROR', 'O provedor excedeu o limite de tool rounds.');
}

function evaluateAgentCompletion(input: {
  readonly demand: AdvisorQuestionAnalyticalDemand;
  readonly requiredObligations: readonly AnalyticalObligation[];
  readonly toolRounds: readonly IaToolRound[];
  readonly seededToolEvidence: readonly AnalyticalToolEvidence[];
  readonly preloadFactScopes: readonly ('TENANT' | 'COST_CENTER' | 'UNKNOWN')[];
  readonly availableToolNames: readonly string[];
  readonly roundsRemaining: number;
}): AnalyticalCompletionState {
  const toolEvidence: AnalyticalToolEvidence[] = [...input.seededToolEvidence];
  for (const round of input.toolRounds) {
    for (const result of round.results) {
      if (result.name === 'analytical_completion_gate') {
        continue;
      }
      toolEvidence.push({
        toolName: result.name,
        content: result.content,
        ok: result.ok,
      });
    }
  }
  return evaluateAnalyticalCompletion({
    demand: input.demand,
    requiredObligations: input.requiredObligations,
    toolEvidence,
    preloadFactScopes: input.preloadFactScopes,
    availableToolNames: input.availableToolNames,
    roundsRemaining: input.roundsRemaining,
  });
}

function collectPreloadFactScopes(
  blocks: GenerationInput['blocks'],
): Array<'TENANT' | 'COST_CENTER' | 'UNKNOWN'> {
  const scopes: Array<'TENANT' | 'COST_CENTER' | 'UNKNOWN'> = [];
  for (const block of blocks) {
    if (block.type === 'FINANCIAL_FACTS' || block.type === 'ANALYTICAL_FACTS') {
      scopes.push(inferEvidenceEntityScope(block.content));
    }
  }
  return scopes;
}

function logCompletionDecision(
  tenantId: string,
  state: AnalyticalCompletionState,
  meta: {
    readonly round: number;
    readonly allowTools: boolean;
    readonly zeroToolAttempt: boolean;
  },
): void {
  console.info(
    JSON.stringify({
      event: 'advisor_agent_completion_gate',
      tenantId,
      mode: 'AGENT_TOOL',
      completionDecision: state.decision,
      requiredObligations: [...state.requiredObligations],
      satisfiedObligations: [...state.satisfiedObligations],
      missingObligations: [...state.missingObligations],
      impossibleObligations: [...state.impossibleObligations],
      attemptedTools: [...state.attemptedTools],
      round: meta.round,
      allowTools: meta.allowTools,
      zeroToolAttempt: meta.zeroToolAttempt,
    }),
  );
}

async function finalizeAdvisorAgentAnswer(input: {
  readonly text: string;
  readonly usage: GenerationUsage;
  readonly blocks: GenerationInput['blocks'];
  readonly toolRounds: readonly IaToolRound[];
  readonly executedToolCount: number;
  readonly generate: (payload: GenerationInput) => Promise<GenerationOutput>;
  readonly tenantId: string;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly explicitCostCenter: ExplicitCostCenterScope;
  readonly question?: string;
  readonly activeAssumptionValues?: readonly number[];
}): Promise<GenerationOutput> {
  const agentToolPath = input.executedToolCount > 0;
  const evidenceItems = collectEvidenceItems(input.blocks, input.toolRounds);
  const requiredEntityScope =
    input.explicitCostCenter.status === 'FOUND' || input.explicitCostCenter.status === 'AMBIGUOUS'
      ? 'COST_CENTER'
      : 'UNKNOWN';
  const requiredCostCenterName =
    input.explicitCostCenter.status === 'FOUND'
      ? input.explicitCostCenter.resolvedName
      : input.explicitCostCenter.status === 'AMBIGUOUS'
        ? input.explicitCostCenter.query
        : null;
  const numericEvidenceMode = resolveAdvisorNumericEvidenceMode({
    question: input.question ?? '',
    activeAssumptionValues: input.activeAssumptionValues ?? [],
  });
  const gated = gateAdvisorEvidenceBoundAnswer({
    answerText: input.text,
    evidenceItems,
    agentToolPath,
    requiredEntityScope,
    requiredCostCenterName,
    numericEvidenceMode,
  });
  if (gated.ok) {
    return { text: gated.text, usage: input.usage };
  }

  // Provenance×claim: limitação determinística completa (+0 provider). Evita rewrite/salvage
  // que mutilava milhares BR ("000,00." / "113,07.") ao strippar sentenças.
  if (gated.reason === 'INCOMPATIBLE_EVIDENCE_PROVENANCE') {
    console.info(
      JSON.stringify({
        event: 'advisor_agent_evidence_gate',
        tenantId: input.tenantId,
        mode: 'AGENT_TOOL',
        status: gated.reason,
        reason: gated.reason,
        unsupportedCount: gated.unsupportedClaims.length,
        outcome: 'DETERMINISTIC_PROVENANCE_LIMITATION',
        requiredEntityScope,
        numericEvidenceMode,
      }),
    );
    return { text: gated.text, usage: input.usage };
  }

  console.info(
    JSON.stringify({
      event: 'advisor_agent_evidence_gate',
      tenantId: input.tenantId,
      mode: 'AGENT_TOOL',
      status: gated.reason,
      reason: gated.reason,
      unsupportedCount: gated.unsupportedClaims.length,
      outcome: 'REWRITE_ATTEMPT',
      requiredEntityScope,
      numericEvidenceMode,
    }),
  );

  let usage = input.usage;
  try {
    const unsupportedList =
      gated.unsupportedClaims.length > 0
        ? gated.unsupportedClaims.join('; ')
        : 'ABSENT';
    const rewrite = await input.generate({
      tenantId: input.tenantId,
      provider: input.providerId,
      model: input.model,
      blocks: [
        ...input.blocks,
        {
          type: 'PLATFORM_INSTRUCTIONS',
          content: [
            'REWRITE_EVIDENCE_BOUND:',
            'Reescreva a resposta anterior usando APENAS valores presentes nos FINANCIAL_FACTS/ANALYTICAL_FACTS/tool results deste contexto.',
            'Respeite entityScope: fatos TENANT não autorizam afirmações de COST_CENTER.',
            'Pode citar valores INDIVIDUAIS oficiais (ex.: cada título/linha retornada pela tool).',
            'NÃO some, agregue nem invente totais/percentuais que não estejam explícitos na evidência.',
            'Se a resposta anterior trouxe soma/agregação não sustentada, REMOVA essa agregação e preserve o ranking/listagem com os valores oficiais individuais.',
            'Não invente números. Se não houver cifra oficial compatível com o escopo, declare a limitação.',
            `Cifras rejeitadas (remover ou substituir só por valores oficiais): ${unsupportedList}`,
            `Resposta anterior rejeitada: ${input.text.slice(0, 2_000)}`,
          ].join('\n'),
          trustLevel: 'PLATFORM',
        },
      ],
      toolRounds: input.toolRounds,
    });
    usage = addUsage(usage, rewrite.usage);
    const afterRewrite = applyAdvisorEvidenceBoundRewrite({
      original: gated,
      rejectedAnswerText: input.text,
      rewriteText: rewrite.text,
      evidenceItems,
      requiredEntityScope,
      requiredCostCenterName,
      numericEvidenceMode,
    });
    console.info(
      JSON.stringify({
        event: 'advisor_agent_evidence_gate',
        tenantId: input.tenantId,
        mode: 'AGENT_TOOL',
        status: afterRewrite.ok ? 'OK' : afterRewrite.reason,
        reason: afterRewrite.reason,
        outcome: afterRewrite.ok
          ? afterRewrite.text === rewrite.text
            ? 'REWRITE_ACCEPTED'
            : 'SALVAGE_ACCEPTED'
          : 'DETERMINISTIC_LIMITATION',
      }),
    );
    return { text: afterRewrite.text, usage };
  } catch {
    const salvaged = applyAdvisorEvidenceBoundRewrite({
      original: gated,
      rejectedAnswerText: input.text,
      rewriteText: input.text,
      evidenceItems,
      requiredEntityScope,
      requiredCostCenterName,
      numericEvidenceMode,
    });
    console.info(
      JSON.stringify({
        event: 'advisor_agent_evidence_gate',
        tenantId: input.tenantId,
        mode: 'AGENT_TOOL',
        status: salvaged.ok ? 'OK' : gated.reason,
        reason: salvaged.ok ? 'OK' : gated.reason,
        outcome: salvaged.ok ? 'SALVAGE_ACCEPTED' : 'DETERMINISTIC_LIMITATION',
        numericEvidenceMode,
      }),
    );
    return { text: salvaged.ok ? salvaged.text : gated.text, usage };
  }
}

function collectEvidenceItems(
  blocks: GenerationInput['blocks'],
  toolRounds: readonly IaToolRound[],
): AdvisorEvidenceItem[] {
  const items: AdvisorEvidenceItem[] = [];
  for (const block of blocks) {
    if (block.type === 'FINANCIAL_FACTS') {
      items.push({
        text: block.content,
        entityScope: inferEvidenceEntityScope(block.content),
        source: 'FINANCIAL_FACTS',
        resolvedCostCenter: 'NONE',
      });
    } else if (block.type === 'ANALYTICAL_FACTS' || block.type === 'PRESENTED_INSIGHT_FACTS') {
      const source =
        block.content.includes('USER_ASSUMPTIONS_BLOCK') ||
        block.content.includes('provenance: USER_ASSUMPTION')
          ? ('USER_ASSUMPTION' as const)
          : block.content.includes('SCENARIO_DERIVED_BLOCK') ||
              block.content.includes('DERIVED_FROM(OFFICIAL_FACT+USER_ASSUMPTION)')
            ? ('SCENARIO_DERIVED' as const)
            : block.type === 'ANALYTICAL_FACTS'
              ? ('ANALYTICAL_FACTS' as const)
              : ('PRESENTED_INSIGHT_FACTS' as const);
      items.push({
        text: block.content,
        entityScope: inferEvidenceEntityScope(block.content),
        source,
      });
    }
  }
  for (const round of toolRounds) {
    for (const result of round.results) {
      items.push({
        text: result.content,
        entityScope: inferEvidenceEntityScope(result.content),
        source: 'TOOL_RESULT',
        resolvedCostCenter: readResolvedCostCenterName(result.content),
      });
    }
  }
  return items;
}

function buildUserAssumptionContextBlocks(input: {
  readonly assumptions: readonly UserAnalyticalAssumption[];
  readonly financialFactsText: string | null;
}): GenerationInput['blocks'] {
  const assumptionBlock = serializeUserAssumptionsEvidenceBlock(input.assumptions);
  if (assumptionBlock === null) {
    return [];
  }
  const blocks: Array<GenerationInput['blocks'][number]> = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: [
        'USER_ASSUMPTION_USAGE:',
        'Há premissas explícitas do usuário (USER_ASSUMPTIONS_BLOCK / SCENARIO_DERIVED_BLOCK).',
        'Você PODE usá-las em análise CONDICIONAL / cenário.',
        'Nunca as apresente como fato do ERP, Conta Azul, dashboard ou lançamento realizado.',
        'Deixe claro semanticamente que o valor foi informado/estimado pelo usuário.',
        'Ao citar a premissa, use assumptionAmountBrl / assumptionPercentDisplay do bloco (ou equivalente numérico sustentado).',
        'Se usar SCENARIO_DERIVED, cite derived.*Brl / percentDisplay exatamente — sem arredondar para outro valor.',
        'Combine com FINANCIAL_FACTS oficiais e SCENARIO_DERIVED quando útil; não invente entidades oficiais.',
        'Se a premissa não bastar para concluir, diga a limitação naturalmente.',
        'Não responda que a premissa "não existe nos fatos oficiais" — ela é input de cenário, não lançamento.',
      ].join('\n'),
      trustLevel: 'PLATFORM',
    },
    {
      type: 'ANALYTICAL_FACTS',
      content: assumptionBlock,
      trustLevel: 'ANALYTICAL_FACT',
    },
  ];
  const derived = buildDerivedScenarioEvidence({
    assumptions: input.assumptions,
    financialFactsText: input.financialFactsText,
  });
  if (derived !== null) {
    blocks.push({
      type: 'ANALYTICAL_FACTS',
      content: derived,
      trustLevel: 'ANALYTICAL_FACT',
    });
  }
  return blocks;
}

function toQuestionToolScope(
  scope: ExplicitCostCenterScope,
): { readonly costCenterQuery?: string; readonly resolvedCostCenterName?: string } | undefined {
  if (scope.status === 'FOUND') {
    return {
      costCenterQuery: scope.query,
      resolvedCostCenterName: scope.resolvedName,
    };
  }
  if (scope.status === 'AMBIGUOUS') {
    return { costCenterQuery: scope.query };
  }
  return undefined;
}

function toolContentHasCostCenterScope(content: string | null): boolean {
  if (content === null) {
    return false;
  }
  return inferEvidenceEntityScope(content) === 'COST_CENTER';
}

function readResolvedCostCenterName(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as {
      status?: string;
      resolvedCostCenter?: unknown;
      costCenter?: { name?: unknown } | null;
    };
    if (typeof parsed.resolvedCostCenter === 'string' && parsed.resolvedCostCenter !== 'NONE') {
      return parsed.resolvedCostCenter.trim() || null;
    }
    const name = parsed.costCenter?.name;
    if (typeof name !== 'string' || name.trim() === '') {
      return null;
    }
    if (
      parsed.status !== undefined &&
      parsed.status !== 'OK' &&
      parsed.status !== 'EMPTY_RESULT' &&
      parsed.status !== 'PARTIAL'
    ) {
      return null;
    }
    return name.trim();
  } catch {
    return null;
  }
}

function safeToolArgShape(args: Record<string, unknown>): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const key of Object.keys(args).sort((a, b) => a.localeCompare(b))) {
    const value = args[key];
    if (typeof value === 'string') {
      shape[key] = value.length > 80 ? 'string:>80' : 'string';
    } else if (typeof value === 'number') {
      shape[key] = 'number';
    } else if (typeof value === 'boolean') {
      shape[key] = 'boolean';
    } else if (value === null) {
      shape[key] = 'null';
    } else {
      shape[key] = Array.isArray(value) ? 'array' : typeof value;
    }
  }
  return shape;
}

function addUsage(left: GenerationUsage, right: GenerationUsage): GenerationUsage {
  return {
    inputTokens: sumNullable(left.inputTokens, right.inputTokens),
    outputTokens: sumNullable(left.outputTokens, right.outputTokens),
  };
}

function sumNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
}

function readWinnerFromToolContent(
  content: string,
): { readonly displayName: string; readonly normalizedKey: string } | null {
  try {
    return readAdvisorNominalRankingWinner(JSON.parse(content) as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function answerAnalyticalContinuityTurn(input: {
  readonly question: string;
  readonly period: ReturnType<typeof resolveAdvisorConversationalPeriod>;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly now?: Date;
  readonly conversationBag: AdvisorConversationBag;
  readonly persistBag: (next: AdvisorConversationBag) => Promise<void>;
  readonly monthlyPlanning: MonthlyPlanningServices;
  readonly dailyCashMovements?: SendAdvisorMessageDependencies['dailyCashMovements'];
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
  readonly providers: IaProviderRegistry;
  readonly readyProvider: GenerationInput['provider'];
  readonly model: string;
  readonly conversations: Pick<AdvisorConversationRepository, 'createMessage'>;
  readonly recordTrail: (input: {
    readonly consultantMessageId: string | null;
    readonly runId: string | null;
    readonly answerSource: AnalyticalAnswerSource;
    readonly toolRoundCount: number;
    readonly traces: readonly AnalyticalToolTraceDraft[];
    readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
  }) => Promise<AnalyticalOutcome>;
}): Promise<{
  readonly consultantMessage: AiMessageRecord;
  readonly factualAnswer: SendAdvisorMessageResult['factualAnswer'];
  readonly analyticalOutcome: AnalyticalOutcome;
} | null> {
  const prior = input.conversationBag.slots.lastAnalyticalQuery;
  let classified = classifyAnalyticalContinuity({
    content: input.question,
    period: input.period,
    prior,
  });

  // C.2.5 — no máximo 1 chamada extra quando determinístico ficou CLARIFY.
  if (
    shouldAttemptSemanticContinuity({
      content: input.question,
      deterministicDecision: classified.decision,
      prior,
    }) &&
    prior !== null
  ) {
    try {
      const provider = input.providers.resolve(input.readyProvider);
      if (provider.id === input.readyProvider) {
        const semantic = await resolveSemanticAnalyticalContinuity({
          provider,
          providerId: input.readyProvider,
          model: input.model,
          tenantId: input.tenantId,
          userMessage: input.question,
          prior,
        });
        if (semantic.decision === 'CONTINUE') {
          classified = {
            decision: 'CONTINUE',
            patch: semantic.patch,
            inherited: true,
          };
        } else if (semantic.decision === 'NEW_QUERY') {
          return null;
        } else if (semantic.decision === 'CLARIFY') {
          const content =
            semantic.message ??
            'Pode esclarecer o que deseja alterar na consulta anterior?';
          const consultantMessage = await input.conversations.createMessage(
            input.tenantId,
            input.conversationId,
            { senderType: 'CONSULTANT', content },
          );
          const analyticalOutcome = await input.recordTrail({
            consultantMessageId: consultantMessage.id,
            runId: null,
            answerSource: 'CAPABILITY_DENIED',
            toolRoundCount: 0,
            traces: [],
            facts: {
              ...closedTrailFacts('UNRESOLVED'),
              clarificationRequired: true,
            },
          });
          return {
            consultantMessage,
            factualAnswer: {
              classification: 'FACTUAL_CLOSED',
              providerCalled: false,
              intentKind: 'FACTUAL_LIMITATION',
              factKind: 'CONTINUITY_CLARIFY',
              identityStatus: null,
              returnedCount: null,
              coveragePercent: null,
              composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
            },
            analyticalOutcome,
          };
        }
      }
    } catch {
      // Provider indisponível: cai para CLARIFY determinístico abaixo.
    }
  }

  if (classified.decision === 'NEW_QUERY') {
    // Política C.2.7: NEW_QUERY invalida last imediatamente.
    // Se a nova investigação falhar depois, NÃO restaura o contexto antigo.
    if (prior !== null) {
      await input.persistBag(
        mergeAdvisorConversationBag(input.conversationBag, {
          lastAnalyticalQuery: null,
        }),
      );
    }
    return null;
  }

  if (classified.decision === 'CLARIFY') {
    // Sem prior / ambíguo estrutural — só responde se parece continuação.
    if (prior === null && classified.reason === 'FOLLOW_UP_WITHOUT_CONTEXT') {
      const consultantMessage = await input.conversations.createMessage(
        input.tenantId,
        input.conversationId,
        { senderType: 'CONSULTANT', content: classified.message },
      );
      const analyticalOutcome = await input.recordTrail({
        consultantMessageId: consultantMessage.id,
        runId: null,
        answerSource: 'CAPABILITY_DENIED',
        toolRoundCount: 0,
        traces: [],
        facts: {
          ...closedTrailFacts('UNRESOLVED'),
          clarificationRequired: true,
        },
      });
      return {
        consultantMessage,
        factualAnswer: {
          classification: 'FACTUAL_CLOSED',
          providerCalled: false,
          intentKind: 'FACTUAL_LIMITATION',
          factKind: 'CONTINUITY_WITHOUT_CONTEXT',
          identityStatus: null,
          returnedCount: null,
          coveragePercent: null,
          composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
        },
        analyticalOutcome,
      };
    }
    if (prior !== null) {
      const consultantMessage = await input.conversations.createMessage(
        input.tenantId,
        input.conversationId,
        { senderType: 'CONSULTANT', content: classified.message },
      );
      const analyticalOutcome = await input.recordTrail({
        consultantMessageId: consultantMessage.id,
        runId: null,
        answerSource: 'CAPABILITY_DENIED',
        toolRoundCount: 0,
        traces: [],
        facts: {
          ...closedTrailFacts('UNRESOLVED'),
          clarificationRequired: true,
        },
      });
      return {
        consultantMessage,
        factualAnswer: {
          classification: 'FACTUAL_CLOSED',
          providerCalled: false,
          intentKind: 'FACTUAL_LIMITATION',
          factKind: 'CONTINUITY_CLARIFY',
          identityStatus: null,
          returnedCount: null,
          coveragePercent: null,
          composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
        },
        analyticalOutcome,
      };
    }
    return null;
  }

  if (prior === null) {
    return null;
  }

  const applied = applyAnalyticalDimensionPatch({
    prior,
    patch: classified.patch,
  });
  if (!applied.ok) {
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      {
        senderType: 'CONSULTANT',
        content: `Não consigo aplicar essa continuação: ${applied.message}`,
      },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'CAPABILITY_DENIED',
      toolRoundCount: 0,
      traces: [],
      facts: closedTrailFacts('DENIED'),
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: 'CONTINUITY_DENIED',
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  const executed = await runAnalyticalContinuityAnswer({
    query: applied.query,
    tenantId: input.tenantId,
    now: input.now,
    cashFlow: input.monthlyPlanning.cashFlow,
    costCenters: input.dailyCashMovements?.costCenters,
    analyticalTools: input.analyticalTools,
  });
  if (executed === null) {
    return null;
  }

  const consultantMessage = await input.conversations.createMessage(
    input.tenantId,
    input.conversationId,
    { senderType: 'CONSULTANT', content: executed.answer },
  );
  if (executed.nextState !== null) {
    await input.persistBag(
      mergeAdvisorConversationBag(input.conversationBag, {
        lastAnalyticalQuery: executed.nextState,
      }),
    );
  }
  const answerSource: AnalyticalAnswerSource =
    executed.intentKind === 'BILLING_SERIES'
      ? 'BILLING_SERIES'
      : executed.capabilityKey.startsWith('billing.')
        ? 'BILLING'
        : executed.capabilityKey.includes('movements')
          ? 'COST_CENTER'
          : 'CAPABILITY_DENIED';
  const analyticalOutcome = await input.recordTrail({
    consultantMessageId: consultantMessage.id,
    runId: null,
    answerSource,
    toolRoundCount: 0,
    traces: [],
    facts: closedTrailFacts(executed.structuredStatus),
  });
  const continuityIntentKind =
    executed.intentKind === 'BILLING_SERIES' ||
    executed.intentKind === 'BILLING_MONTH' ||
    executed.intentKind === 'FACTUAL_LIMITATION' ||
    executed.intentKind === 'COST_CENTER_LOOKUP' ||
    executed.intentKind === 'COST_CENTER_MOVEMENT_LINES'
      ? executed.intentKind
      : executed.capabilityKey.includes('movements')
        ? ('COST_CENTER_MOVEMENT_LINES' as const)
        : executed.capabilityKey.includes('lookup')
          ? ('COST_CENTER_LOOKUP' as const)
          : ('FACTUAL_LIMITATION' as const);
  return {
    consultantMessage,
    factualAnswer: {
      classification: 'FACTUAL_CLOSED',
      providerCalled: false,
      intentKind: continuityIntentKind,
      factKind: executed.factKind,
      identityStatus: null,
      returnedCount: null,
      coveragePercent: null,
      composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
    },
    analyticalOutcome,
  };
}

async function answerCostCenterOutflowMovementsPlan(input: {
  readonly assembled: Exclude<
    ReturnType<typeof assembleCostCenterOutflowMovementsPlan>,
    { readonly kind: 'UNMATCHED' }
  >;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly question: string;
  readonly now?: Date;
  readonly analyticalTools: AdvisorAnalyticalToolExecutor | undefined;
  readonly conversations: {
    createMessage: SendAdvisorMessageDependencies['conversations']['createMessage'];
    saveAnalyticalContext?: SendAdvisorMessageDependencies['conversations']['saveAnalyticalContext'];
  };
  readonly existingBag?: AdvisorConversationBag;
  readonly onBagPersisted?: (bag: AdvisorConversationBag) => Promise<void>;
  readonly recordTrail: (trailInput: {
    readonly consultantMessageId: string;
    readonly runId: string | null;
    readonly answerSource: AnalyticalAnswerSource;
    readonly toolRoundCount: number;
    readonly traces: AnalyticalToolTraceDraft[];
    readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
  }) => Promise<AnalyticalOutcome>;
}): Promise<{
  readonly consultantMessage: AiMessageRecord;
  readonly factualAnswer: AdvisorFactualAnswerMeta;
  readonly analyticalOutcome: AnalyticalOutcome;
} | null> {
  const assembled = input.assembled;

  if (assembled.kind === 'FOLLOW_UP_WITHOUT_CONTEXT') {
    const content =
      'Não há uma consulta anterior de maiores gastos por centro de custo nesta conversa para eu reutilizar. Informe o centro de custo e o período.';
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'COST_CENTER',
      toolRoundCount: 0,
      traces: [],
      facts: {
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: true,
        factualClosed: true,
        factualPartial: false,
        structuredStatus: 'UNRESOLVED',
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  if (assembled.kind === 'MISSING_ENTITY') {
    const content =
      'Não consegui identificar com segurança o centro de custo dessa consulta de maiores gastos. Informe o nome do centro de custo.';
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'COST_CENTER',
      toolRoundCount: 0,
      traces: [],
      facts: {
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: true,
        factualClosed: true,
        factualPartial: false,
        structuredStatus: 'UNRESOLVED',
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  if (assembled.kind === 'CAPABILITY_DENIED') {
    const content = composeCapabilityDeniedAnswer({
      query: assembled.query,
      validation: assembled.validation,
    });
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'CAPABILITY_DENIED',
      toolRoundCount: 0,
      traces: [],
      facts: {
        providerFailed: false,
        capabilityDenied: true,
        clarificationRequired: false,
        factualClosed: true,
        factualPartial: false,
        structuredStatus: null,
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  // Marco A2 — desfechos explícitos (nunca "não encontrei" para outra causa).
  const limitationReply = async (reply: {
    readonly content: string;
    readonly structuredStatus: string;
    readonly clarificationRequired: boolean;
    readonly capabilityDenied?: boolean;
    readonly traces?: readonly AnalyticalToolTraceDraft[];
  }): Promise<{
    readonly consultantMessage: AiMessageRecord;
    readonly factualAnswer: AdvisorFactualAnswerMeta;
    readonly analyticalOutcome: AnalyticalOutcome;
  }> => {
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content: reply.content },
    );
    const traces = [...(reply.traces ?? [])];
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: reply.capabilityDenied === true ? 'CAPABILITY_DENIED' : 'COST_CENTER',
      toolRoundCount: traces.length > 0 ? 1 : 0,
      traces,
      facts: {
        providerFailed: false,
        capabilityDenied: reply.capabilityDenied === true,
        clarificationRequired: reply.clarificationRequired,
        factualClosed: true,
        factualPartial: false,
        structuredStatus: reply.structuredStatus,
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  };

  if (assembled.kind === 'AMBIGUOUS_ENTITY') {
    const names = assembled.candidates.map((row) => row.name).slice(0, 5);
    return limitationReply({
      content:
        names.length > 0
          ? `Há mais de um centro de custo correspondente (${names.join(', ')}). Especifique qual deles.`
          : 'Há mais de um centro de custo correspondente. Especifique o nome ou o código.',
      structuredStatus: 'AMBIGUOUS',
      clarificationRequired: true,
    });
  }
  if (assembled.kind === 'UNSUPPORTED_PERIOD') {
    return limitationReply({
      content: describeUnsupportedPeriod(assembled.reason),
      structuredStatus: 'UNSUPPORTED',
      clarificationRequired: false,
      capabilityDenied: true,
    });
  }
  if (assembled.kind === 'PERIOD_WITHOUT_CONTEXT') {
    return limitationReply({
      content:
        'Não há um período anterior nesta conversa para eu reutilizar. Informe o período (por exemplo, "nos últimos 3 meses" ou "em setembro").',
      structuredStatus: 'UNRESOLVED',
      clarificationRequired: true,
    });
  }

  const slots = assembled.slots;
  if (input.analyticalTools === undefined) {
    const content =
      'Não consegui obter o detalhamento das movimentações agora.';
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'COST_CENTER',
      toolRoundCount: 0,
      traces: [],
      facts: {
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: false,
        factualClosed: true,
        factualPartial: false,
        structuredStatus: 'UNAVAILABLE',
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  if (slots.windowMonths !== undefined) {
    return answerCostCenterOutflowMovementsWindow({
      ...input,
      slots: { ...slots, windowMonths: slots.windowMonths },
      analyticalTools: input.analyticalTools,
      limitationReply,
    });
  }

  const toolStartedAt = Date.now();
  const toolResult = await input.analyticalTools.execute({
    tenantId: input.tenantId,
    resolvedMonthKey: slots.monthKey,
    now: input.now,
    call: {
      id: 'plan-cost-center-outflow-movements',
      name: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
      arguments: {
        monthKey: slots.monthKey,
        direction: 'OUTFLOW',
        costCenterQuery: slots.costCenterMention,
        limit: slots.limit,
      },
    },
  });
  const plannedStatus = readStructuredStatus(toolResult.content);
  if (plannedStatus === 'NOT_FOUND') {
    const trace = traceFromToolResult(toolResult, 1, Date.now() - toolStartedAt, {
      monthKey: slots.monthKey,
      direction: 'OUTFLOW',
      costCenterQuery: slots.costCenterMention,
      limit: slots.limit,
    });
    return limitationReply({
      content: costCenterNotFoundMessage(slots),
      structuredStatus: slots.entitySource === 'TEXT' ? 'NOT_FOUND' : 'UNRESOLVED',
      clarificationRequired: slots.entitySource !== 'TEXT',
      traces: trace === null ? [] : [trace],
    });
  }
  const composed = composeAdvisorFactualAnswer({
    content: input.question,
    anaphora: 'NONE',
    toolName: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
    toolOk: toolResult.ok,
    toolContent: toolResult.content,
  });
  if (composed.answer === null || composed.meta === null) {
    const status = readStructuredStatus(toolResult.content) ?? 'UNAVAILABLE';
    const content =
      status === 'AMBIGUOUS'
        ? 'Há mais de um centro de custo correspondente. Especifique o nome ou o código.'
        : status === 'NOT_FOUND'
          ? 'Não encontrei esse centro de custo.'
          : 'Não há atribuição oficial suficiente de centros de custo nas movimentações realizadas deste mês.';
    const consultantMessage = await input.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      { senderType: 'CONSULTANT', content },
    );
    const trace = traceFromToolResult(
      toolResult,
      1,
      Date.now() - toolStartedAt,
      {
        monthKey: slots.monthKey,
        direction: 'OUTFLOW',
        costCenterQuery: slots.costCenterMention,
        limit: slots.limit,
      },
    );
    const traces = trace === null ? [] : [trace];
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'COST_CENTER',
      toolRoundCount: traces.length > 0 ? 1 : 0,
      traces,
      facts: {
        providerFailed: false,
        capabilityDenied: false,
        clarificationRequired: status === 'AMBIGUOUS',
        factualClosed: true,
        factualPartial: false,
        structuredStatus: status,
      },
    });
    return {
      consultantMessage,
      factualAnswer: {
        classification: 'FACTUAL_CLOSED',
        providerCalled: false,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: null,
        identityStatus: null,
        returnedCount: null,
        coveragePercent: null,
        composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
      },
      analyticalOutcome,
    };
  }

  const consultantMessage = await input.conversations.createMessage(
    input.tenantId,
    input.conversationId,
    { senderType: 'CONSULTANT', content: withOutflowMetricNote(input.question, composed.answer) },
  );
  const resolvedName = readResolvedCostCenterName(toolResult.content);
  const structuredStatus = readStructuredStatus(toolResult.content) ?? 'OK';
  if (
    (structuredStatus === 'OK' || structuredStatus === 'EMPTY_RESULT') &&
    resolvedName !== null &&
    typeof input.conversations.saveAnalyticalContext === 'function'
  ) {
    const lastAnalyticalQuery = lastAnalyticalQueryFromCostCenterMovements({
      monthKey: slots.monthKey,
      costCenterQuery: resolvedName,
      limit: slots.limit,
      structuredStatus,
    });
    const next = mergeAdvisorConversationBag(input.existingBag ?? parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: costCenterOutflowMovementsState({
        monthKey: slots.monthKey,
        periodSource: slots.periodSource,
        limit: slots.limit,
        costCenterQuery: resolvedName,
      }),
      ...(lastAnalyticalQuery !== null ? { lastAnalyticalQuery } : {}),
    });
    await input.conversations.saveAnalyticalContext(
      input.tenantId,
      input.conversationId,
      serializeAdvisorConversationBag(next) as never,
    );
    if (input.onBagPersisted !== undefined) {
      await input.onBagPersisted(next);
    }
  }
  const trace = traceFromToolResult(
    toolResult,
    1,
    Date.now() - toolStartedAt,
    {
      monthKey: slots.monthKey,
      direction: 'OUTFLOW',
      costCenterQuery: slots.costCenterMention,
      limit: slots.limit,
    },
  );
  const traces = trace === null ? [] : [trace];
  const analyticalOutcome = await input.recordTrail({
    consultantMessageId: consultantMessage.id,
    runId: null,
    answerSource: 'COST_CENTER',
    toolRoundCount: traces.length > 0 ? 1 : 0,
    traces,
    facts: {
      ...closedTrailFacts(
        composed.meta.intentKind === 'FACTUAL_LIMITATION'
          ? (structuredStatus ?? 'UNRESOLVED')
          : structuredStatus,
        composed.meta.identityStatus === 'PARTIAL',
      ),
      clarificationRequired:
        structuredStatus === 'AMBIGUOUS' || structuredStatus === 'UNRESOLVED',
    },
  });
  return {
    consultantMessage,
    factualAnswer: composed.meta,
    analyticalOutcome,
  };
}

type CostCenterPlanSlots = Extract<
  ReturnType<typeof assembleCostCenterOutflowMovementsPlan>,
  { readonly kind: 'ASSEMBLED' }
>['slots'];

/** "Maior movimentação/lançamento" (sem entrada/saída explícita). */
function isDirectionlessLargestMovementQuestion(question: string): boolean {
  const folded = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (
    /\bmaior(?:es)?\s+(?:movimentac\w*|movimentos?|lancamentos?)\b/.test(folded) ||
    /\b(?:movimentac\w*|movimentos?|lancamentos?)\s+mais\s+(?:alt|car)\w*/.test(folded)
  );
}

/**
 * "Despesa" na pergunta: a família C.1 (homologada) responde com saída realizada de caixa
 * por lançamento. Diz a métrica explicitamente para não confundir com a despesa oficial
 * (doc 11: realized.outflows + expected.payables, por competência).
 */
function withOutflowMetricNote(question: string, answer: string): string {
  const folded = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!/\bdespesas?\b/.test(folded)) {
    return answer;
  }
  return `${answer} Considerei saídas realizadas de caixa atribuídas ao centro (lançamentos pagos), não a despesa oficial por competência.`;
}

/**
 * NOT_FOUND só afirma "não encontrei" quando o centro veio do texto e o catálogo
 * não o reconheceu. Centro comprovado no catálogo (ou herdado) que falha na tool é
 * falha de interpretação/execução, não centro inexistente.
 */
function costCenterNotFoundMessage(slots: Pick<CostCenterPlanSlots, 'entitySource' | 'costCenterMention'>): string {
  if (slots.entitySource === 'TEXT') {
    return `Não encontrei o centro de custo "${slots.costCenterMention}" no cadastro desta empresa.`;
  }
  if (slots.entitySource === 'INHERITED') {
    return `O centro de custo ${slots.costCenterMention}, usado na consulta anterior, não aparece mais no cadastro desta empresa. Informe o centro que deseja consultar.`;
  }
  return `Não consegui confirmar o centro de custo ${slots.costCenterMention} nas movimentações desta consulta. Informe o nome ou o código do centro.`;
}

/**
 * Marco A2 — maior(es) gasto(s) individual(is) do centro numa janela de meses.
 * Usa a tool mensal oficial mês a mês (cost-center-movements-window).
 */
async function answerCostCenterOutflowMovementsWindow(input: {
  readonly question: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly now?: Date;
  readonly slots: CostCenterPlanSlots & { readonly windowMonths: number };
  readonly analyticalTools: AdvisorAnalyticalToolExecutor;
  readonly conversations: {
    createMessage: SendAdvisorMessageDependencies['conversations']['createMessage'];
    saveAnalyticalContext?: SendAdvisorMessageDependencies['conversations']['saveAnalyticalContext'];
  };
  readonly existingBag?: AdvisorConversationBag;
  readonly onBagPersisted?: (bag: AdvisorConversationBag) => Promise<void>;
  readonly recordTrail: (trailInput: {
    readonly consultantMessageId: string;
    readonly runId: string | null;
    readonly answerSource: AnalyticalAnswerSource;
    readonly toolRoundCount: number;
    readonly traces: AnalyticalToolTraceDraft[];
    readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
  }) => Promise<AnalyticalOutcome>;
  readonly limitationReply: (reply: {
    readonly content: string;
    readonly structuredStatus: string;
    readonly clarificationRequired: boolean;
    readonly traces?: readonly AnalyticalToolTraceDraft[];
  }) => Promise<{
    readonly consultantMessage: AiMessageRecord;
    readonly factualAnswer: AdvisorFactualAnswerMeta;
    readonly analyticalOutcome: AnalyticalOutcome;
  }>;
}): Promise<{
  readonly consultantMessage: AiMessageRecord;
  readonly factualAnswer: AdvisorFactualAnswerMeta;
  readonly analyticalOutcome: AnalyticalOutcome;
}> {
  const slots = input.slots;
  const startedAt = Date.now();
  const { fact, toolResults } = await runCostCenterMovementsWindow({
    analyticalTools: input.analyticalTools,
    tenantId: input.tenantId,
    now: input.now,
    endMonthKey: slots.monthKey,
    count: slots.windowMonths,
    direction: 'OUTFLOW',
    costCenterQuery: slots.costCenterMention,
    limit: slots.limit,
  });
  const durationMs = Date.now() - startedAt;
  const traces = toolResults
    .map((result) =>
      traceFromToolResult(result, 1, Math.round(durationMs / Math.max(1, toolResults.length)), {
        direction: 'OUTFLOW',
        costCenterQuery: slots.costCenterMention,
        limit: slots.limit,
      }),
    )
    .filter((trace): trace is AnalyticalToolTraceDraft => trace !== null);
  const status = typeof fact.status === 'string' ? fact.status : 'UNAVAILABLE';

  if (status === 'NOT_FOUND') {
    return input.limitationReply({
      content: costCenterNotFoundMessage(slots),
      structuredStatus: slots.entitySource === 'TEXT' ? 'NOT_FOUND' : 'UNRESOLVED',
      clarificationRequired: slots.entitySource !== 'TEXT',
      traces,
    });
  }
  if (status === 'AMBIGUOUS') {
    return input.limitationReply({
      content: 'Há mais de um centro de custo correspondente. Especifique o nome ou o código.',
      structuredStatus: 'AMBIGUOUS',
      clarificationRequired: true,
      traces,
    });
  }
  const answer = composeCostCenterMovementsWindowAnswer(fact);
  if (answer === null) {
    // UNAVAILABLE em todos os meses (ou falha técnica): sem valor inventado.
    return input.limitationReply({
      content:
        'Não há atribuição oficial de saídas por centro de custo disponível para os meses dessa janela, então não consigo apontar os maiores gastos com segurança.',
      structuredStatus: 'UNAVAILABLE',
      clarificationRequired: false,
      traces,
    });
  }

  const consultantMessage = await input.conversations.createMessage(
    input.tenantId,
    input.conversationId,
    { senderType: 'CONSULTANT', content: withOutflowMetricNote(input.question, answer) },
  );
  const resolvedName =
    typeof fact.resolvedCostCenter === 'string' && fact.resolvedCostCenter !== 'NONE'
      ? fact.resolvedCostCenter
      : null;
  if (resolvedName !== null && typeof input.conversations.saveAnalyticalContext === 'function') {
    // PARTIAL é factual com ressalva: mantém estado da família para follow-ups,
    // mas só OK/EMPTY promovem LastAnalyticalQuery (doc 21).
    const lastAnalyticalQuery =
      status === 'OK' || status === 'EMPTY_RESULT'
        ? lastAnalyticalQueryFromCostCenterMovements({
            monthKey: slots.monthKey,
            costCenterQuery: resolvedName,
            limit: slots.limit,
            structuredStatus: status,
            windowMonths: slots.windowMonths,
          })
        : null;
    const next = mergeAdvisorConversationBag(
      input.existingBag ?? parseAdvisorConversationBag(null),
      {
        costCenterOutflowMovements: costCenterOutflowMovementsState({
          monthKey: slots.monthKey,
          periodSource: slots.periodSource,
          windowMonths: slots.windowMonths,
          limit: slots.limit,
          costCenterQuery: resolvedName,
        }),
        lastAnalyticalQuery,
      },
    );
    await input.conversations.saveAnalyticalContext(
      input.tenantId,
      input.conversationId,
      serializeAdvisorConversationBag(next) as never,
    );
    if (input.onBagPersisted !== undefined) {
      await input.onBagPersisted(next);
    }
  }
  const analyticalOutcome = await input.recordTrail({
    consultantMessageId: consultantMessage.id,
    runId: null,
    answerSource: 'COST_CENTER',
    toolRoundCount: traces.length > 0 ? 1 : 0,
    traces,
    facts: closedTrailFacts(status, status === 'PARTIAL'),
  });
  const returnedCount = typeof fact.returnedCount === 'number' ? fact.returnedCount : null;
  return {
    consultantMessage,
    factualAnswer: {
      classification: 'FACTUAL_CLOSED',
      providerCalled: false,
      intentKind: 'COST_CENTER_MOVEMENT_LINES',
      factKind: COST_CENTER_MOVEMENTS_WINDOW_FACT_KIND,
      identityStatus: null,
      returnedCount,
      coveragePercent: null,
      composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
    },
    analyticalOutcome,
  };
}

function readCostCenterWinnerFromToolContent(
  content: string,
): { readonly costCenterId: string; readonly name: string } | null {
  try {
    return readAdvisorCostCenterRankingWinner(JSON.parse(content) as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function preloadCostCenterFollowUp(input: {
  readonly analyticalTools: AdvisorAnalyticalToolExecutor;
  readonly tenantId: string;
  readonly period: ReturnType<typeof resolveAdvisorConversationalPeriod>;
  readonly costCenterMonthKey: string;
  readonly followUp: {
    readonly toolName: string;
    readonly direction: 'INFLOW' | 'OUTFLOW';
    readonly limit: number;
    readonly costCenterQuery?: string;
    readonly monthKey?: string;
    readonly comparisonMonthKey?: string;
  } | null;
  readonly anaphora: string;
  readonly now?: Date;
}) {
  if (
    input.followUp === null ||
    input.followUp.costCenterQuery === undefined ||
    input.anaphora === 'ORDINAL_UNSUPPORTED' ||
    input.anaphora === 'AMBIGUOUS' ||
    input.anaphora === 'UNRESOLVED'
  ) {
    const reason =
      input.anaphora === 'ORDINAL_UNSUPPORTED'
        ? 'COST_CENTER_ORDINAL_UNSUPPORTED'
        : input.anaphora === 'AMBIGUOUS'
          ? 'MULTIPLE_COST_CENTER_ANTECEDENTS'
          : 'NO_UNEQUIVOCAL_COST_CENTER_ANTECEDENT';
    return {
      id: 'preload-cost-center-anaphora',
      name: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      ok: true,
      content: JSON.stringify({
        status: input.anaphora === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'UNRESOLVED',
        reason,
        monthKey: input.costCenterMonthKey,
        scope: 'PERIOD',
        factKind: 'REALIZED_CASH_COST_CENTER_DIMENSION_LOOKUP',
        costCenter: null,
      }),
      monthKey: input.costCenterMonthKey,
    };
  }
  if (input.followUp.toolName === COMPARE_CASH_COST_CENTER_TOOL_NAME) {
    const monthKey = input.followUp.monthKey ?? input.period.monthKey;
    const comparisonMonthKey =
      input.followUp.comparisonMonthKey ?? input.period.comparisonMonthKey;
    if (comparisonMonthKey === undefined) {
      return {
        id: 'preload-cost-center-compare',
        name: COMPARE_CASH_COST_CENTER_TOOL_NAME,
        ok: true,
        content: JSON.stringify({
          status: 'UNRESOLVED',
          reason: 'NO_UNEQUIVOCAL_COST_CENTER_ANTECEDENT',
          factKind: 'REALIZED_CASH_COST_CENTER_DIMENSION_COMPARE',
        }),
        monthKey,
      };
    }
    return input.analyticalTools.execute({
      tenantId: input.tenantId,
      resolvedMonthKey: monthKey,
      now: input.now,
      call: {
        id: 'preload-cost-center-compare',
        name: COMPARE_CASH_COST_CENTER_TOOL_NAME,
        arguments: {
          monthKey,
          comparisonMonthKey,
          direction: input.followUp.direction,
          costCenterQuery: input.followUp.costCenterQuery,
        },
      },
    });
  }
  if (input.followUp.toolName === CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME) {
    return input.analyticalTools.execute({
      tenantId: input.tenantId,
      resolvedMonthKey: input.costCenterMonthKey,
      now: input.now,
      call: {
        id: 'preload-cost-center-movements',
        name: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
        arguments: {
          monthKey: input.costCenterMonthKey,
          direction: input.followUp.direction,
          costCenterQuery: input.followUp.costCenterQuery,
          limit: input.followUp.limit,
        },
      },
    });
  }
  return input.analyticalTools.execute({
    tenantId: input.tenantId,
    resolvedMonthKey: input.costCenterMonthKey,
    now: input.now,
    call: {
      id: 'preload-cost-center-lookup',
      name: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      arguments: {
        monthKey: input.costCenterMonthKey,
        direction: input.followUp.direction,
        costCenterQuery: input.followUp.costCenterQuery,
      },
    },
  });
}

function isPartyProfileAnalyticalQuery(query: {
  readonly operation: string;
  readonly dimension?: string;
  readonly filters?: { readonly partyProfile?: string };
}): boolean {
  const profile = query.filters?.partyProfile;
  return (
    query.dimension === 'COUNTERPARTY' &&
    (profile === 'CUSTOMER' || profile === 'SUPPLIER') &&
    (query.operation === 'RANKING_WINNER' ||
      query.operation === 'RANKING_TOPN' ||
      query.operation === 'LOOKUP' ||
      query.operation === 'SHARE')
  );
}

function validatePartyQuery(query: AnalyticalQuery): boolean {
  const validation = validateAnalyticalCapability(query);
  return validation.ok === true;
}

async function answerCounterpartyQuery(input: {
  readonly deps: {
    readonly conversations: {
      createMessage: SendAdvisorMessageDependencies['conversations']['createMessage'];
      saveAnalyticalContext?: SendAdvisorMessageDependencies['conversations']['saveAnalyticalContext'];
      findConversation?: SendAdvisorMessageDependencies['conversations']['findConversation'];
    };
    readonly counterpartyIdentity?: SendAdvisorMessageDependencies['counterpartyIdentity'];
  };
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly userMessage: AiMessageRecord;
  readonly query: AnalyticalQuery;
  readonly now?: Date;
  readonly existingBag?: AdvisorConversationBag;
  readonly recordTrail: (input: {
    readonly consultantMessageId: string | null;
    readonly runId: string | null;
    readonly answerSource: AnalyticalAnswerSource;
    readonly toolRoundCount: number;
    readonly traces: readonly AnalyticalToolTraceDraft[];
    readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
  }) => Promise<AnalyticalOutcome>;
}): Promise<SendAdvisorMessageResult> {
  const outcome = await executeAnalyticalQuery({
    query: input.query,
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      counterpartyIdentity: input.deps.counterpartyIdentity,
    },
  });
  const answer =
    outcome.ok === true && typeof outcome.legacyFact.answer === 'string'
      ? outcome.legacyFact.answer
      : 'Não consigo fechar esse recorte com segurança porque a identificação oficial dessa contraparte não está disponível.';
  if (outcome.ok === true) {
    await saveCounterpartyState(
      input.deps,
      input.tenantId,
      input.conversationId,
      stateFromLegacy(input.query, outcome.legacyFact),
      {
        userId: input.userId,
        existingBag: input.existingBag,
      },
    );
  }
  const consultantMessage = await input.deps.conversations.createMessage(
    input.tenantId,
    input.conversationId,
    { senderType: 'CONSULTANT', content: answer },
  );
  console.info(
    JSON.stringify({
      event: 'advisor_counterparty_quality',
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      decision: outcome.ok === true ? outcome.legacyFact.decision ?? null : 'UNAVAILABLE',
      reasonCode: outcome.ok === true ? outcome.legacyFact.reasonCode ?? null : outcome.reason,
      direction: input.query.direction ?? null,
      partyProfile: input.query.filters?.partyProfile ?? null,
      operation: input.query.operation,
    }),
  );
  const decision = outcome.ok === true ? String(outcome.legacyFact.decision ?? 'PARTIAL') : 'UNAVAILABLE';
  const reasonCode =
    outcome.ok === true
      ? typeof outcome.legacyFact.reasonCode === 'string'
        ? outcome.legacyFact.reasonCode
        : null
      : null;
  const counterpartyFacts = signalFromCounterparty(decision, reasonCode);
  const analyticalOutcome = await input.recordTrail({
    consultantMessageId: consultantMessage.id,
    runId: null,
    answerSource: 'COUNTERPARTY',
    toolRoundCount: 0,
    traces: [],
    facts: {
      providerFailed: false,
      capabilityDenied: false,
      ...counterpartyFacts,
    },
  });
  return {
    ...closedCounterparty(input.conversationId, input.userMessage, consultantMessage, decision),
    analyticalOutcome,
  };
}

function stateFromLegacy(
  query: AnalyticalQuery,
  legacyFact: Record<string, unknown>,
): AnalyticalConversationState | null {
  if (query.direction !== 'INFLOW' && query.direction !== 'OUTFLOW') {
    return null;
  }
  const profile = query.filters?.partyProfile;
  if (profile !== 'CUSTOMER' && profile !== 'SUPPLIER') {
    return null;
  }
  const decision = legacyFact.decision;
  const periodCoverage = legacyFact.periodCoverage;
  if (decision !== 'AVAILABLE' && decision !== 'PARTIAL' && decision !== 'UNAVAILABLE') {
    return null;
  }
  if (periodCoverage !== 'COMPLETE' && periodCoverage !== 'PARTIAL' && periodCoverage !== 'UNKNOWN') {
    return null;
  }
  const rows = Array.isArray(legacyFact.rows) ? legacyFact.rows : [];
  return {
    version: 1,
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: query.direction,
    period: query.period,
    dimension: 'COUNTERPARTY',
    operation: query.operation,
    partyProfile: profile,
    limit: query.limit ?? null,
    rows: rows.flatMap((row) => {
      if (row === null || typeof row !== 'object') {
        return [];
      }
      const item = row as Record<string, unknown>;
      if (typeof item.displayName !== 'string' || typeof item.amount !== 'string') {
        return [];
      }
      return [
        {
          rank: typeof item.rank === 'number' ? item.rank : 1,
          displayName: item.displayName,
          amount: item.amount,
          movementCount: typeof item.movementCount === 'number' ? item.movementCount : 0,
        },
      ];
    }),
    focusDisplayName: typeof legacyFact.focusDisplayName === 'string' ? legacyFact.focusDisplayName : null,
    decision,
    periodCoverage,
    reasonCode: typeof legacyFact.reasonCode === 'string' ? legacyFact.reasonCode : '',
  };
}

async function saveCounterpartyState(
  deps: {
    readonly conversations: {
      saveAnalyticalContext?: SendAdvisorMessageDependencies['conversations']['saveAnalyticalContext'];
      findConversation?: SendAdvisorMessageDependencies['conversations']['findConversation'];
    };
  },
  tenantId: string,
  conversationId: string,
  state: AnalyticalConversationState | null,
  options?: {
    readonly userId?: string;
    readonly existingBag?: AdvisorConversationBag;
  },
): Promise<void> {
  if (typeof deps.conversations.saveAnalyticalContext !== 'function') {
    return;
  }
  let base = options?.existingBag ?? parseAdvisorConversationBag(null);
  if (
    options?.existingBag === undefined &&
    typeof deps.conversations.findConversation === 'function' &&
    options?.userId !== undefined
  ) {
    const row = await deps.conversations.findConversation(
      tenantId,
      options.userId,
      conversationId,
    );
    base = parseAdvisorConversationBag(row?.analyticalContext ?? null);
  }
  const next = mergeAdvisorConversationBag(base, {
    counterparty:
      state === null ? null : (JSON.parse(JSON.stringify(state)) as AnalyticalConversationState),
  });
  await deps.conversations.saveAnalyticalContext(
    tenantId,
    conversationId,
    serializeAdvisorConversationBag(next) as never,
  );
}

function traceFromToolResult(
  result: {
    readonly name?: string;
    readonly content?: string;
    readonly resultCardinality?: number;
  },
  round: number,
  durationMs?: number | null,
  args?: Record<string, unknown>,
): AnalyticalToolTraceDraft | null {
  if (typeof result.name !== 'string' || typeof result.content !== 'string') {
    return null;
  }
  return deriveAnalyticalToolTrace({
    name: result.name,
    content: result.content,
    durationMs,
    round,
    resultCardinality: result.resultCardinality,
    arguments: args,
  });
}

function closedTrailFacts(
  structuredStatus: string | null,
  factualPartial = false,
): Omit<AnalyticalTrailFacts, 'traces'> {
  return {
    providerFailed: false,
    capabilityDenied: false,
    clarificationRequired: false,
    factualClosed: true,
    factualPartial,
    structuredStatus,
  };
}

function openProviderFacts(providerFailed: boolean): Omit<AnalyticalTrailFacts, 'traces'> {
  return {
    providerFailed,
    capabilityDenied: false,
    clarificationRequired: false,
    factualClosed: false,
    factualPartial: false,
    structuredStatus: null,
  };
}

function closedCounterparty(
  conversationId: string,
  userMessage: AiMessageRecord,
  consultantMessage: AiMessageRecord,
  decision: string,
): Omit<SendAdvisorMessageResult, 'analyticalOutcome'> {
  return {
    conversationId,
    userMessage,
    consultantMessage,
    run: null,
    factualAnswer: {
      classification: 'FACTUAL_CLOSED' as const,
      providerCalled: false as const,
      intentKind:
        decision === 'AVAILABLE' ? ('RANKING_WINNER' as const) : ('FACTUAL_LIMITATION' as const),
      factKind: 'COUNTERPARTY_IDENTITY_QUALITY',
      identityStatus: decision,
      returnedCount: null,
      coveragePercent: null,
      composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
    },
  };
}

function isRunErrorCode(code: string): code is AiRunErrorCode {
  return (
    code === 'AUTH' ||
    code === 'RATE_LIMIT' ||
    code === 'TIMEOUT' ||
    code === 'MODEL_UNAVAILABLE' ||
    code === 'BAD_REQUEST' ||
    code === 'CONTENT_REJECTED' ||
    code === 'PROVIDER_ERROR' ||
    code === 'UNKNOWN'
  );
}

/**
 * Resolução semântica de PendingAnalyticalAction antes do pipeline analítico.
 * Zero overhead quando não há pending (U).
 */
async function tryHandlePendingAnalyticalAction(input: {
  readonly deps: SendAdvisorMessageDependencies;
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly question: string;
  readonly periodMonthKey: string;
  readonly now?: Date;
  readonly readyProvider: GenerationInput['provider'];
  readonly readyModel: string;
  readonly conversationBag: AdvisorConversationBag;
  readonly persistBag: (next: AdvisorConversationBag) => Promise<void>;
  readonly userMessage: AiMessageRecord;
  readonly recordTrail: (trailInput: {
    readonly consultantMessageId: string | null;
    readonly runId: string | null;
    readonly answerSource: AnalyticalAnswerSource;
    readonly toolRoundCount: number;
    readonly traces: AnalyticalToolTraceDraft[];
    readonly facts: Omit<AnalyticalTrailFacts, 'traces'>;
  }) => Promise<AnalyticalOutcome>;
}): Promise<SendAdvisorMessageResult | null> {
  const pending = input.conversationBag.slots.pendingAnalyticalAction;
  if (pending === null) {
    return null;
  }

  const now = input.now ?? new Date();
  const executable = isPendingActionExecutable(pending, now);
  if (!executable.ok) {
    const marked =
      executable.reason === 'EXPIRED' ? markPendingExpired(pending) : markPendingConsumed(pending);
    await input.persistBag(
      mergeAdvisorConversationBag(input.conversationBag, {
        pendingAnalyticalAction: marked.status === 'EXPIRED' ? marked : null,
      }),
    );
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_skipped',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pendingId: pending.id,
        reason: executable.reason,
      }),
    );
    return null;
  }

  const provider = input.deps.providers.resolve(input.readyProvider);
  if (provider.id !== input.readyProvider) {
    throw new IaProviderError('PROVIDER_ERROR', 'Registry devolveu provider diferente do configurado.');
  }

  const resolution = await resolvePendingAnalyticalActionDecision({
    provider,
    providerId: input.readyProvider,
    model: input.readyModel,
    tenantId: input.tenantId,
    userMessage: input.question,
    pending,
  });

  if (resolution === null) {
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_resolve_failed',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pendingId: pending.id,
      }),
    );
    return null;
  }

  console.info(
    JSON.stringify({
      event: 'advisor_pending_action_resolved',
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pendingId: pending.id,
      decision: resolution.decision,
      domain: pending.domain,
      operation: pending.operation,
      extraProviderCalls: 1,
    }),
  );

  if (resolution.decision === 'UNRELATED') {
    await input.persistBag(
      mergeAdvisorConversationBag(input.conversationBag, {
        pendingAnalyticalAction: null,
      }),
    );
    return null;
  }

  if (resolution.decision === 'REJECT') {
    await input.persistBag(
      mergeAdvisorConversationBag(input.conversationBag, {
        pendingAnalyticalAction: markPendingRejected(pending),
      }),
    );
    const consultantMessage = await input.deps.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      {
        senderType: 'CONSULTANT',
        content: 'Certo — não sigo com essa consulta. Se quiser outra leitura, é só pedir.',
      },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'PROVIDER',
      toolRoundCount: 0,
      traces: [],
      facts: closedTrailFacts('OK'),
    });
    return {
      conversationId: input.conversationId,
      userMessage: input.userMessage,
      consultantMessage,
      run: null,
      factualAnswer: null,
      analyticalOutcome,
    };
  }

  // Aceite genérico / MODIFY em oferta A OU B → clarificar; pending permanece ACTIVE.
  // Nunca escolher A ou B arbitrariamente; nunca responder eco ("Pode seguir.").
  if (
    isPendingAlternativesOffer(pending) &&
    (resolution.decision === 'AMBIGUOUS_ACCEPT' ||
      resolution.decision === 'ACCEPT' ||
      resolution.decision === 'MODIFY')
  ) {
    const clarification = buildPendingAlternativesClarification(pending);
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_clarification',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pendingId: pending.id,
        offerKind: pending.offerKind,
        alternativeCount: pending.alternatives?.length ?? 0,
        resolveDecision: resolution.decision,
        pendingKept: 'PENDING',
      }),
    );
    const consultantMessage = await input.deps.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      {
        senderType: 'CONSULTANT',
        content: clarification,
      },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'PROVIDER',
      toolRoundCount: 0,
      traces: [],
      facts: closedTrailFacts('OK'),
    });
    return {
      conversationId: input.conversationId,
      userMessage: input.userMessage,
      consultantMessage,
      run: null,
      factualAnswer: null,
      analyticalOutcome,
    };
  }

  let actionToRun: PendingAnalyticalAction = pending;
  if (resolution.decision === 'SELECT_ALTERNATIVE') {
    if (
      resolution.alternativeId === null ||
      !isPendingAlternativesOffer(pending)
    ) {
      const clarification = isPendingAlternativesOffer(pending)
        ? buildPendingAlternativesClarification(pending)
        : 'Não consegui identificar qual caminho seguir. Pode escolher uma das opções oferecidas?';
      const consultantMessage = await input.deps.conversations.createMessage(
        input.tenantId,
        input.conversationId,
        { senderType: 'CONSULTANT', content: clarification },
      );
      const analyticalOutcome = await input.recordTrail({
        consultantMessageId: consultantMessage.id,
        runId: null,
        answerSource: 'PROVIDER',
        toolRoundCount: 0,
        traces: [],
        facts: closedTrailFacts('UNRESOLVED'),
      });
      return {
        conversationId: input.conversationId,
        userMessage: input.userMessage,
        consultantMessage,
        run: null,
        factualAnswer: null,
        analyticalOutcome,
      };
    }
    const selected = materializePendingAlternative(pending, resolution.alternativeId);
    if (selected === null) {
      const clarification = buildPendingAlternativesClarification(pending);
      const consultantMessage = await input.deps.conversations.createMessage(
        input.tenantId,
        input.conversationId,
        { senderType: 'CONSULTANT', content: clarification },
      );
      const analyticalOutcome = await input.recordTrail({
        consultantMessageId: consultantMessage.id,
        runId: null,
        answerSource: 'PROVIDER',
        toolRoundCount: 0,
        traces: [],
        facts: closedTrailFacts('UNRESOLVED'),
      });
      return {
        conversationId: input.conversationId,
        userMessage: input.userMessage,
        consultantMessage,
        run: null,
        factualAnswer: null,
        analyticalOutcome,
      };
    }
    actionToRun = selected;
  } else if (resolution.decision === 'MODIFY') {
    const patched = applyPendingPatch(pending, resolution.patch);
    if (patched === null) {
      console.info(
        JSON.stringify({
          event: 'advisor_pending_action_patch_rejected',
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          pendingId: pending.id,
        }),
      );
      const consultantMessage = await input.deps.conversations.createMessage(
        input.tenantId,
        input.conversationId,
        {
          senderType: 'CONSULTANT',
          content:
            'Não consigo aplicar esse ajuste com segurança na ação pendente. Reformule o recorte (mês, centro ou limite) ou peça de novo a consulta.',
        },
      );
      const analyticalOutcome = await input.recordTrail({
        consultantMessageId: consultantMessage.id,
        runId: null,
        answerSource: 'PROVIDER',
        toolRoundCount: 0,
        traces: [],
        facts: closedTrailFacts('UNRESOLVED'),
      });
      return {
        conversationId: input.conversationId,
        userMessage: input.userMessage,
        consultantMessage,
        run: null,
        factualAnswer: null,
        analyticalOutcome,
      };
    }
    actionToRun = patched;
  }

  // Consome antes da execução para idempotência / anti-replay.
  await input.persistBag(
    mergeAdvisorConversationBag(input.conversationBag, {
      pendingAnalyticalAction: markPendingConsumed(actionToRun),
    }),
  );

  const snapshotOnly = actionToRun.steps.every((step) => step.toolName === null);
  if (!snapshotOnly && input.deps.analyticalTools === undefined) {
    const consultantMessage = await input.deps.conversations.createMessage(
      input.tenantId,
      input.conversationId,
      {
        senderType: 'CONSULTANT',
        content: 'A ação pendente não pode ser executada neste momento (tools indisponíveis).',
      },
    );
    const analyticalOutcome = await input.recordTrail({
      consultantMessageId: consultantMessage.id,
      runId: null,
      answerSource: 'PROVIDER',
      toolRoundCount: 0,
      traces: [],
      facts: closedTrailFacts('UNRESOLVED'),
    });
    return {
      conversationId: input.conversationId,
      userMessage: input.userMessage,
      consultantMessage,
      run: null,
      factualAnswer: null,
      analyticalOutcome,
    };
  }

  const execution =
    snapshotOnly || input.deps.analyticalTools === undefined
      ? ({ status: 'OK' as const, executions: [], snapshotOnly: true })
      : await executePendingAnalyticalAction({
          action: actionToRun,
          tenantId: input.tenantId,
          resolvedMonthKey: input.periodMonthKey,
          analyticalTools: input.deps.analyticalTools,
          now: input.now,
        });

  let snapshotFactsText: string | null = null;
  if (pendingActionHasSnapshotPreloadStep(actionToRun)) {
    try {
      const built = await input.deps.context.build({
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        question: input.question,
        monthKey: input.periodMonthKey,
        now: input.now,
      });
      const factBlocks = built.blocks.filter(
        (block) => block.type === 'FINANCIAL_FACTS' || block.type === 'ANALYTICAL_FACTS',
      );
      snapshotFactsText = factBlocks.map((block) => block.content).join('\n').slice(0, 2_000);
    } catch {
      snapshotFactsText = null;
    }
  }

  // EXECUTION RESULT ≠ USER-FACING RESPONSE: provider compõe linguagem natural;
  // evidence gate (finalizeAdvisorAgentAnswer) valida grounding.
  const toolRounds: IaToolRound[] =
    execution.status === 'UNAVAILABLE'
      ? []
      : [
          {
            calls: execution.executions.map((exec) => ({
              id: exec.id,
              name: exec.name,
              arguments: exec.arguments,
            })),
            results: execution.executions.map((exec) => ({
              id: exec.id,
              name: exec.name,
              ok: exec.ok,
              content: exec.content,
              resultCardinality: exec.resultCardinality ?? 0,
            })),
          },
        ];

  const composeBlocks = buildPendingActionComposeBlocks({
    action: actionToRun,
    execution,
    snapshotFactsText,
    userMessage: input.question,
    resolvedMonthKey: input.periodMonthKey,
  });

  let answerText: string;
  try {
    const drafted = await provider.generate({
      tenantId: input.tenantId,
      provider: input.readyProvider,
      model: input.readyModel,
      blocks: composeBlocks,
      ...(toolRounds.length > 0 ? { toolRounds } : {}),
    });
    const finalized = await finalizeAdvisorAgentAnswer({
      text: drafted.text,
      usage: drafted.usage,
      blocks: composeBlocks,
      toolRounds,
      executedToolCount: toolRounds.reduce((n, round) => n + round.results.length, 0),
      generate: (payload) => provider.generate(payload),
      tenantId: input.tenantId,
      providerId: input.readyProvider,
      model: input.readyModel,
      explicitCostCenter: { status: 'ABSENT' },
    });
    answerText = finalized.text;
  } catch (error) {
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_compose_failed',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pendingId: actionToRun.id,
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
    answerText = pendingActionCompositionFallback();
  }

  if (pendingAnswerLooksLikeTechnicalDump(answerText)) {
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_compose_leakage_blocked',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pendingId: actionToRun.id,
      }),
    );
    answerText = pendingActionCompositionFallback();
  }

  const consultantMessage = await input.deps.conversations.createMessage(
    input.tenantId,
    input.conversationId,
    {
      senderType: 'CONSULTANT',
      content: sanitizeConsultantText(answerText),
    },
  );

  const traces: AnalyticalToolTraceDraft[] = [];
  if (execution.status !== 'UNAVAILABLE') {
    for (const [index, exec] of execution.executions.entries()) {
      const trace = traceFromToolResult(
        {
          name: exec.name,
          content: exec.content,
          resultCardinality: exec.resultCardinality,
        },
        1,
        undefined,
        exec.arguments,
      );
      if (trace !== null) {
        traces.push({ ...trace, round: index + 1 });
      }
    }
  }

  const analyticalOutcome = await input.recordTrail({
    consultantMessageId: consultantMessage.id,
    runId: null,
    answerSource: 'PROVIDER',
    toolRoundCount: traces.length > 0 ? 1 : 0,
    traces,
    facts: closedTrailFacts(
      execution.status === 'OK' ? 'OK' : execution.status === 'PARTIAL_UNAVAILABLE' ? 'PARTIAL' : 'UNRESOLVED',
      execution.status === 'PARTIAL_UNAVAILABLE',
    ),
  });

  console.info(
    JSON.stringify({
      event: 'advisor_pending_action_executed',
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pendingId: actionToRun.id,
      decision: resolution.decision,
      domain: actionToRun.domain,
      operation: actionToRun.operation,
      executionStatus: execution.status,
      toolCount: execution.status === 'UNAVAILABLE' ? 0 : execution.executions.length,
      status: 'CONSUMED',
    }),
  );

  return {
    conversationId: input.conversationId,
    userMessage: input.userMessage,
    consultantMessage,
    run: null,
    factualAnswer: null,
    analyticalOutcome,
  };
}

/**
 * Finalização comum: extract semântico de oferta → PendingAnalyticalAction.
 * Gate estrutural (path/source), não dicionário de frases.
 * +1 provider quando elegível; 0 quando META/erro/capability-denied.
 */
async function maybePersistPendingOfferFromAssistant(input: {
  readonly deps: SendAdvisorMessageDependencies;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly consultantMessageId: string;
  readonly assistantText: string;
  readonly resolvedMonthKey: string;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly conversationBag: AdvisorConversationBag;
  readonly persistBag: (next: AdvisorConversationBag) => Promise<void>;
  readonly now?: Date;
  readonly answerSource: AnalyticalAnswerSource | string;
  readonly pathKind: PendingExtractPathKind;
  readonly toolEvidence?: readonly {
    readonly toolName: string;
    readonly ok: boolean;
    readonly contentPreview: string;
  }[];
}): Promise<void> {
  if (typeof input.deps.conversations.saveAnalyticalContext !== 'function') {
    return;
  }

  const eligibility = isReplyEligibleForPendingExtract({
    pathKind: input.pathKind,
    answerSource: input.answerSource,
    assistantText: input.assistantText,
  });
  if (!eligibility.eligible) {
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_extract',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        decision: 'NO_PENDING_ACTION',
        reason: eligibility.reason,
        answerSource: input.answerSource,
        pathKind: input.pathKind,
        extraProviderCalls: 0,
      }),
    );
    return;
  }

  const provider = input.deps.providers.resolve(input.providerId);
  if (provider.id !== input.providerId) {
    return;
  }

  const extracted = await extractPendingAnalyticalActionFromOffer({
    provider,
    providerId: input.providerId,
    model: input.model,
    tenantId: input.tenantId,
    assistantText: input.assistantText,
    createdFromMessageId: input.consultantMessageId,
    resolvedMonthKey: input.resolvedMonthKey,
    toolEvidence: input.toolEvidence,
    now: input.now,
  });

  if (extracted === null) {
    console.info(
      JSON.stringify({
        event: 'advisor_pending_action_extract',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        decision: 'NO_PENDING_ACTION',
        reason: 'EXTRACTOR_NO_PENDING',
        answerSource: input.answerSource,
        pathKind: input.pathKind,
        extraProviderCalls: 1,
      }),
    );
    return;
  }

  await input.persistBag(
    mergeAdvisorConversationBag(input.conversationBag, {
      pendingAnalyticalAction: extracted,
    }),
  );

  console.info(
    JSON.stringify({
      event: 'advisor_pending_action_extract',
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      decision: 'PENDING_ANALYTICAL_ACTION',
      pendingId: extracted.id,
      domain: extracted.domain,
      operation: extracted.operation,
      stepCount: extracted.steps.length,
      answerSource: input.answerSource,
      pathKind: input.pathKind,
      extraProviderCalls: 1,
    }),
  );
}
