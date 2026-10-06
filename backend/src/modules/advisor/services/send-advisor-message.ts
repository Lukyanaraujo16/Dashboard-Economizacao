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
import { runAdvisorDailyCashMovement } from '../domain/run-advisor-daily-cash-movement.js';
import { parseDailyCashMovementConversationState } from '../domain/daily-cash-movement-conversation-state.js';
import type { CashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { MonthlyPlanningServices } from '../domain/load-monthly-planning-fact.js';
import { executeAnalyticalQuery } from '../domain/analytical/execute-analytical-query.js';
import { validateAnalyticalCapability } from '../domain/analytical/validate-analytical-capability.js';
import {
  parseAnalyticalConversationState,
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
  parseCostCenterOutflowMovementsConversationState,
} from '../domain/cost-center-outflow-movements-conversation-state.js';
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

      const priorState = parseAnalyticalConversationState(conversation.analyticalContext);
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
        const billing = await runAdvisorBillingAnswer({
          content: question,
          tenantId,
          monthKey: period.monthKey,
          now: input.now,
          cashFlow: deps.monthlyPlanning.cashFlow,
        });
        if (billing !== null) {
          const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
            senderType: 'CONSULTANT',
            content: billing.answer,
          });
          const analyticalOutcome = await recordTrail({
            consultantMessageId: consultantMessage.id,
            runId: null,
            answerSource: billing.intentKind === 'BILLING_SERIES' ? 'BILLING_SERIES' : 'BILLING',
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
      if (deps.dailyCashMovements !== undefined && !isAdvisorInterpretiveQuestion(question)) {
        const daily = await runAdvisorDailyCashMovement({
          content: question,
          referenceMonthKey: period.monthKey,
          now: input.now,
          priorState: parseDailyCashMovementConversationState(conversation.analyticalContext),
          tenantId,
          details: deps.dailyCashMovements.details,
          costCenters: deps.dailyCashMovements.costCenters,
        });
        if (daily !== null) {
          if (daily.state !== null) {
            await deps.conversations.saveAnalyticalContext(tenantId, conversation.id, daily.state);
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
          userMessage,
          query: universalIntent.query,
          now: input.now,
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
          await saveCounterpartyState(deps, tenantId, conversation.id, null);
        }
        if (followUp.kind === 'ORDINAL' && priorState !== null) {
          const ordinal = composeOrdinalAnswer({ state: priorState, rank: followUp.rank });
          await saveCounterpartyState(deps, tenantId, conversation.id, {
            ...priorState,
            focusDisplayName: ordinal.focusDisplayName,
          });
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
              userMessage,
              query: followUp.query,
              now: input.now,
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
        const priorMovementsState = parseCostCenterOutflowMovementsConversationState(
          conversation.analyticalContext,
        );
        const assembled = assembleCostCenterOutflowMovementsPlan({
          content: question,
          period,
          priorState: priorMovementsState,
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
        const analyticalOutcome = await recordTrail({
          consultantMessageId: consultantMessage.id,
          runId: null,
          answerSource: answerSourceFromIntent(
            composed.meta.intentKind === 'FACTUAL_LIMITATION' ? null : composed.meta.intentKind,
            sourceTool,
          ),
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
          blocks: contextForProvider.blocks,
          generate: (payload) => provider.generate(payload),
          analyticalTools: deps.analyticalTools,
          now: input.now,
          observed,
          questionScope: questionToolScope,
          explicitCostCenter: questionDemand.explicitCostCenter,
          questionDemand,
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
  const gated = gateAdvisorEvidenceBoundAnswer({
    answerText: input.text,
    evidenceItems,
    agentToolPath,
    requiredEntityScope,
    requiredCostCenterName,
  });
  if (gated.ok) {
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
    }),
  );

  let usage = input.usage;
  try {
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
            'Não invente números. Se não houver cifra oficial compatível com o escopo, declare a limitação.',
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
      rewriteText: rewrite.text,
      evidenceItems,
      requiredEntityScope,
      requiredCostCenterName,
    });
    console.info(
      JSON.stringify({
        event: 'advisor_agent_evidence_gate',
        tenantId: input.tenantId,
        mode: 'AGENT_TOOL',
        status: afterRewrite.ok ? 'OK' : afterRewrite.reason,
        reason: afterRewrite.reason,
        outcome: afterRewrite.ok ? 'REWRITE_ACCEPTED' : 'DETERMINISTIC_LIMITATION',
      }),
    );
    return { text: afterRewrite.text, usage };
  } catch {
    console.info(
      JSON.stringify({
        event: 'advisor_agent_evidence_gate',
        tenantId: input.tenantId,
        mode: 'AGENT_TOOL',
        status: gated.reason,
        reason: gated.reason,
        outcome: 'DETERMINISTIC_LIMITATION',
      }),
    );
    return { text: gated.text, usage };
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
      items.push({
        text: block.content,
        entityScope: inferEvidenceEntityScope(block.content),
        source: block.type === 'ANALYTICAL_FACTS' ? 'ANALYTICAL_FACTS' : 'PRESENTED_INSIGHT_FACTS',
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
    { senderType: 'CONSULTANT', content: composed.answer },
  );
  const resolvedName = readResolvedCostCenterName(toolResult.content);
  const structuredStatus = readStructuredStatus(toolResult.content) ?? 'OK';
  if (
    (structuredStatus === 'OK' || structuredStatus === 'EMPTY_RESULT') &&
    resolvedName !== null &&
    typeof input.conversations.saveAnalyticalContext === 'function'
  ) {
    await input.conversations.saveAnalyticalContext(
      input.tenantId,
      input.conversationId,
      costCenterOutflowMovementsState({
        monthKey: slots.monthKey,
        periodSource: slots.periodSource,
        limit: slots.limit,
        costCenterQuery: resolvedName,
      }),
    );
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
    };
    readonly counterpartyIdentity?: SendAdvisorMessageDependencies['counterpartyIdentity'];
  };
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userMessage: AiMessageRecord;
  readonly query: AnalyticalQuery;
  readonly now?: Date;
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
    };
  },
  tenantId: string,
  conversationId: string,
  state: AnalyticalConversationState | null,
): Promise<void> {
  if (typeof deps.conversations.saveAnalyticalContext !== 'function') {
    return;
  }
  const payload =
    state === null ? null : (JSON.parse(JSON.stringify(state)) as AnalyticalConversationState);
  await deps.conversations.saveAnalyticalContext(tenantId, conversationId, payload);
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
