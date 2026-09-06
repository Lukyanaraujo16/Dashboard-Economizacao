import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import type { ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_PAGE_SIZE,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulSyncCursorRepository } from '../src/modules/integrations/conta-azul/repositories/sync-cursor.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulTransferRepository } from '../src/modules/integrations/conta-azul/repositories/transfer.repository.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import {
  ContaAzulSyncExecutionError,
  createContaAzulManualSyncEngine,
} from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import {
  createContaAzulTransferSyncService,
  type ContaAzulTransferSyncService,
  type TransferSyncSummary,
} from '../src/modules/integrations/conta-azul/services/conta-azul-transfer-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const cursors = createContaAzulSyncCursorRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const transfers = createContaAzulTransferRepository(prisma);

const SRC = '11111111-1111-4111-8111-111111111111';
const DST = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-05T15:00:00.000Z');
const BASELINE = new Date('2026-08-01T12:00:00.000Z');

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string, withBaseline = false) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
    encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  await integrations.upsertExternalAccount({
    integrationId: integration.id,
    externalAccountId: `erp-${name}`,
    externalCompanyName: name,
    metadata: null,
  });
  if (withBaseline) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSuccessfulSyncAt: BASELINE },
    });
  }
  return { tenant, integration };
}

function transferItem(input: {
  readonly id: string;
  readonly data: string;
  readonly valor: number;
  readonly origin?: string;
  readonly dest?: string;
}) {
  return {
    id: input.id,
    data: input.data,
    valor: input.valor,
    descricao: 'Origem / Destino',
    origem: { conta_financeira: { id: input.origin ?? SRC, nome: 'Origem' } },
    destino: { conta_financeira: { id: input.dest ?? DST, nome: 'Destino' } },
  };
}

function stubSummary(
  overrides: Partial<TransferSyncSummary> = {},
): TransferSyncSummary {
  return {
    tenantId: 't',
    integrationId: 'i',
    from: '2026-06-08',
    to: '2026-09-05',
    pages: 0,
    fetched: 0,
    upserted: 0,
    skippedInvalid: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    ...overrides,
  };
}

function spyTransferSync(handler?: ContaAzulTransferSyncService['sync']): {
  readonly service: ContaAzulTransferSyncService;
  readonly calls: Array<Parameters<ContaAzulTransferSyncService['sync']>[0]>;
} {
  const calls: Array<Parameters<ContaAzulTransferSyncService['sync']>[0]> = [];
  return {
    calls,
    service: {
      sync: async (input) => {
        calls.push(input);
        if (handler) {
          return handler(input);
        }
        return stubSummary({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
          from: formatCivilDate(input.from),
          to: formatCivilDate(input.to),
        });
      },
    },
  };
}

function catalogClient(options?: {
  readonly searchTransfers?: ContaAzulApiClient['searchTransfers'];
}): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    searchTransfers:
      options?.searchTransfers ??
      (async () => ({ itens_totais: 0, itens: [] })),
  };
}

describe('10-B — TransferSync no fluxo padrão do engine', () => {
  it('1 — sync MANUAL chama TransferSyncService com janela full', async () => {
    const { tenant, integration } = await seedConnected('10b-call-full');
    const spy = spyTransferSync();
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: catalogClient(),
      transferSync: spy.service,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.scope.tenantId).toBe(tenant.id);
    expect(spy.calls[0]?.scope.integrationId).toBe(integration.id);
    expect(formatCivilDate(spy.calls[0]!.from)).toBe(
      formatCivilDate(
        new Date(
          Date.UTC(
            NOW.getUTCFullYear() - CONTA_AZUL_SYNC_LOOKBACK_YEARS,
            NOW.getUTCMonth(),
            NOW.getUTCDate(),
          ),
        ),
      ),
    );
    expect(formatCivilDate(spy.calls[0]!.to)).toBe(
      formatCivilDate(
        new Date(
          Date.UTC(
            NOW.getUTCFullYear() + CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
            NOW.getUTCMonth(),
            NOW.getUTCDate(),
          ),
        ),
      ),
    );
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    const counts = success.counts as Record<string, number>;
    expect(counts.transferPages).toBe(0);
    expect(counts.transferFetched).toBe(0);
  });

  it('2 — tenant novo (full) persiste transferências via TransferSync real', async () => {
    const { tenant, integration } = await seedConnected('10b-new-tenant');
    const transferId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const client = catalogClient({
      searchTransfers: async (_token, query) => {
        if (query.pagina > 1) {
          return { itens_totais: 1, itens: [] };
        }
        if (query.dataInicio <= '2026-08-20' && query.dataFim >= '2026-08-20') {
          return {
            itens_totais: 1,
            itens: [transferItem({ id: transferId, data: '2026-08-20', valor: 500 })],
          };
        }
        return { itens_totais: 0, itens: [] };
      },
    });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: client,
      transferSync: createContaAzulTransferSyncService({ transfers, apiClient: client }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    const rows = await prisma.financialTransfer.findMany({
      where: { integrationId: integration.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe(transferId);
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    const counts = success.counts as Record<string, number>;
    expect(counts.transferUpserted).toBeGreaterThanOrEqual(1);
    expect(counts.transferUnmatched).toBeGreaterThanOrEqual(1);
  });

  it('3 — sync SCHEDULED usa overlap/lookback de CONTA_AZUL_SYNC_WINDOW_DAYS', async () => {
    const { tenant, integration } = await seedConnected('10b-recurring', true);
    const spy = spyTransferSync();
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: catalogClient(),
      transferSync: spy.service,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(spy.calls).toHaveLength(1);
    expect(formatCivilDate(spy.calls[0]!.to)).toBe('2026-09-05');
    expect(formatCivilDate(spy.calls[0]!.from)).toBe('2026-06-08');
    const span =
      (spy.calls[0]!.to.getTime() - spy.calls[0]!.from.getTime()) / (24 * 60 * 60 * 1000) + 1;
    expect(span).toBe(CONTA_AZUL_SYNC_WINDOW_DAYS);
  });

  it('4 — transferência criada depois com data retroativa entra no próximo SCHEDULED', async () => {
    const { tenant, integration } = await seedConnected('10b-retro', true);
    const transferId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const queries: Array<{ dataInicio: string; dataFim: string; pagina: number }> = [];
    const client = catalogClient({
      searchTransfers: async (_token, query) => {
        queries.push({
          dataInicio: query.dataInicio,
          dataFim: query.dataFim,
          pagina: query.pagina,
        });
        if (query.pagina > 1) {
          return { itens_totais: 1, itens: [] };
        }
        // Criada em 05/09 com occurredOn 31/08 — API filtra por `data`.
        if (query.dataInicio <= '2026-08-31' && query.dataFim >= '2026-08-31') {
          return {
            itens_totais: 1,
            itens: [transferItem({ id: transferId, data: '2026-08-31', valor: 1350.02 })],
          };
        }
        return { itens_totais: 0, itens: [] };
      },
    });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: client,
      transferSync: createContaAzulTransferSyncService({ transfers, apiClient: client }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(queries.some((q) => q.dataInicio <= '2026-08-31' && q.dataFim >= '2026-08-31')).toBe(
      true,
    );
    expect(
      await prisma.financialTransfer.count({
        where: { integrationId: integration.id, externalId: transferId },
      }),
    ).toBe(1);
  });

  it('5 — página completa + segunda página são processadas', async () => {
    const { tenant, integration } = await seedConnected('10b-pages');
    const page1 = Array.from({ length: CONTA_AZUL_SYNC_PAGE_SIZE }, (_, i) =>
      transferItem({
        id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        data: '2026-08-15',
        valor: 10 + i,
      }),
    );
    const page2Item = transferItem({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      data: '2026-08-16',
      valor: 999,
    });
    let maxPage = 0;
    const client = catalogClient({
      searchTransfers: async (_token, query) => {
        maxPage = Math.max(maxPage, query.pagina);
        if (query.pagina === 1) {
          return { itens_totais: CONTA_AZUL_SYNC_PAGE_SIZE + 1, itens: page1 };
        }
        if (query.pagina === 2) {
          return { itens_totais: CONTA_AZUL_SYNC_PAGE_SIZE + 1, itens: [page2Item] };
        }
        return { itens_totais: CONTA_AZUL_SYNC_PAGE_SIZE + 1, itens: [] };
      },
    });
    const summary = await createContaAzulTransferSyncService({
      transfers,
      apiClient: client,
    }).sync({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
    });
    expect(maxPage).toBeGreaterThanOrEqual(2);
    expect(summary.pages).toBeGreaterThanOrEqual(2);
    expect(summary.upserted).toBe(CONTA_AZUL_SYNC_PAGE_SIZE + 1);
    expect(await prisma.financialTransfer.count({ where: { integrationId: integration.id } })).toBe(
      CONTA_AZUL_SYNC_PAGE_SIZE + 1,
    );
  });

  it('6 — reexecução da mesma janela é idempotente', async () => {
    const { tenant, integration } = await seedConnected('10b-idem');
    const payload = [transferItem({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', data: '2026-08-10', valor: 100 })];
    const client = catalogClient({
      searchTransfers: async (_token, query) => {
        if (query.pagina > 1) {
          return { itens_totais: 1, itens: [] };
        }
        return { itens_totais: 1, itens: payload };
      },
    });
    const service = createContaAzulTransferSyncService({ transfers, apiClient: client });
    const input = {
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      requestWithAuth: async <T>(work: (t: string) => Promise<T>) => work('token'),
      gatedGet: async <T>(work: () => Promise<T>) => work(),
    };
    await service.sync(input);
    await service.sync(input);
    expect(await prisma.financialTransfer.count({ where: { integrationId: integration.id } })).toBe(1);
    expect(
      await prisma.financialTransaction.count({
        where: { financialTransferId: { not: null } },
      }),
    ).toBe(0);
  });

  it('7+8 — após upsert aplica matches com matcher direcional 10-A', async () => {
    const { tenant, integration } = await seedConnected('10b-match');
    const transferId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      'PAYABLE',
      [
        mapSettlement({
          id: 'settle-out',
          id_parcela: 'parc-out',
          data_pagamento: '2026-08-20',
          tipo_evento_financeiro: 'DESPESA',
          valor_composicao: {
            valor_bruto: '200.00',
            valor_liquido: '200.00',
            juros: '0',
            multa: '0',
            desconto: '0',
            taxa: '0',
          },
          conta_financeira: { id: SRC },
        }),
      ],
    );
    // RECEIPT @ origem (falso positivo 10-A) — NÃO deve casar.
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      'RECEIVABLE',
      [
        mapSettlement({
          id: 'settle-false',
          id_parcela: 'parc-false',
          data_pagamento: '2026-08-20',
          tipo_evento_financeiro: 'RECEITA',
          valor_composicao: {
            valor_bruto: '200.00',
            valor_liquido: '200.00',
            juros: '0',
            multa: '0',
            desconto: '0',
            taxa: '0',
          },
          conta_financeira: { id: SRC },
        }),
      ],
    );
    const client = catalogClient({
      searchTransfers: async (_token, query) => {
        if (query.pagina > 1) {
          return { itens_totais: 1, itens: [] };
        }
        return {
          itens_totais: 1,
          itens: [transferItem({ id: transferId, data: '2026-08-20', valor: 200 })],
        };
      },
    });
    const applySpy = vi.spyOn(transfers, 'applyMatches');
    const summary = await createContaAzulTransferSyncService({
      transfers,
      apiClient: client,
    }).sync({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
    });
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(summary.matched).toBe(1);
    expect(summary.unmatched).toBe(0);
    const row = await prisma.financialTransfer.findFirstOrThrow({
      where: { externalId: transferId },
    });
    expect(row.matchStatus).toBe('MATCHED');
    const matchedTx = await prisma.financialTransaction.findFirst({
      where: { financialTransferId: row.id },
    });
    expect(matchedTx).toBeTruthy();
    expect(matchedTx?.externalId).toBe('settle-out');
    expect(matchedTx?.transactionType).toBe('DISBURSEMENT');
    expect(matchedTx?.financialAccountExternalId).toBe(SRC);
    applySpy.mockRestore();
  });

  it('9 — falha do TransferSyncService marca run FAILED e propaga (não engole)', async () => {
    const { tenant, integration } = await seedConnected('10b-fail');
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: catalogClient(),
      transferSync: {
        sync: async () => {
          throw new ContaAzulApiError('unavailable', 'transfer sync down', { httpStatus: 500 });
        },
      },
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: tenant.id,
        integrationId: integration.id,
      }),
    ).rejects.toBeInstanceOf(ContaAzulSyncExecutionError);
    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBeTruthy();
    // Ledger/catálogo anterior não é “corrompido” — falha na etapa de transferências.
    expect(await prisma.financialCategory.count()).toBeGreaterThan(0);
  });

  it('10 — múltiplos tenants não compartilham escopo/checkpoint indevidamente', async () => {
    const a = await seedConnected('10b-tenant-a');
    const b = await seedConnected('10b-tenant-b');
    const spy = spyTransferSync();
    for (const seeded of [a, b]) {
      const run = await syncRuns.createPending({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        startedAt: NOW,
        triggerType: 'MANUAL',
      });
      const engine = createContaAzulManualSyncEngine({
        tenants,
        integrations,
        syncRuns,
        financial,
        cursors,
        apiClient: catalogClient(),
        transferSync: spy.service,
        getValidAccessToken: async () => 'access',
        rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
        clock: () => NOW,
      });
      await engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      });
    }
    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]?.scope.tenantId).toBe(a.tenant.id);
    expect(spy.calls[0]?.scope.integrationId).toBe(a.integration.id);
    expect(spy.calls[1]?.scope.tenantId).toBe(b.tenant.id);
    expect(spy.calls[1]?.scope.integrationId).toBe(b.integration.id);
  });

  it('11 — sync sem transferências retorna normalmente', async () => {
    const { tenant, integration } = await seedConnected('10b-empty');
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: catalogClient(),
      transferSync: createContaAzulTransferSyncService({
        transfers,
        apiClient: catalogClient(),
      }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    const counts = success.counts as Record<string, number>;
    expect(counts.transferUpserted).toBe(0);
    expect(await prisma.financialTransfer.count({ where: { integrationId: integration.id } })).toBe(
      0,
    );
  });

  it('12 — engine sem transferSync opcional não quebra (compatibilidade de testes legados)', async () => {
    const { tenant, integration } = await seedConnected('10b-optional');
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: catalogClient(),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    const counts = success.counts as Record<string, number>;
    expect(counts.transferUpserted ?? 0).toBe(0);
  });
});
