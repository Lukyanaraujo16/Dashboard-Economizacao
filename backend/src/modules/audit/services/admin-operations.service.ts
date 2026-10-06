import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { NotFoundError } from '../../../shared/errors/application-error.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { isContaAzulSyncErrorCode } from '../../integrations/conta-azul/domain/conta-azul-sync.js';
import { toPublicErrorCode } from '../../integrations/conta-azul/domain/types.js';
import type { AuditAction } from '../domain/audit-actions.js';
import {
  OPERATIONS_ALERT_LIMIT,
  OPERATIONS_COMPANY_PAGE_LIMIT,
  OPERATIONS_RECENT_DAYS,
  OPERATIONS_SYNC_FRESHNESS_HOURS,
  resolveOperationsIntegrationState,
  toOperationsCompanyFinancials,
  unavailableOperationsFinancials,
  type OperationsCompanyFinancials,
  type OperationsIntegrationState,
} from '../domain/operations-overview.js';
import {
  ANALYTICAL_OUTCOMES,
  type AnalyticalOutcome,
} from '../../advisor/domain/classify-analytical-outcome.js';
import { createAdvisorAnalyticalResultRepository } from '../../advisor/repositories/advisor-analytical-result.repository.js';
import { sanitizeAuditMetadata } from '../domain/sanitize-audit-metadata.js';
import { sanitizeSyncCounts } from '../domain/sanitize-sync-counts.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type OperationsPage = {
  readonly tenantId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: string;
  readonly action?: AuditAction;
};

export type OperationsPageResult<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
};

type SyncRunView = {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly integrationId: string;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  readonly triggerType: 'MANUAL' | 'SCHEDULED';
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly heartbeatAt: string | null;
  readonly errorCode: string | null;
  readonly counts: Record<string, number> | null;
};

type CurrentRunView = {
  readonly id: string;
  readonly status: 'PENDING' | 'RUNNING';
  readonly triggerType: 'MANUAL' | 'SCHEDULED';
  readonly startedAt: string;
  readonly heartbeatAt: string | null;
};

type IntegrationHealthView = {
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly tenantStatus: 'ACTIVE' | 'DISABLED';
  readonly integration: {
    readonly id: string;
    readonly status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR';
    readonly lastSuccessfulSyncAt: string | null;
    readonly lastErrorAt: string | null;
    readonly lastErrorCode: string | null;
    readonly currentRun: CurrentRunView | null;
  } | null;
};

type AiRunView = {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly runType: string;
  readonly provider: string;
  readonly model: string;
  readonly status: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly durationMs: number | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
};

type AuditLogView = {
  readonly id: string;
  readonly operatorUserId: string;
  readonly operatorName: string;
  readonly tenantId: string | null;
  readonly tenantDisplayName: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly result: 'SUCCESS' | 'FAILURE';
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
};

function resolvePagination(query: OperationsPage): { limit: number; offset: number } {
  const limit =
    query.limit === undefined ? DEFAULT_LIMIT : Math.min(Math.max(query.limit, 1), MAX_LIMIT);
  const offset = query.offset === undefined ? 0 : Math.max(query.offset, 0);
  return { limit, offset };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function durationMs(startedAt: Date, finishedAt: Date | null): number | null {
  if (!finishedAt) {
    return null;
  }
  const elapsed = finishedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return null;
  }
  return elapsed;
}

function publicSyncErrorCode(code: string | null): string | null {
  if (!code || !isContaAzulSyncErrorCode(code)) {
    return null;
  }
  return code;
}

const syncRunSelect = {
  id: true,
  tenantId: true,
  integrationId: true,
  triggerType: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  heartbeatAt: true,
  errorCode: true,
  counts: true,
  tenant: { select: { displayName: true } },
} as const;

type SyncRunRow = Prisma.SyncRunGetPayload<{ select: typeof syncRunSelect }>;

function toSyncRunView(row: SyncRunRow): SyncRunView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantDisplayName: row.tenant.displayName,
    integrationId: row.integrationId,
    status: row.status,
    triggerType: row.triggerType,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    durationMs: durationMs(row.startedAt, row.finishedAt),
    heartbeatAt: iso(row.heartbeatAt),
    errorCode: publicSyncErrorCode(row.errorCode),
    counts: sanitizeSyncCounts(row.counts),
  };
}

type OperationsOverview = {
  readonly referenceMonthKey: string;
  readonly windows: {
    readonly syncFreshnessHours: number;
    readonly recentDays: number;
  };
  readonly kpis: {
    readonly companies: { readonly total: number };
    readonly integrations: {
      readonly connected: number;
      readonly total: number;
      readonly withError: number;
    };
    readonly synchronization: {
      readonly syncedCompaniesLast24Hours: number;
      readonly failuresLast7Days: number;
    };
    readonly ai: {
      readonly runsLast7Days: number;
      readonly errorsLast7Days: number;
    };
    readonly audit: { readonly changesLast7Days: number };
  };
  readonly companies: OperationsPageResult<OperationsCompanyView>;
  readonly alerts: {
    readonly failures: readonly SyncRunView[];
    readonly aiErrors: readonly AiRunView[];
    readonly audit: readonly AuditLogView[];
  };
};

type OperationsCompanyView = {
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly tenantStatus: 'ACTIVE' | 'DISABLED';
  readonly integrationState: OperationsIntegrationState;
  readonly referenceMonthKey: string;
  readonly integration: IntegrationHealthView['integration'];
  readonly financials: OperationsCompanyFinancials;
};

const AI_ERROR_STATUSES = ['FAILED', 'TIMEOUT'] as const;

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await map(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createAdminOperationsService(
  prisma: PrismaClient,
  deps: {
    readonly cashFlow?: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
    readonly now?: () => Date;
  } = {},
) {
  const analyticalResults = createAdvisorAnalyticalResultRepository(prisma);

  async function requireTenantIfFiltered(tenantId: string | undefined): Promise<void> {
    if (!tenantId) {
      return;
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundError('Empresa não encontrada.');
    }
  }

  async function listSyncRuns(
    query: OperationsPage,
    statusOverride?: 'FAILED',
  ): Promise<OperationsPageResult<SyncRunView>> {
    await requireTenantIfFiltered(query.tenantId);
    const { limit, offset } = resolvePagination(query);
    const status = statusOverride ?? query.status;
    const where: Prisma.SyncRunWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status: status as Prisma.SyncRunWhereInput['status'] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.syncRun.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
        select: syncRunSelect,
      }),
      prisma.syncRun.count({ where }),
    ]);
    return { items: rows.map(toSyncRunView), total, limit, offset };
  }

  return {
    listSyncRuns(query: OperationsPage) {
      return listSyncRuns(query);
    },

    listFailures(query: OperationsPage) {
      return listSyncRuns(query, 'FAILED');
    },

    async listHealth(query: OperationsPage): Promise<OperationsPageResult<IntegrationHealthView>> {
      await requireTenantIfFiltered(query.tenantId);
      const { limit, offset } = resolvePagination(query);
      const where: Prisma.TenantWhereInput = query.tenantId ? { id: query.tenantId } : {};
      const [tenants, total] = await prisma.$transaction([
        prisma.tenant.findMany({
          where,
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
          select: { id: true, displayName: true, status: true },
        }),
        prisma.tenant.count({ where }),
      ]);

      const tenantIds = tenants.map((tenant) => tenant.id);
      const integrations =
        tenantIds.length === 0
          ? []
          : await prisma.integration.findMany({
              where: { tenantId: { in: tenantIds }, provider: 'CONTA_AZUL' },
              select: {
                id: true,
                tenantId: true,
                status: true,
                lastSuccessfulSyncAt: true,
                lastErrorAt: true,
                lastErrorCode: true,
              },
            });

      const integrationIds = integrations.map((integration) => integration.id);
      const activeRuns =
        integrationIds.length === 0
          ? []
          : await prisma.syncRun.findMany({
              where: {
                integrationId: { in: integrationIds },
                status: { in: ['PENDING', 'RUNNING'] },
              },
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              select: {
                id: true,
                integrationId: true,
                status: true,
                triggerType: true,
                startedAt: true,
                heartbeatAt: true,
              },
            });

      const integrationByTenant = new Map(integrations.map((integration) => [integration.tenantId, integration]));
      const currentByIntegration = new Map<string, (typeof activeRuns)[number]>();
      for (const run of activeRuns) {
        if (!currentByIntegration.has(run.integrationId)) {
          currentByIntegration.set(run.integrationId, run);
        }
      }

      const items: IntegrationHealthView[] = tenants.map((tenant) => {
        const integration = integrationByTenant.get(tenant.id);
        if (!integration) {
          return {
            tenantId: tenant.id,
            tenantDisplayName: tenant.displayName,
            tenantStatus: tenant.status,
            integration: null,
          };
        }
        const current = currentByIntegration.get(integration.id);
        const currentStatus = current?.status;
        return {
          tenantId: tenant.id,
          tenantDisplayName: tenant.displayName,
          tenantStatus: tenant.status,
          integration: {
            id: integration.id,
            status: integration.status,
            lastSuccessfulSyncAt: iso(integration.lastSuccessfulSyncAt),
            lastErrorAt: iso(integration.lastErrorAt),
            lastErrorCode: toPublicErrorCode(integration.lastErrorCode),
            currentRun:
              current && (currentStatus === 'PENDING' || currentStatus === 'RUNNING')
                ? {
                    id: current.id,
                    status: currentStatus,
                    triggerType: current.triggerType,
                    startedAt: current.startedAt.toISOString(),
                    heartbeatAt: iso(current.heartbeatAt),
                  }
                : null,
          },
        };
      });

      return { items, total, limit, offset };
    },

    async listAiRuns(query: OperationsPage): Promise<OperationsPageResult<AiRunView>> {
      await requireTenantIfFiltered(query.tenantId);
      const { limit, offset } = resolvePagination(query);
      const where: Prisma.AiRunWhereInput = {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.status ? { status: query.status as Prisma.AiRunWhereInput['status'] } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.aiRun.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          skip: offset,
          select: {
            id: true,
            tenantId: true,
            userId: true,
            runType: true,
            provider: true,
            model: true,
            status: true,
            inputTokens: true,
            outputTokens: true,
            durationMs: true,
            errorCode: true,
            createdAt: true,
            finishedAt: true,
            tenant: { select: { displayName: true } },
            user: { select: { name: true } },
          },
        }),
        prisma.aiRun.count({ where }),
      ]);

      return {
        items: rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          tenantDisplayName: row.tenant.displayName,
          userId: row.userId,
          userName: row.user?.name ?? null,
          runType: row.runType,
          provider: row.provider,
          model: row.model,
          status: row.status,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          durationMs: row.durationMs,
          errorCode: row.errorCode,
          createdAt: row.createdAt.toISOString(),
          finishedAt: iso(row.finishedAt),
        })),
        total,
        limit,
        offset,
      };
    },

    async listAuditLogs(query: OperationsPage): Promise<OperationsPageResult<AuditLogView>> {
      await requireTenantIfFiltered(query.tenantId);
      const { limit, offset } = resolvePagination(query);
      const where: Prisma.AuditLogWhereInput = {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.action ? { action: query.action } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          skip: offset,
          select: {
            id: true,
            operatorUserId: true,
            tenantId: true,
            action: true,
            targetType: true,
            targetId: true,
            result: true,
            metadata: true,
            createdAt: true,
            operator: { select: { name: true } },
            tenant: { select: { displayName: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return {
        items: rows.map((row) => ({
          id: row.id,
          operatorUserId: row.operatorUserId,
          operatorName: row.operator.name,
          tenantId: row.tenantId,
          tenantDisplayName: row.tenant?.displayName ?? null,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          result: row.result,
          metadata: sanitizeAuditMetadata(row.metadata),
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        limit,
        offset,
      };
    },

    async getOverview(query: OperationsPage): Promise<OperationsOverview> {
      await requireTenantIfFiltered(query.tenantId);
      const now = deps.now?.() ?? new Date();
      const referenceMonthKey = civilMonthKey(civilTodayInSaoPaulo(now));
      const recentSince = new Date(now.getTime() - OPERATIONS_RECENT_DAYS * 24 * 60 * 60 * 1000);
      const syncSince = new Date(now.getTime() - OPERATIONS_SYNC_FRESHNESS_HOURS * 60 * 60 * 1000);
      const page = resolvePagination(query);
      const limit = Math.min(page.limit, OPERATIONS_COMPANY_PAGE_LIMIT);
      const offset = page.offset;
      const companyWhere: Prisma.TenantWhereInput = query.tenantId ? { id: query.tenantId } : {};

      const [
        companyTotal,
        integrationTotal,
        connected,
        withError,
        syncedRows,
        failuresLast7Days,
        runsLast7Days,
        errorsLast7Days,
        changesLast7Days,
        tenants,
        filteredTotal,
        failureRows,
        aiErrorRows,
        auditRows,
      ] = await Promise.all([
        prisma.tenant.count(),
        prisma.integration.count({ where: { provider: 'CONTA_AZUL' } }),
        prisma.integration.count({ where: { provider: 'CONTA_AZUL', status: 'CONNECTED' } }),
        prisma.integration.count({ where: { provider: 'CONTA_AZUL', status: 'ERROR' } }),
        prisma.integration.findMany({
          where: {
            provider: 'CONTA_AZUL',
            lastSuccessfulSyncAt: { gte: syncSince },
          },
          select: { tenantId: true },
          distinct: ['tenantId'],
        }),
        prisma.syncRun.count({
          where: { status: 'FAILED', startedAt: { gte: recentSince } },
        }),
        prisma.aiRun.count({ where: { createdAt: { gte: recentSince } } }),
        prisma.aiRun.count({
          where: { createdAt: { gte: recentSince }, status: { in: [...AI_ERROR_STATUSES] } },
        }),
        prisma.auditLog.count({ where: { createdAt: { gte: recentSince } } }),
        prisma.tenant.findMany({
          where: companyWhere,
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
          select: { id: true, displayName: true, status: true },
        }),
        prisma.tenant.count({ where: companyWhere }),
        prisma.syncRun.findMany({
          where: { status: 'FAILED', startedAt: { gte: recentSince } },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: OPERATIONS_ALERT_LIMIT,
          select: syncRunSelect,
        }),
        prisma.aiRun.findMany({
          where: { createdAt: { gte: recentSince }, status: { in: [...AI_ERROR_STATUSES] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: OPERATIONS_ALERT_LIMIT,
          select: {
            id: true,
            tenantId: true,
            userId: true,
            runType: true,
            provider: true,
            model: true,
            status: true,
            inputTokens: true,
            outputTokens: true,
            durationMs: true,
            errorCode: true,
            createdAt: true,
            finishedAt: true,
            tenant: { select: { displayName: true } },
            user: { select: { name: true } },
          },
        }),
        prisma.auditLog.findMany({
          where: { createdAt: { gte: recentSince } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: OPERATIONS_ALERT_LIMIT,
          select: {
            id: true,
            operatorUserId: true,
            tenantId: true,
            action: true,
            targetType: true,
            targetId: true,
            result: true,
            metadata: true,
            createdAt: true,
            operator: { select: { name: true } },
            tenant: { select: { displayName: true } },
          },
        }),
      ]);

      const tenantIds = tenants.map((tenant) => tenant.id);
      const integrations =
        tenantIds.length === 0
          ? []
          : await prisma.integration.findMany({
              where: { tenantId: { in: tenantIds }, provider: 'CONTA_AZUL' },
              select: {
                id: true,
                tenantId: true,
                status: true,
                lastSuccessfulSyncAt: true,
                lastErrorAt: true,
                lastErrorCode: true,
              },
            });
      const integrationByTenant = new Map(integrations.map((integration) => [integration.tenantId, integration]));

      const companies = await mapPool(tenants, 4, async (tenant) => {
        const integration = integrationByTenant.get(tenant.id);
        const financials = await loadCompanyFinancials(
          deps.cashFlow,
          tenant.id,
          referenceMonthKey,
          now,
        );
        return {
          tenantId: tenant.id,
          tenantDisplayName: tenant.displayName,
          tenantStatus: tenant.status,
          referenceMonthKey,
          integrationState: resolveOperationsIntegrationState({
            status: integration?.status ?? null,
            lastSuccessfulSyncAt: integration?.lastSuccessfulSyncAt ?? null,
            lastErrorAt: integration?.lastErrorAt ?? null,
          }),
          integration: integration
            ? {
                id: integration.id,
                status: integration.status,
                lastSuccessfulSyncAt: iso(integration.lastSuccessfulSyncAt),
                lastErrorAt: iso(integration.lastErrorAt),
                lastErrorCode: toPublicErrorCode(integration.lastErrorCode),
                currentRun: null,
              }
            : null,
          financials,
        };
      });

      return {
        referenceMonthKey,
        windows: {
          syncFreshnessHours: OPERATIONS_SYNC_FRESHNESS_HOURS,
          recentDays: OPERATIONS_RECENT_DAYS,
        },
        kpis: {
          companies: { total: companyTotal },
          integrations: { connected, total: integrationTotal, withError },
          synchronization: {
            syncedCompaniesLast24Hours: syncedRows.length,
            failuresLast7Days,
          },
          ai: { runsLast7Days, errorsLast7Days },
          audit: { changesLast7Days },
        },
        companies: { items: companies, total: filteredTotal, limit, offset },
        alerts: {
          failures: failureRows.map(toSyncRunView),
          aiErrors: aiErrorRows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            tenantDisplayName: row.tenant.displayName,
            userId: row.userId,
            userName: row.user?.name ?? null,
            runType: row.runType,
            provider: row.provider,
            model: row.model,
            status: row.status,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            durationMs: row.durationMs,
            errorCode: row.errorCode,
            createdAt: row.createdAt.toISOString(),
            finishedAt: iso(row.finishedAt),
          })),
          audit: auditRows.map((row) => ({
            id: row.id,
            operatorUserId: row.operatorUserId,
            operatorName: row.operator.name,
            tenantId: row.tenantId,
            tenantDisplayName: row.tenant?.displayName ?? null,
            action: row.action,
            targetType: row.targetType,
            targetId: row.targetId,
            result: row.result,
            metadata: sanitizeAuditMetadata(row.metadata),
            createdAt: row.createdAt.toISOString(),
          })),
        },
      };
    },

    async listAnalyticalResults(query: OperationsPage): Promise<
      OperationsPageResult<{
        readonly id: string;
        readonly tenantId: string;
        readonly conversationId: string;
        readonly userMessageId: string;
        readonly consultantMessageId: string | null;
        readonly runId: string | null;
        readonly outcome: string;
        readonly answerSource: string;
        readonly toolCallCount: number;
        readonly toolRoundCount: number;
        readonly unresolvedDimension: string | null;
        readonly unresolvedEntity: string | null;
        readonly durationMs: number | null;
        readonly createdAt: string;
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
          readonly status: string;
          readonly reason: string | null;
          readonly durationMs: number | null;
          readonly resultCardinality: number | null;
        }[];
      }>
    > {
      await requireTenantIfFiltered(query.tenantId);
      const { limit, offset } = resolvePagination(query);
      const outcome = (ANALYTICAL_OUTCOMES as readonly string[]).includes(query.status ?? '')
        ? (query.status as AnalyticalOutcome)
        : undefined;
      const page = await analyticalResults.list({
        tenantId: query.tenantId,
        outcome,
        limit,
        offset,
      });
      return {
        items: page.items.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          conversationId: row.conversationId,
          userMessageId: row.userMessageId,
          consultantMessageId: row.consultantMessageId,
          runId: row.runId,
          outcome: row.outcome,
          answerSource: row.answerSource,
          toolCallCount: row.toolCallCount,
          toolRoundCount: row.toolRoundCount,
          unresolvedDimension: row.unresolvedDimension,
          unresolvedEntity: row.unresolvedEntity,
          durationMs: row.durationMs,
          createdAt: row.createdAt.toISOString(),
          run: row.run,
          toolTraces: row.toolTraces,
        })),
        total: page.total,
        limit,
        offset,
      };
    },
  };
}

async function loadCompanyFinancials(
  cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'> | undefined,
  tenantId: string,
  monthKey: string,
  now: Date,
): Promise<OperationsCompanyFinancials> {
  if (!cashFlow) {
    return unavailableOperationsFinancials();
  }
  try {
    const flow = await cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now });
    return toOperationsCompanyFinancials(flow);
  } catch {
    return unavailableOperationsFinancials();
  }
}

export type AdminOperationsService = ReturnType<typeof createAdminOperationsService>;
