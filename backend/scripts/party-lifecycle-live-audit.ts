/**
 * Correction 11-D — auditoria READ-ONLY do catálogo de Pessoas (parties).
 *
 * Compara o snapshot completo Conta Azul (GET /v1/pessoas sem data_alteracao_*)
 * com `parties` locais (tenantId + integrationId). Zero mutações.
 *
 * LOCAL (_dev/_test, NODE_ENV != production):
 *   cd backend && pnpm exec tsx scripts/party-lifecycle-live-audit.ts --tenant=<uuid|name> --confirm=LOCAL
 *
 * PRODUÇÃO (banco real, NODE_ENV=production, um tenant por vez):
 *   cd backend && pnpm exec tsx scripts/party-lifecycle-live-audit.ts --tenant=<uuid|name> --confirm=PRODUCTION
 *
 * NÃO imprime tokens, document/CPF/CNPJ, e-mail, telefone ou endereço.
 * NÃO persiste nada. NÃO dispara worker.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  ContaAzulApiError,
  createContaAzulApiClient,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import { mapPartyPage } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import {
  assertLedgerBackfillAllowed,
  classifyDatabaseName,
  databaseNameFromUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import { CONTA_AZUL_SYNC_PAGE_SIZE } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulOAuthService } from '../src/modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

/** Teto defensivo alinhado aos catálogos 11-A/11-B/11-C (pageSize=100 → 5_000). */
const PARTY_LIFECYCLE_AUDIT_MAX_PAGES = 50;
const DIFF_DETAIL_LIMIT = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpstreamParty = {
  readonly externalId: string;
  readonly name: string;
  readonly active: boolean;
  readonly profiles: readonly string[];
};

type LocalParty = {
  readonly externalId: string;
  readonly name: string;
  readonly active: boolean;
  readonly profiles: readonly string[];
  readonly syncedAt: Date;
};

function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function logJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function resolveTenantId(
  prisma: ReturnType<typeof getPrismaClient>,
  tenant: string,
): Promise<{ readonly id: string; readonly name: string; readonly displayName: string }> {
  if (UUID_RE.test(tenant)) {
    const byId = await prisma.tenant.findFirst({
      where: { id: tenant },
      select: { id: true, name: true, displayName: true },
    });
    if (byId) {
      return byId;
    }
  }
  const byName = await prisma.tenant.findFirst({
    where: { OR: [{ name: tenant }, { displayName: tenant }] },
    select: { id: true, name: true, displayName: true },
  });
  if (!byName) {
    throw new Error(`tenant_not_found:${tenant}`);
  }
  return byName;
}

function snapshotExhausted(pageItemCount: number, pageSize: number): boolean {
  return pageItemCount < pageSize;
}

function isPaginationInconsistent(input: {
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

function profilesFingerprint(profiles: readonly string[]): string {
  return [...profiles].map(String).sort().join(',');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tenantArg = argValue(argv, 'tenant');
  const confirm = argValue(argv, 'confirm');
  if (!tenantArg) {
    throw new Error('11-D audit: --tenant=uuid|name é obrigatório.');
  }

  const environment = loadEnvironment();
  if (!environment.databaseUrl) {
    throw new Error('DATABASE_URL ausente.');
  }
  const databaseName = databaseNameFromUrl(environment.databaseUrl);
  // Mesma política fail-closed de CASH-7 / CASH-9C (LOCAL vs PRODUCTION).
  assertLedgerBackfillAllowed({
    nodeEnv: environment.nodeEnv,
    confirm,
    databaseName,
  });

  const prisma = getPrismaClient();
  try {
    const tenant = await resolveTenantId(prisma, tenantArg);
    const integration = await prisma.integration.findFirst({
      where: { tenantId: tenant.id, provider: 'CONTA_AZUL' },
      select: { id: true, status: true },
    });
    if (!integration) {
      throw new Error('integration_not_found');
    }
    if (integration.status !== 'CONNECTED') {
      throw new Error(`integration_not_connected:${integration.status}`);
    }

    logJson({
      event: 'party_lifecycle_audit_start',
      tenantId: tenant.id,
      tenantName: tenant.name,
      integrationId: integration.id,
      integrationStatus: integration.status,
      confirmMode: confirm,
      databaseClassification: classifyDatabaseName(databaseName),
      pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
      maxPages: PARTY_LIFECYCLE_AUDIT_MAX_PAGES,
      mutationPerformed: false,
      note: 'tokens e dados pessoais omitidos',
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
          throw new Error('A auditoria 11-D não inicia OAuth.');
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

    // --- Snapshot upstream completo (sem data_alteracao_*) ---
    const byExternal = new Map<string, UpstreamParty>();
    const duplicateExternalIds: string[] = [];
    let pages = 0;
    let returned = 0;
    let reportedTotal: number | null = null;
    let activeUpstream = 0;
    let inactiveUpstream = 0;
    let snapshotComplete = false;
    let abortReason: string | null = null;

    try {
      let pagina = 1;
      for (;;) {
        const payload = await requestWithAuth((accessToken) =>
          gatedGet(() =>
            apiClient.getPeople(accessToken, {
              pagina,
              tamanhoPagina: CONTA_AZUL_SYNC_PAGE_SIZE,
            }),
          ),
        );
        const page = mapPartyPage(payload);
        pages += 1;
        if (page.totalItems !== null) {
          reportedTotal = page.totalItems;
        }

        if (
          isPaginationInconsistent({
            pageItemCount: page.items.length,
            processed: returned + page.items.length,
            totalItems: page.totalItems,
            pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
          })
        ) {
          abortReason = 'pagination_inconsistent';
          break;
        }

        for (const item of page.items) {
          // document descartado de propósito — nunca entra no relatório.
          const safe: UpstreamParty = {
            externalId: item.externalId,
            name: item.name,
            active: item.active,
            profiles: item.profiles,
          };
          if (byExternal.has(safe.externalId)) {
            if (!duplicateExternalIds.includes(safe.externalId)) {
              duplicateExternalIds.push(safe.externalId);
            }
          } else {
            byExternal.set(safe.externalId, safe);
            if (safe.active) {
              activeUpstream += 1;
            } else {
              inactiveUpstream += 1;
            }
          }
        }
        returned += page.items.length;

        if (
          snapshotExhausted(page.items.length, CONTA_AZUL_SYNC_PAGE_SIZE)
        ) {
          snapshotComplete = true;
          break;
        }

        if (pagina >= PARTY_LIFECYCLE_AUDIT_MAX_PAGES) {
          abortReason = 'max_pages';
          break;
        }
        pagina += 1;
      }
    } catch (error) {
      const kind =
        error instanceof ContaAzulApiError
          ? error.kind
          : error instanceof ContaAzulMappingError
            ? 'invalid_payload'
            : 'unknown';
      abortReason = `page_error:${kind}`;
      logJson({
        event: 'party_lifecycle_upstream_error',
        abortReason,
        message: error instanceof Error ? error.message : 'unknown_error',
        pages,
        returned,
        mutationPerformed: false,
      });
    }

    logJson({
      event: 'party_lifecycle_upstream_snapshot',
      pages,
      reportedTotal,
      returned,
      unique: byExternal.size,
      active: activeUpstream,
      inactive: inactiveUpstream,
      duplicates: duplicateExternalIds.length,
      duplicateExternalIdsSample: duplicateExternalIds.slice(0, DIFF_DETAIL_LIMIT),
      snapshotComplete,
      abortReason,
      emptySnapshot: snapshotComplete && returned === 0,
      mutationPerformed: false,
    });

    // --- Catálogo local (somente leitura; sem document) ---
    const localRows = await prisma.party.findMany({
      where: {
        tenantId: tenant.id,
        integrationId: integration.id,
      },
      select: {
        externalId: true,
        name: true,
        active: true,
        profiles: true,
        syncedAt: true,
      },
      orderBy: [{ externalId: 'asc' }],
    });

    const localByExternal = new Map<string, LocalParty>();
    let localActive = 0;
    let localInactive = 0;
    for (const row of localRows) {
      localByExternal.set(row.externalId, {
        externalId: row.externalId,
        name: row.name,
        active: row.active,
        profiles: row.profiles,
        syncedAt: row.syncedAt,
      });
      if (row.active) {
        localActive += 1;
      } else {
        localInactive += 1;
      }
    }

    logJson({
      event: 'party_lifecycle_local',
      total: localRows.length,
      active: localActive,
      inactive: localInactive,
      mutationPerformed: false,
    });

    // --- Diffs (somente se snapshot completo; caso contrário inconclusivo) ---
    const upstreamOnly: Array<Record<string, unknown>> = [];
    const localOnly: Array<Record<string, unknown>> = [];
    const activeMismatch: Array<Record<string, unknown>> = [];
    const localActiveAbsentUpstream: Array<Record<string, unknown>> = [];
    const localInactivePresentActiveUpstream: Array<Record<string, unknown>> = [];
    const upstreamInactiveLocalActive: Array<Record<string, unknown>> = [];

    let upstreamOnlyCount = 0;
    let localOnlyCount = 0;
    let activeMismatchCount = 0;
    let localActiveAbsentUpstreamCount = 0;
    let localInactivePresentActiveUpstreamCount = 0;
    let upstreamInactiveLocalActiveCount = 0;

    if (snapshotComplete) {
      for (const [externalId, up] of byExternal) {
        const local = localByExternal.get(externalId);
        if (!local) {
          upstreamOnlyCount += 1;
          if (upstreamOnly.length < DIFF_DETAIL_LIMIT) {
            upstreamOnly.push({
              externalId,
              name: up.name,
              activeUpstream: up.active,
              profilesUpstream: up.profiles,
            });
          }
          continue;
        }
        if (local.active !== up.active) {
          activeMismatchCount += 1;
          if (activeMismatch.length < DIFF_DETAIL_LIMIT) {
            activeMismatch.push({
              externalId,
              nameLocal: local.name,
              nameUpstream: up.name,
              activeLocal: local.active,
              activeUpstream: up.active,
              profilesLocal: local.profiles,
              profilesUpstream: up.profiles,
            });
          }
          if (!up.active && local.active) {
            upstreamInactiveLocalActiveCount += 1;
            if (upstreamInactiveLocalActive.length < DIFF_DETAIL_LIMIT) {
              upstreamInactiveLocalActive.push({
                externalId,
                name: local.name,
                activeLocal: local.active,
                activeUpstream: up.active,
              });
            }
          }
          if (up.active && !local.active) {
            localInactivePresentActiveUpstreamCount += 1;
            if (localInactivePresentActiveUpstream.length < DIFF_DETAIL_LIMIT) {
              localInactivePresentActiveUpstream.push({
                externalId,
                name: local.name,
                activeLocal: local.active,
                activeUpstream: up.active,
              });
            }
          }
        } else if (
          profilesFingerprint(local.profiles) !== profilesFingerprint(up.profiles)
        ) {
          // Observabilidade opcional: profiles divergentes sem mismatch de active.
          // Contado apenas no sample se útil — não é métrica de lifecycle core.
        }
      }

      for (const [externalId, local] of localByExternal) {
        if (byExternal.has(externalId)) {
          continue;
        }
        localOnlyCount += 1;
        if (localOnly.length < DIFF_DETAIL_LIMIT) {
          localOnly.push({
            externalId,
            name: local.name,
            activeLocal: local.active,
            profilesLocal: local.profiles,
            syncedAt: local.syncedAt.toISOString(),
          });
        }
        if (local.active) {
          localActiveAbsentUpstreamCount += 1;
          if (localActiveAbsentUpstream.length < DIFF_DETAIL_LIMIT) {
            localActiveAbsentUpstream.push({
              externalId,
              name: local.name,
              activeLocal: local.active,
              syncedAt: local.syncedAt.toISOString(),
            });
          }
        }
      }
    }

    logJson({
      event: 'party_lifecycle_diff_summary',
      snapshotComplete,
      inconclusive: !snapshotComplete,
      abortReason,
      upstreamOnly: upstreamOnlyCount,
      localOnly: localOnlyCount,
      activeMismatch: activeMismatchCount,
      localActiveAbsentUpstream: localActiveAbsentUpstreamCount,
      localInactivePresentActiveUpstream: localInactivePresentActiveUpstreamCount,
      upstreamInactiveLocalActive: upstreamInactiveLocalActiveCount,
      detailLimit: DIFF_DETAIL_LIMIT,
      mutationPerformed: false,
    });

    if (snapshotComplete) {
      if (upstreamOnlyCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_upstream_only',
          total: upstreamOnlyCount,
          truncated: upstreamOnlyCount > upstreamOnly.length,
          items: upstreamOnly,
        });
      }
      if (localOnlyCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_local_only',
          total: localOnlyCount,
          truncated: localOnlyCount > localOnly.length,
          items: localOnly,
        });
      }
      if (activeMismatchCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_active_mismatch',
          total: activeMismatchCount,
          truncated: activeMismatchCount > activeMismatch.length,
          items: activeMismatch,
        });
      }
      if (localActiveAbsentUpstreamCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_local_active_absent_upstream',
          total: localActiveAbsentUpstreamCount,
          truncated: localActiveAbsentUpstreamCount > localActiveAbsentUpstream.length,
          items: localActiveAbsentUpstream,
        });
      }
      if (localInactivePresentActiveUpstreamCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_local_inactive_present_active_upstream',
          total: localInactivePresentActiveUpstreamCount,
          truncated:
            localInactivePresentActiveUpstreamCount >
            localInactivePresentActiveUpstream.length,
          items: localInactivePresentActiveUpstream,
        });
      }
      if (upstreamInactiveLocalActiveCount > 0) {
        logJson({
          event: 'party_lifecycle_diff_upstream_inactive_local_active',
          total: upstreamInactiveLocalActiveCount,
          truncated: upstreamInactiveLocalActiveCount > upstreamInactiveLocalActive.length,
          items: upstreamInactiveLocalActive,
        });
      }
    }

    logJson({
      event: 'party_lifecycle_audit_complete',
      snapshotComplete,
      abortReason,
      mutationPerformed: false,
    });
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(
    `${JSON.stringify({
      event: 'party_lifecycle_audit_failed',
      message,
      mutationPerformed: false,
    })}\n`,
  );
  process.exit(1);
});
