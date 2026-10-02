import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { NotFoundError } from '../../../shared/errors/application-error.js';
import { isContaAzulSyncErrorCode } from '../../integrations/conta-azul/domain/conta-azul-sync.js';
import { toPublicErrorCode } from '../../integrations/conta-azul/domain/types.js';
import type { AuditAction } from '../domain/audit-actions.js';
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

export function createAdminOperationsService(prisma: PrismaClient) {
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
  };
}

export type AdminOperationsService = ReturnType<typeof createAdminOperationsService>;
