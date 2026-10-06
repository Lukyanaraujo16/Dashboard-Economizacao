import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import {
  ANALYTICAL_ANSWER_SOURCES,
  ANALYTICAL_OUTCOMES,
  ANALYTICAL_TOOL_FAILURE_REASONS,
  ANALYTICAL_TOOL_TRACE_STATUSES,
  ANALYTICAL_UNRESOLVED_DIMENSIONS,
  type AnalyticalAnswerSource,
  type AnalyticalOutcome,
  type AnalyticalToolFailureReason,
  type AnalyticalToolTraceStatus,
  type AnalyticalUnresolvedDimension,
} from '../domain/classify-analytical-outcome.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

export type RecordAnalyticalToolTraceInput = {
  readonly round: number;
  readonly toolName: string;
  readonly known: boolean;
  readonly status: AnalyticalToolTraceStatus;
  readonly reason: AnalyticalToolFailureReason | null;
  readonly durationMs: number | null;
  readonly resultCardinality: number | null;
};

export type RecordAnalyticalResultInput = {
  readonly conversationId: string;
  readonly userMessageId: string;
  readonly consultantMessageId: string | null;
  readonly runId: string | null;
  readonly outcome: AnalyticalOutcome;
  readonly answerSource: AnalyticalAnswerSource;
  readonly toolCallCount: number;
  readonly toolRoundCount: number;
  readonly unresolvedDimension: AnalyticalUnresolvedDimension | null;
  readonly unresolvedEntity: string | null;
  readonly durationMs: number | null;
  readonly traces: readonly RecordAnalyticalToolTraceInput[];
};

export type AnalyticalResultListItem = {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userMessageId: string;
  readonly consultantMessageId: string | null;
  readonly runId: string | null;
  readonly outcome: AnalyticalOutcome;
  readonly answerSource: AnalyticalAnswerSource;
  readonly toolCallCount: number;
  readonly toolRoundCount: number;
  readonly unresolvedDimension: AnalyticalUnresolvedDimension | null;
  readonly unresolvedEntity: string | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
  readonly run: {
    readonly provider: string;
    readonly model: string;
    readonly status: string;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly errorCode: string | null;
  } | null;
  readonly toolTraces: readonly {
    readonly round: number;
    readonly toolName: string;
    readonly known: boolean;
    readonly status: AnalyticalToolTraceStatus;
    readonly reason: AnalyticalToolFailureReason | null;
    readonly durationMs: number | null;
    readonly resultCardinality: number | null;
  }[];
};

function assertMember<T extends string>(value: string, allowed: readonly T[], code: string): asserts value is T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new AdvisorDomainError(code, 'Valor de trilha analítica inválido.');
  }
}

export type AdvisorAnalyticalResultRepository = {
  record(tenantId: string, input: RecordAnalyticalResultInput): Promise<{ id: string }>;
  list(query: {
    readonly tenantId?: string;
    readonly outcome?: AnalyticalOutcome;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ items: readonly AnalyticalResultListItem[]; total: number }>;
};

export function createAdvisorAnalyticalResultRepository(
  prisma: PrismaClient,
): AdvisorAnalyticalResultRepository {
  return {
    async record(tenantId, input) {
      assertAdvisorTenantId(tenantId);
      const scopedTenantId = tenantId.trim();
      assertMember(input.outcome, ANALYTICAL_OUTCOMES, 'ANALYTICAL_OUTCOME_INVALID');
      assertMember(input.answerSource, ANALYTICAL_ANSWER_SOURCES, 'ANALYTICAL_ANSWER_SOURCE_INVALID');
      if (input.unresolvedDimension !== null) {
        assertMember(
          input.unresolvedDimension,
          ANALYTICAL_UNRESOLVED_DIMENSIONS,
          'ANALYTICAL_DIMENSION_INVALID',
        );
      }
      for (const trace of input.traces) {
        assertMember(trace.status, ANALYTICAL_TOOL_TRACE_STATUSES, 'ANALYTICAL_TOOL_STATUS_INVALID');
        if (trace.reason !== null) {
          assertMember(trace.reason, ANALYTICAL_TOOL_FAILURE_REASONS, 'ANALYTICAL_TOOL_REASON_INVALID');
        }
      }

      const userMessage = await prisma.aiMessage.findFirst({
        where: { id: input.userMessageId, tenantId: scopedTenantId },
        select: { id: true, conversationId: true, senderType: true },
      });
      if (
        userMessage === null ||
        userMessage.conversationId !== input.conversationId ||
        userMessage.senderType !== 'USER'
      ) {
        throw new AdvisorDomainError(
          'ANALYTICAL_RESULT_MESSAGE_MISMATCH',
          'A pergunta da trilha não pertence a este tenant.',
        );
      }

      if (input.consultantMessageId !== null) {
        const consultantMessage = await prisma.aiMessage.findFirst({
          where: { id: input.consultantMessageId, tenantId: scopedTenantId },
          select: { conversationId: true, senderType: true },
        });
        if (
          consultantMessage === null ||
          consultantMessage.conversationId !== input.conversationId ||
          consultantMessage.senderType !== 'CONSULTANT'
        ) {
          throw new AdvisorDomainError(
            'ANALYTICAL_RESULT_REPLY_MISMATCH',
            'A resposta da trilha não pertence a esta conversa.',
          );
        }
      }

      if (input.runId !== null) {
        const run = await prisma.aiRun.findFirst({
          where: { id: input.runId, tenantId: scopedTenantId },
          select: { conversationId: true },
        });
        if (run === null || run.conversationId !== input.conversationId) {
          throw new AdvisorDomainError(
            'ANALYTICAL_RESULT_RUN_MISMATCH',
            'A execução técnica não pertence a esta conversa.',
          );
        }
      }

      const created = await prisma.aiAnalyticalResult.create({
        data: {
          tenantId: scopedTenantId,
          conversationId: input.conversationId,
          userMessageId: input.userMessageId,
          consultantMessageId: input.consultantMessageId,
          runId: input.runId,
          outcome: input.outcome,
          answerSource: input.answerSource,
          toolCallCount: input.toolCallCount,
          toolRoundCount: input.toolRoundCount,
          unresolvedDimension: input.unresolvedDimension,
          unresolvedEntity: input.unresolvedEntity,
          durationMs: input.durationMs,
          toolTraces: {
            create: input.traces.map((trace) => ({
              tenantId: scopedTenantId,
              round: trace.round,
              toolName: trace.toolName,
              known: trace.known,
              status: trace.status,
              reason: trace.reason,
              durationMs: trace.durationMs,
              resultCardinality: trace.resultCardinality,
            })),
          },
        },
        select: { id: true },
      });
      return created;
    },

    async list(query) {
      if (query.tenantId !== undefined) {
        assertAdvisorTenantId(query.tenantId);
      }
      if (query.outcome !== undefined) {
        assertMember(query.outcome, ANALYTICAL_OUTCOMES, 'ANALYTICAL_OUTCOME_INVALID');
      }
      const where = {
        ...(query.tenantId ? { tenantId: query.tenantId.trim() } : {}),
        ...(query.outcome ? { outcome: query.outcome } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.aiAnalyticalResult.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
          skip: query.offset,
          select: {
            id: true,
            tenantId: true,
            conversationId: true,
            userMessageId: true,
            consultantMessageId: true,
            runId: true,
            outcome: true,
            answerSource: true,
            toolCallCount: true,
            toolRoundCount: true,
            unresolvedDimension: true,
            unresolvedEntity: true,
            durationMs: true,
            createdAt: true,
            run: {
              select: {
                provider: true,
                model: true,
                status: true,
                inputTokens: true,
                outputTokens: true,
                errorCode: true,
              },
            },
            toolTraces: {
              orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
              select: {
                round: true,
                toolName: true,
                known: true,
                status: true,
                reason: true,
                durationMs: true,
                resultCardinality: true,
              },
            },
          },
        }),
        prisma.aiAnalyticalResult.count({ where }),
      ]);
      return { items: rows, total };
    },
  };
}
