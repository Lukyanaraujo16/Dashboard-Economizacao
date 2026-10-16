/**
 * Correction 11-E.0 — auditoria LIVE READ-ONLY de lifecycle (AR / AP / Transfers).
 *
 * Compara banco local × API oficial Conta Azul. Zero mutações de domínio.
 * Refresh OAuth apenas via serviço oficial (leitura).
 *
 * LOCAL (_dev/_test, NODE_ENV != production):
 *   cd backend && pnpm exec tsx scripts/lifecycle-11e0-live-audit.ts \
 *     --tenant-id=<uuid> --integration-id=<uuid> --confirm=LOCAL
 *
 * PRODUÇÃO:
 *   cd backend && pnpm exec tsx scripts/lifecycle-11e0-live-audit.ts \
 *     --tenant-id=<uuid> --integration-id=<uuid> --confirm=PRODUCTION
 *
 * NÃO imprime: tokens, documento, nome de party, descrição, e-mail, telefone, payload bruto.
 * NÃO persiste. NÃO dispara sync/worker. NÃO altera financialTransferId / status / cursors.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../src/modules/finance/domain/active-installment-status.js';
import {
  ContaAzulApiError,
  createContaAzulApiClient,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import {
  addUtcDays,
  buildDueDateWindows,
  buildTransferSyncCivilWindow,
  formatCivilDate,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  mapPayablePage,
  mapReceivablePage,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { mapInstallmentStatus } from '../src/modules/integrations/conta-azul/domain/conta-azul-installment-status.js';
import {
  assertLedgerBackfillAllowed,
  classifyDatabaseName,
  databaseNameFromUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';
import { ContaAzulMappingError, isRecord } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_PAGE_SIZE,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { mapFinancialTransferList } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-mappers.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulOAuthService } from '../src/modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

/** Teto defensivo por janela de vencimento/data (pageSize=100). */
export const LIFECYCLE_11E0_MAX_PAGES_PER_WINDOW = 50;
/** Limite de probes individuais por recurso (rate limit / tempo). */
export const LIFECYCLE_11E0_MAX_INDIVIDUAL_PROBES = 200;
const SAMPLE_LIMIT = 40;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AbsenceEvidenceClass =
  | 'STRONG_DELETION_EVIDENCE'
  | 'NON_ACTIVE_UPSTREAM'
  | 'WEAK_ABSENCE_ONLY'
  | 'INCONCLUSIVE';

export type IndividualProbeClass =
  | 'FOUND_ACTIVE'
  | 'FOUND_NON_ACTIVE'
  | 'NOT_FOUND_404'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'OTHER_ERROR'
  | 'INDIVIDUAL_PROBE_UNAVAILABLE';

export type PaginationQuality = {
  readonly pagesFetched: number;
  readonly rawItems: number;
  readonly uniqueItems: number;
  readonly duplicateItems: number;
  readonly duplicateExternalIds: number;
  readonly reportedTotalLast: number | null;
  readonly windowsFetched: number;
  readonly terminalReason: string;
  readonly snapshotComplete: boolean;
  readonly httpErrors: number;
  readonly paginationAnomalies: number;
};

type UpstreamInstallmentLite = {
  readonly externalId: string;
  readonly mappedStatus: string;
  readonly upstreamStatus: string | null;
  readonly dueDate: string;
  readonly total: string;
  readonly unpaid: string;
};

type LocalInstallmentLite = {
  readonly externalId: string;
  readonly status: string;
  readonly upstreamStatus: string | null;
  readonly dueDate: string;
  readonly total: string;
  readonly unpaid: string;
  readonly syncedAt: string;
};

export function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

export function snapshotExhausted(pageItemCount: number, pageSize: number): boolean {
  return pageItemCount < pageSize;
}

export function isPaginationInconsistent(input: {
  readonly pageItemCount: number;
  readonly processed: number;
  readonly totalItems: number | null;
  readonly pageSize: number;
}): boolean {
  const { pageItemCount, processed, totalItems, pageSize } = input;
  if (pageItemCount > pageSize) {
    return true;
  }
  if (totalItems === null) {
    return false;
  }
  if (totalItems < 0) {
    return true;
  }
  if (processed > totalItems) {
    return true;
  }
  return false;
}

export function isAnalyticalActiveStatus(status: string): boolean {
  return (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(status);
}

export function classifyInstallmentProbeError(error: unknown): IndividualProbeClass {
  if (!(error instanceof ContaAzulApiError)) {
    if (error instanceof ContaAzulMappingError) {
      return 'INVALID_RESPONSE';
    }
    return 'OTHER_ERROR';
  }
  if (error.httpStatus === 404) {
    return 'NOT_FOUND_404';
  }
  if (error.kind === 'unauthorized') {
    return 'AUTH_ERROR';
  }
  if (error.kind === 'rate_limited') {
    return 'RATE_LIMITED';
  }
  if (error.kind === 'invalid_response') {
    return 'INVALID_RESPONSE';
  }
  if (error.kind === 'timeout' || error.kind === 'unavailable') {
    return error.httpStatus !== undefined && error.httpStatus >= 500
      ? 'SERVER_ERROR'
      : 'OTHER_ERROR';
  }
  return 'OTHER_ERROR';
}

export function classifyInstallmentAbsenceEvidence(input: {
  readonly searchSnapshotComplete: boolean;
  readonly probe: IndividualProbeClass | null;
}): AbsenceEvidenceClass {
  if (!input.searchSnapshotComplete) {
    return 'INCONCLUSIVE';
  }
  if (input.probe === null) {
    return 'WEAK_ABSENCE_ONLY';
  }
  if (input.probe === 'NOT_FOUND_404') {
    return 'STRONG_DELETION_EVIDENCE';
  }
  if (input.probe === 'FOUND_NON_ACTIVE') {
    return 'NON_ACTIVE_UPSTREAM';
  }
  if (input.probe === 'FOUND_ACTIVE') {
    // Presente no detalhe mas ausente na busca → busca não authoritative / janela.
    return 'INCONCLUSIVE';
  }
  return 'INCONCLUSIVE';
}

export function classifyTransferAbsenceEvidence(input: {
  readonly searchSnapshotComplete: boolean;
  readonly probe: IndividualProbeClass;
}): AbsenceEvidenceClass {
  if (!input.searchSnapshotComplete) {
    return 'INCONCLUSIVE';
  }
  if (input.probe === 'INDIVIDUAL_PROBE_UNAVAILABLE') {
    return 'WEAK_ABSENCE_ONLY';
  }
  if (input.probe === 'NOT_FOUND_404') {
    return 'STRONG_DELETION_EVIDENCE';
  }
  if (input.probe === 'FOUND_ACTIVE' || input.probe === 'FOUND_NON_ACTIVE') {
    return 'INCONCLUSIVE';
  }
  return 'INCONCLUSIVE';
}

export function computeHypotheticalTransferUnlinkImpact(input: {
  readonly transfers: ReadonlyArray<{
    readonly externalId: string;
    readonly matchStatus: string;
    readonly linked: ReadonlyArray<{
      readonly lifecycleStatus: string;
      readonly netAmount: string;
      readonly transactionType: string;
    }>;
  }>;
}): {
  readonly matchedAbsentTransfers: number;
  readonly settlementsAffected: number;
  readonly activeSettlementsAffected: number;
  readonly absoluteNetSum: string;
  readonly creditNetSum: string;
  readonly debitNetSum: string;
} {
  let settlementsAffected = 0;
  let activeSettlementsAffected = 0;
  let absolute = new Prisma.Decimal(0);
  let credit = new Prisma.Decimal(0);
  let debit = new Prisma.Decimal(0);
  for (const transfer of input.transfers) {
    if (transfer.matchStatus !== 'MATCHED') {
      continue;
    }
    for (const row of transfer.linked) {
      settlementsAffected += 1;
      const amount = new Prisma.Decimal(row.netAmount);
      absolute = absolute.add(amount.abs());
      if (row.lifecycleStatus === 'ACTIVE') {
        activeSettlementsAffected += 1;
        if (row.transactionType === 'CREDIT') {
          credit = credit.add(amount);
        } else if (row.transactionType === 'DEBIT') {
          debit = debit.add(amount);
        }
      }
    }
  }
  return {
    matchedAbsentTransfers: input.transfers.filter((row) => row.matchStatus === 'MATCHED').length,
    settlementsAffected,
    activeSettlementsAffected,
    absoluteNetSum: absolute.toFixed(4),
    creditNetSum: credit.toFixed(4),
    debitNetSum: debit.toFixed(4),
  };
}

function logJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function civilWindows(
  from: Date,
  to: Date,
  maxDays: number,
): Array<{ readonly de: Date; readonly ate: Date }> {
  const windows: Array<{ readonly de: Date; readonly ate: Date }> = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const windowEnd = addUtcDays(cursor, maxDays - 1);
    const ate = windowEnd.getTime() < to.getTime() ? windowEnd : to;
    windows.push({ de: cursor, ate });
    cursor = addUtcDays(ate, 1);
  }
  return windows;
}

function readProbeMappedStatus(payload: unknown): {
  readonly mappedStatus: string;
  readonly upstreamStatus: string | null;
} {
  if (!isRecord(payload)) {
    return { mappedStatus: 'UNKNOWN', upstreamStatus: null };
  }
  // Detalhe pode ser a parcela ou envelopar em `evento` — tenta raiz primeiro.
  const root = mapInstallmentStatus(payload.status, payload.status_traduzido);
  if (root.upstreamStatus) {
    return { mappedStatus: root.status, upstreamStatus: root.upstreamStatus };
  }
  const evento = isRecord(payload.evento) ? payload.evento : null;
  if (evento) {
    const nested = mapInstallmentStatus(evento.status, evento.status_traduzido);
    return { mappedStatus: nested.status, upstreamStatus: nested.upstreamStatus };
  }
  return { mappedStatus: root.status, upstreamStatus: root.upstreamStatus };
}

function emptyPaginationQuality(terminalReason: string): PaginationQuality {
  return {
    pagesFetched: 0,
    rawItems: 0,
    uniqueItems: 0,
    duplicateItems: 0,
    duplicateExternalIds: 0,
    reportedTotalLast: null,
    windowsFetched: 0,
    terminalReason,
    snapshotComplete: false,
    httpErrors: 0,
    paginationAnomalies: 0,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tenantId = argValue(argv, 'tenant-id');
  const integrationId = argValue(argv, 'integration-id');
  const confirm = argValue(argv, 'confirm');

  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new Error('11-E.0 audit: --tenant-id=<uuid> é obrigatório.');
  }
  if (!integrationId || !UUID_RE.test(integrationId)) {
    throw new Error('11-E.0 audit: --integration-id=<uuid> é obrigatório.');
  }

  const environment = loadEnvironment();
  if (!environment.databaseUrl) {
    throw new Error('DATABASE_URL ausente.');
  }
  const databaseName = databaseNameFromUrl(environment.databaseUrl);
  assertLedgerBackfillAllowed({
    nodeEnv: environment.nodeEnv,
    confirm,
    databaseName,
  });

  const prisma = getPrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      throw new Error('tenant_not_found');
    }
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, tenantId: tenant.id, provider: 'CONTA_AZUL' },
      select: { id: true, status: true },
    });
    if (!integration) {
      throw new Error('integration_not_found_or_tenant_mismatch');
    }
    if (integration.status !== 'CONNECTED') {
      throw new Error(`integration_not_connected:${integration.status}`);
    }

    logJson({
      event: 'lifecycle_11e0_audit_start',
      tenantId: tenant.id,
      integrationId: integration.id,
      integrationStatus: integration.status,
      confirmMode: confirm,
      databaseClassification: classifyDatabaseName(databaseName),
      pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
      maxPagesPerWindow: LIFECYCLE_11E0_MAX_PAGES_PER_WINDOW,
      maxIndividualProbes: LIFECYCLE_11E0_MAX_INDIVIDUAL_PROBES,
      mutationPerformed: false,
      note: 'tokens e PII omitidos; sem escrita de domínio',
    });

    const contaAzul = environment.contaAzul;
    if (!contaAzul || !environment.integrationEncryptionKey) {
      throw new Error('Conta Azul ou chave de cifração não configurada.');
    }

    const oauth = createContaAzulOAuthService({
      tenants: createTenantRepository(prisma),
      integrations: createContaAzulIntegrationRepository(prisma),
      stateStore: {
        create: async () => {
          throw new Error('A auditoria 11-E.0 não inicia OAuth.');
        },
        consume: async () => null,
      },
      tokenClient: createContaAzulTokenClient({
        clientId: contaAzul.clientId,
        clientSecret: contaAzul.clientSecret,
      }),
      contaAzul,
      encryptionKey: environment.integrationEncryptionKey,
      autoSyncIntervalMinutes: environment.autoSyncIntervalMinutes,
    });
    const rateLimiter = createContaAzulRateLimiter();
    const apiClient = createContaAzulApiClient();

    async function requestWithAuth<T>(work: (accessToken: string) => Promise<T>): Promise<T> {
      let token = await oauth.getValidAccessToken(tenant.id);
      try {
        return await work(token);
      } catch (error) {
        if (!(error instanceof ContaAzulApiError) || error.kind !== 'unauthorized') {
          throw error;
        }
        token = await oauth.forceRefresh(tenant.id);
        await rateLimiter.wait();
        return work(token);
      }
    }

    async function gatedGet<T>(work: () => Promise<T>): Promise<T> {
      await rateLimiter.wait();
      return work();
    }

    // ---------- Local AR / AP ----------
    const localReceivables = await prisma.receivable.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
      select: {
        externalId: true,
        status: true,
        upstreamStatus: true,
        dueDate: true,
        total: true,
        unpaid: true,
        syncedAt: true,
      },
    });
    const localPayables = await prisma.payable.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
      select: {
        externalId: true,
        status: true,
        upstreamStatus: true,
        dueDate: true,
        total: true,
        unpaid: true,
        syncedAt: true,
      },
    });

    const toLocalLite = (
      rows: typeof localReceivables,
    ): LocalInstallmentLite[] =>
      rows.map((row) => ({
        externalId: row.externalId,
        status: row.status,
        upstreamStatus: row.upstreamStatus,
        dueDate: formatCivilDate(row.dueDate),
        total: row.total.toFixed(4),
        unpaid: row.unpaid.toFixed(4),
        syncedAt: row.syncedAt.toISOString(),
      }));

    const localArAll = toLocalLite(localReceivables);
    const localApAll = toLocalLite(localPayables);
    const localArActive = localArAll.filter((row) => isAnalyticalActiveStatus(row.status));
    const localApActive = localApAll.filter((row) => isAnalyticalActiveStatus(row.status));

    // ---------- Upstream installment search (due-date windows, no alteration filter) ----------
    async function fetchInstallmentUniverse(
      kind: 'receivables' | 'payables',
    ): Promise<{
      readonly byExternal: Map<string, UpstreamInstallmentLite>;
      readonly quality: PaginationQuality;
      readonly statusDistribution: Record<string, number>;
      readonly unknownUpstreamStatuses: Record<string, number>;
      readonly mappedUnknownCount: number;
    }> {
      const byExternal = new Map<string, UpstreamInstallmentLite>();
      const duplicateExternalIdSet = new Set<string>();
      let duplicateItems = 0;
      let pagesFetched = 0;
      let rawItems = 0;
      let reportedTotalLast: number | null = null;
      let httpErrors = 0;
      let paginationAnomalies = 0;
      let terminalReason = 'ok';
      let snapshotComplete = true;
      const statusDistribution: Record<string, number> = {};
      const unknownUpstreamStatuses: Record<string, number> = {};
      let mappedUnknownCount = 0;

      const dueWindows = buildDueDateWindows(new Date(), {
        lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
        lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
        windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
      });
      const search =
        kind === 'receivables'
          ? apiClient.searchReceivables.bind(apiClient)
          : apiClient.searchPayables.bind(apiClient);
      const mapPage = kind === 'receivables' ? mapReceivablePage : mapPayablePage;

      for (const dueWindow of dueWindows) {
        let pagina = 1;
        let windowProcessed = 0;
        for (;;) {
          try {
            const payload = await requestWithAuth((accessToken) =>
              gatedGet(() =>
                search(accessToken, {
                  pagina,
                  dataVencimentoDe: dueWindow.from,
                  dataVencimentoAte: dueWindow.to,
                }),
              ),
            );
            const page = mapPage(payload);
            pagesFetched += 1;
            if (page.totalItems !== null) {
              reportedTotalLast = page.totalItems;
            }
            if (
              isPaginationInconsistent({
                pageItemCount: page.items.length,
                processed: windowProcessed + page.items.length,
                totalItems: page.totalItems,
                pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
              })
            ) {
              paginationAnomalies += 1;
              snapshotComplete = false;
              terminalReason = 'pagination_inconsistent';
              break;
            }
            for (const item of page.items) {
              rawItems += 1;
              windowProcessed += 1;
              const upstreamKey = item.upstreamStatus ?? '(null)';
              statusDistribution[upstreamKey] = (statusDistribution[upstreamKey] ?? 0) + 1;
              if (item.status === 'UNKNOWN') {
                mappedUnknownCount += 1;
                unknownUpstreamStatuses[upstreamKey] =
                  (unknownUpstreamStatuses[upstreamKey] ?? 0) + 1;
              }
              const lite: UpstreamInstallmentLite = {
                externalId: item.externalId,
                mappedStatus: item.status,
                upstreamStatus: item.upstreamStatus,
                dueDate: formatCivilDate(item.dueDate),
                total: item.total.toFixed(4),
                unpaid: item.unpaid.toFixed(4),
              };
              if (byExternal.has(lite.externalId)) {
                duplicateItems += 1;
                duplicateExternalIdSet.add(lite.externalId);
              } else {
                byExternal.set(lite.externalId, lite);
              }
            }
            if (snapshotExhausted(page.items.length, CONTA_AZUL_SYNC_PAGE_SIZE)) {
              break;
            }
            if (pagina >= LIFECYCLE_11E0_MAX_PAGES_PER_WINDOW) {
              snapshotComplete = false;
              terminalReason = 'max_pages';
              break;
            }
            pagina += 1;
          } catch (error) {
            httpErrors += 1;
            snapshotComplete = false;
            const kindErr =
              error instanceof ContaAzulApiError
                ? error.kind
                : error instanceof ContaAzulMappingError
                  ? 'invalid_payload'
                  : 'unknown';
            terminalReason = `page_error:${kindErr}`;
            logJson({
              event: 'lifecycle_11e0_installment_window_error',
              kind,
              dueFrom: dueWindow.from,
              dueTo: dueWindow.to,
              pagina,
              errorKind: kindErr,
              httpStatus: error instanceof ContaAzulApiError ? error.httpStatus ?? null : null,
              mutationPerformed: false,
            });
            break;
          }
        }
        if (!snapshotComplete && terminalReason !== 'ok') {
          // Mantém varredura das demais janelas para métricas, mas snapshot permanece incompleto.
        }
      }

      if (snapshotComplete && terminalReason === 'ok') {
        terminalReason = 'exhausted_all_due_windows';
      }

      return {
        byExternal,
        quality: {
          pagesFetched,
          rawItems,
          uniqueItems: byExternal.size,
          duplicateItems,
          duplicateExternalIds: duplicateExternalIdSet.size,
          reportedTotalLast,
          windowsFetched: dueWindows.length,
          terminalReason,
          snapshotComplete,
          httpErrors,
          paginationAnomalies,
        },
        statusDistribution,
        unknownUpstreamStatuses,
        mappedUnknownCount,
      };
    }

    const arUpstream = await fetchInstallmentUniverse('receivables');
    const apUpstream = await fetchInstallmentUniverse('payables');

    async function auditInstallmentSide(input: {
      readonly kind: 'receivables' | 'payables';
      readonly localAll: readonly LocalInstallmentLite[];
      readonly localActive: readonly LocalInstallmentLite[];
      readonly upstream: typeof arUpstream;
    }): Promise<void> {
      const upstreamIds = new Set(input.upstream.byExternal.keys());
      const localActiveIds = new Set(input.localActive.map((row) => row.externalId));
      const localActivePresentUpstream = input.localActive.filter((row) =>
        upstreamIds.has(row.externalId),
      );
      const localActiveAbsentUpstream = input.localActive.filter(
        (row) => !upstreamIds.has(row.externalId),
      );
      const upstreamOnly = [...input.upstream.byExternal.values()].filter(
        (row) => !localActiveIds.has(row.externalId),
      );

      const probeResults: Array<{
        readonly externalId: string;
        readonly localStatus: string;
        readonly probe: IndividualProbeClass;
        readonly evidence: AbsenceEvidenceClass;
        readonly probeMappedStatus: string | null;
        readonly probeUpstreamStatus: string | null;
        readonly httpStatus: number | null;
      }> = [];

      let probesRun = 0;
      let probesTruncated = false;
      for (const row of localActiveAbsentUpstream) {
        if (probesRun >= LIFECYCLE_11E0_MAX_INDIVIDUAL_PROBES) {
          probesTruncated = true;
          break;
        }
        probesRun += 1;
        let probe: IndividualProbeClass;
        let probeMappedStatus: string | null = null;
        let probeUpstreamStatus: string | null = null;
        let httpStatus: number | null = null;
        try {
          const payload = await requestWithAuth((accessToken) =>
            gatedGet(() => apiClient.getInstallmentDetail(accessToken, row.externalId)),
          );
          const status = readProbeMappedStatus(payload);
          probeMappedStatus = status.mappedStatus;
          probeUpstreamStatus = status.upstreamStatus;
          probe = isAnalyticalActiveStatus(status.mappedStatus)
            ? 'FOUND_ACTIVE'
            : 'FOUND_NON_ACTIVE';
        } catch (error) {
          probe = classifyInstallmentProbeError(error);
          httpStatus = error instanceof ContaAzulApiError ? error.httpStatus ?? null : null;
        }
        const evidence = classifyInstallmentAbsenceEvidence({
          searchSnapshotComplete: input.upstream.quality.snapshotComplete,
          probe,
        });
        probeResults.push({
          externalId: row.externalId,
          localStatus: row.status,
          probe,
          evidence,
          probeMappedStatus,
          probeUpstreamStatus,
          httpStatus,
        });
      }

      const evidenceCounts: Record<AbsenceEvidenceClass, number> = {
        STRONG_DELETION_EVIDENCE: 0,
        NON_ACTIVE_UPSTREAM: 0,
        WEAK_ABSENCE_ONLY: 0,
        INCONCLUSIVE: 0,
      };
      const probeCounts: Record<string, number> = {};
      for (const row of probeResults) {
        evidenceCounts[row.evidence] += 1;
        probeCounts[row.probe] = (probeCounts[row.probe] ?? 0) + 1;
      }
      // Ausentes sem probe (truncados) → WEAK se snapshot completo, senão INCONCLUSIVE.
      const unprobed = localActiveAbsentUpstream.length - probeResults.length;
      if (unprobed > 0) {
        if (input.upstream.quality.snapshotComplete) {
          evidenceCounts.WEAK_ABSENCE_ONLY += unprobed;
        } else {
          evidenceCounts.INCONCLUSIVE += unprobed;
        }
      }

      logJson({
        event: 'lifecycle_11e0_installment_audit',
        kind: input.kind,
        localTotal: input.localAll.length,
        localAnalyticalActive: input.localActive.length,
        upstreamReturnedRaw: input.upstream.quality.rawItems,
        upstreamUnique: input.upstream.quality.uniqueItems,
        duplicateItems: input.upstream.quality.duplicateItems,
        duplicateExternalIds: input.upstream.quality.duplicateExternalIds,
        localActivePresentUpstream: localActivePresentUpstream.length,
        localActiveAbsentUpstream: localActiveAbsentUpstream.length,
        upstreamOnlyVsLocalActive: upstreamOnly.length,
        mappedUnknownCount: input.upstream.mappedUnknownCount,
        statusDistributionUpstream: input.upstream.statusDistribution,
        unknownUpstreamStatusValues: input.upstream.unknownUpstreamStatuses,
        pagination: input.upstream.quality,
        probesRun,
        probesTruncated,
        probeCounts,
        evidenceCounts,
        absentSample: localActiveAbsentUpstream.slice(0, SAMPLE_LIMIT).map((row) => ({
          externalId: row.externalId,
          localStatus: row.status,
          localUpstreamStatus: row.upstreamStatus,
          dueDate: row.dueDate,
          unpaid: row.unpaid,
          syncedAt: row.syncedAt,
        })),
        probeSample: probeResults.slice(0, SAMPLE_LIMIT),
        presentStatusMismatchSample: localActivePresentUpstream
          .filter((row) => {
            const up = input.upstream.byExternal.get(row.externalId);
            return up !== undefined && up.mappedStatus !== row.status;
          })
          .slice(0, SAMPLE_LIMIT)
          .map((row) => {
            const up = input.upstream.byExternal.get(row.externalId)!;
            return {
              externalId: row.externalId,
              localStatus: row.status,
              upstreamMappedStatus: up.mappedStatus,
              upstreamStatus: up.upstreamStatus,
              dueDate: up.dueDate,
              unpaid: up.unpaid,
            };
          }),
        mutationPerformed: false,
      });
    }

    await auditInstallmentSide({
      kind: 'receivables',
      localAll: localArAll,
      localActive: localArActive,
      upstream: arUpstream,
    });
    await auditInstallmentSide({
      kind: 'payables',
      localAll: localApAll,
      localActive: localApActive,
      upstream: apUpstream,
    });

    // ---------- Transfers ----------
    const localTransfers = await prisma.financialTransfer.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
      select: {
        id: true,
        externalId: true,
        matchStatus: true,
        occurredOn: true,
        amount: true,
        sourceFinancialAccountExternalId: true,
        destinationFinancialAccountExternalId: true,
        projectedTransaction: {
          select: {
            id: true,
            externalId: true,
            lifecycleStatus: true,
            netAmount: true,
            transactionType: true,
          },
        },
      },
    });

    const transferByMatch = {
      MATCHED: localTransfers.filter((row) => row.matchStatus === 'MATCHED').length,
      UNMATCHED: localTransfers.filter((row) => row.matchStatus === 'UNMATCHED').length,
      AMBIGUOUS: localTransfers.filter((row) => row.matchStatus === 'AMBIGUOUS').length,
    };

    const transferWindow = buildTransferSyncCivilWindow({
      now: new Date(),
      mode: 'full',
      lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
      lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
    });
    const transferChunks = civilWindows(
      transferWindow.from,
      transferWindow.to,
      CONTA_AZUL_SYNC_WINDOW_DAYS,
    );

    const upstreamTransfers = new Map<
      string,
      { readonly externalId: string; readonly occurredOn: string; readonly amount: string }
    >();
    let transferQuality = emptyPaginationQuality('ok');
    let transferDuplicateItems = 0;
    const transferDupIds = new Set<string>();
    let transferPages = 0;
    let transferRaw = 0;
    let transferHttpErrors = 0;
    let transferAnomalies = 0;
    let transferComplete = true;
    let transferTerminal = 'ok';
    let transferReported: number | null = null;
    let transferSkippedInvalid = 0;

    for (const chunk of transferChunks) {
      let pagina = 1;
      let windowProcessed = 0;
      for (;;) {
        try {
          const payload = await requestWithAuth((accessToken) =>
            gatedGet(() =>
              apiClient.searchTransfers(accessToken, {
                pagina,
                dataInicio: formatCivilDate(chunk.de),
                dataFim: formatCivilDate(chunk.ate),
              }),
            ),
          );
          const page = mapFinancialTransferList(payload);
          transferPages += 1;
          transferSkippedInvalid += page.skippedInvalid;
          if (page.totalItems !== null) {
            transferReported = page.totalItems;
          }
          if (
            isPaginationInconsistent({
              pageItemCount: page.items.length,
              processed: windowProcessed + page.items.length,
              totalItems: page.totalItems,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            transferAnomalies += 1;
            transferComplete = false;
            transferTerminal = 'pagination_inconsistent';
            break;
          }
          for (const item of page.items) {
            transferRaw += 1;
            windowProcessed += 1;
            if (upstreamTransfers.has(item.externalId)) {
              transferDuplicateItems += 1;
              transferDupIds.add(item.externalId);
            } else {
              // description descartada — nunca logada.
              upstreamTransfers.set(item.externalId, {
                externalId: item.externalId,
                occurredOn: formatCivilDate(item.occurredOn),
                amount: item.amount.toFixed(4),
              });
            }
          }
          if (snapshotExhausted(page.items.length, CONTA_AZUL_SYNC_PAGE_SIZE)) {
            break;
          }
          if (pagina >= LIFECYCLE_11E0_MAX_PAGES_PER_WINDOW) {
            transferComplete = false;
            transferTerminal = 'max_pages';
            break;
          }
          pagina += 1;
        } catch (error) {
          transferHttpErrors += 1;
          transferComplete = false;
          const kindErr =
            error instanceof ContaAzulApiError
              ? error.kind
              : error instanceof ContaAzulMappingError
                ? 'invalid_payload'
                : 'unknown';
          transferTerminal = `page_error:${kindErr}`;
          logJson({
            event: 'lifecycle_11e0_transfer_window_error',
            from: formatCivilDate(chunk.de),
            to: formatCivilDate(chunk.ate),
            pagina,
            errorKind: kindErr,
            httpStatus: error instanceof ContaAzulApiError ? error.httpStatus ?? null : null,
            mutationPerformed: false,
          });
          break;
        }
      }
    }
    if (transferComplete && transferTerminal === 'ok') {
      transferTerminal = 'exhausted_full_horizon_windows';
    }
    transferQuality = {
      pagesFetched: transferPages,
      rawItems: transferRaw,
      uniqueItems: upstreamTransfers.size,
      duplicateItems: transferDuplicateItems,
      duplicateExternalIds: transferDupIds.size,
      reportedTotalLast: transferReported,
      windowsFetched: transferChunks.length,
      terminalReason: transferTerminal,
      snapshotComplete: transferComplete,
      httpErrors: transferHttpErrors,
      paginationAnomalies: transferAnomalies,
    };

    const upstreamTransferIds = new Set(upstreamTransfers.keys());
    const localPresentUpstream = localTransfers.filter((row) =>
      upstreamTransferIds.has(row.externalId),
    );
    const localAbsentUpstream = localTransfers.filter(
      (row) => !upstreamTransferIds.has(row.externalId),
    );
    const localIds = new Set(localTransfers.map((row) => row.externalId));
    const upstreamOnlyTransfers = [...upstreamTransfers.keys()].filter((id) => !localIds.has(id));

    const matchedAbsent = localAbsentUpstream.filter((row) => row.matchStatus === 'MATCHED');
    // GET individual de transferência: não existe no ContaAzulApiClient oficial.
    const transferProbe: IndividualProbeClass = 'INDIVIDUAL_PROBE_UNAVAILABLE';
    const matchedAbsentClassified = matchedAbsent.map((row) => ({
      externalId: row.externalId,
      matchStatus: row.matchStatus,
      occurredOn: formatCivilDate(row.occurredOn),
      amount: row.amount.toFixed(4),
      linkedSettlementCount: row.projectedTransaction ? 1 : 0,
      linkedSettlements: row.projectedTransaction
        ? [
            {
              transactionExternalId: row.projectedTransaction.externalId,
              lifecycleStatus: row.projectedTransaction.lifecycleStatus,
              transactionType: row.projectedTransaction.transactionType,
              netAmount: row.projectedTransaction.netAmount.toFixed(4),
            },
          ]
        : [],
      probe: transferProbe,
      evidence: classifyTransferAbsenceEvidence({
        searchSnapshotComplete: transferQuality.snapshotComplete,
        probe: transferProbe,
      }),
    }));

    const hypotheticalImpact = computeHypotheticalTransferUnlinkImpact({
      transfers: matchedAbsentClassified.map((row) => ({
        externalId: row.externalId,
        matchStatus: row.matchStatus,
        linked: row.linkedSettlements,
      })),
    });

    logJson({
      event: 'lifecycle_11e0_transfer_audit',
      localTotal: localTransfers.length,
      localByMatchStatus: transferByMatch,
      upstreamReturnedRaw: transferQuality.rawItems,
      upstreamUnique: transferQuality.uniqueItems,
      skippedInvalidUpstream: transferSkippedInvalid,
      localPresentUpstream: localPresentUpstream.length,
      localAbsentUpstream: localAbsentUpstream.length,
      upstreamOnly: upstreamOnlyTransfers.length,
      matchedAbsentUpstream: matchedAbsent.length,
      individualTransferProbe: transferProbe,
      note: 'GET individual de transferência não existe no API client oficial; ausência na busca full-horizon = WEAK_ABSENCE_ONLY se snapshot completo',
      pagination: transferQuality,
      matchedAbsentSample: matchedAbsentClassified.slice(0, SAMPLE_LIMIT),
      hypotheticalUnlinkImpactIfStrongEvidence: {
        ...hypotheticalImpact,
        applied: false,
        note: 'projeção apenas; NÃO executa unlink; com probe indisponível a evidência é WEAK, não STRONG',
      },
      mutationPerformed: false,
    });

    logJson({
      event: 'lifecycle_11e0_audit_complete',
      tenantId: tenant.id,
      integrationId: integration.id,
      mutationPerformed: false,
      endpoints: {
        receivablesSearch:
          '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
        payablesSearch: '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
        installmentDetail: '/v1/financeiro/eventos-financeiros/parcelas/{id}',
        transfersSearch: '/v1/financeiro/transferencias',
        transferDetail: null,
      },
    });
  } finally {
    await disconnectPrisma();
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('lifecycle-11e0-live-audit.ts') ||
  process.argv[1]?.endsWith('lifecycle-11e0-live-audit.js');

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: 'lifecycle_11e0_audit_fatal',
        message: error instanceof Error ? error.message : 'unknown_error',
        mutationPerformed: false,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
