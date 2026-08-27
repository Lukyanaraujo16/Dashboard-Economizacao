import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import {
  createContaAzulManualSyncEngine,
  ContaAzulSyncExecutionError,
} from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import type { ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string) {
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
  return { tenant, integration };
}

function pageClient(options?: { readonly failReceivablesOnPage?: number }): ContaAzulApiClient {
  return {
    getConnectedCompany: async () => ({}),
    getCategories: async () => ({
      itens_totais: 1,
      itens: [{ id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' }],
    }),
    getFinancialAccounts: async () => ({
      itens_totais: 1,
      itens: [{ id: 'acc-1', nome: 'Caixa', tipo: 'CONTA_CORRENTE', ativo: true }],
    }),
    getPeople: async () => ({
      totalItems: 1,
      items: [{ id: 'p-1', nome: 'Maria', ativo: true, perfis: ['CLIENTE'] }],
    }),
    getCostCenters: async () => ({ itens_totais: 0, itens: [] }),
    searchReceivables: async (_token, query) => {
      if (options?.failReceivablesOnPage === query.pagina) {
        throw new ContaAzulApiError('unavailable', 'falha', { httpStatus: 500 });
      }
      if (query.pagina > 1) {
        return { itens_totais: 1, itens: [] };
      }
      return {
        itens_totais: 1,
        itens: [
          {
            id: 'r-1',
            descricao: 'Venda',
            data_vencimento: query.dataVencimentoDe,
            status_traduzido: 'EM_ABERTO',
            total: '10.00',
            pago: '0',
            nao_pago: '10.00',
            cliente: { id: 'p-1' },
            categorias: [{ id: 'cat-1' }],
          },
        ],
      };
    },
    searchPayables: async (_token, query) => {
      if (query.pagina > 1) {
        return { itens_totais: 0, itens: [] };
      }
      return {
        itens_totais: 1,
        itens: [
          {
            id: 'ap-1',
            descricao: 'Aluguel',
            data_vencimento: query.dataVencimentoDe,
            status_traduzido: 'EM_ABERTO',
            total: '20.00',
            pago: '0',
            nao_pago: '20.00',
            fornecedor: { id: 'p-1' },
          },
        ],
      };
    },
    getInstallmentDetail: async () => ({ id: 'r-1', evento: { rateio: [] } }),
    getInstallmentSettlements: async () => [],
    getSettlementById: async () => ({ kind: 'not_found' as const }),
    searchTransfers: async () => ({ itens_totais: 0, itens: [] }),
  };
}

describe('Persistência financeira Conta Azul', () => {
  it('respeita unique por integration+externalId e isola tenants', async () => {
    const a = await seedConnected('sync-iso-a');
    const b = await seedConnected('sync-iso-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'cat-1',
          name: 'A',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertCategories(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        {
          externalId: 'cat-1',
          name: 'B',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'cat-1',
          name: 'A2',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 2,
        },
      ],
    );

    expect(await prisma.financialCategory.count()).toBe(2);
    const updated = await prisma.financialCategory.findFirst({
      where: { integrationId: a.integration.id, externalId: 'cat-1' },
    });
    expect(updated?.name).toBe('A2');
    expect(updated?.tenantId).toBe(a.tenant.id);
  });

  it('persiste DATE e DECIMAL(19,4) em receivable', async () => {
    const seeded = await seedConnected('sync-money');
    await financial.upsertReceivables(
      {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        syncedAt: new Date(),
      },
      [
        {
          externalId: 'r-1',
          description: 'X',
          dueDate: new Date(Date.UTC(2026, 7, 15)),
          competenceDate: new Date(Date.UTC(2026, 7, 1)),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          upstreamStatus: 'EM_ABERTO',
          total: new Prisma.Decimal('10.5000'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('10.5000'),
          externalPartyId: null,
          categoryExternalIds: ['cat-1'],
        },
      ],
    );
    const row = await prisma.receivable.findFirstOrThrow();
    expect(row.total.toString()).toBe('10.5');
    expect(row.dueDate.toISOString().startsWith('2026-08-15')).toBe(true);
  });
});

describe('Engine da sync manual', () => {
  it('primeira carga preenche lastSuccessfulSyncAt; segunda não duplica', async () => {
    const seeded = await seedConnected('sync-engine-ok');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: pageClient(),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });

    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integration.lastSuccessfulSyncAt).toBeTruthy();
    expect(integration.status).toBe('CONNECTED');
    expect(await prisma.financialCategory.count()).toBe(1);
    expect(await prisma.party.count()).toBe(1);

    const second = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    await engine.execute({
      syncRunId: second.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    expect(await prisma.financialCategory.count()).toBe(1);
    expect(await prisma.receivable.count()).toBeGreaterThan(0);

    const afterSecond = {
      categories: await prisma.financialCategory.count(),
      accounts: await prisma.financialAccount.count(),
      parties: await prisma.party.count(),
      receivables: await prisma.receivable.count(),
      payables: await prisma.payable.count(),
    };
    expect(afterSecond.categories).toBe(1);
    expect(afterSecond.accounts).toBe(1);
    expect(afterSecond.parties).toBe(1);

    const updatedClient = createMockContaAzulApiClient({
      categoryName: 'Receitas operacionais',
      receivableStatus: 'PAGO',
      receivableTotal: '15.00',
    });
    const third = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const updateEngine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: updatedClient,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await updateEngine.execute({
      syncRunId: third.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    expect(await prisma.financialCategory.count()).toBe(afterSecond.categories);
    expect(await prisma.financialAccount.count()).toBe(afterSecond.accounts);
    expect(await prisma.party.count()).toBe(afterSecond.parties);
    expect(await prisma.receivable.count()).toBe(afterSecond.receivables);
    expect(await prisma.payable.count()).toBe(afterSecond.payables);
    const category = await prisma.financialCategory.findFirstOrThrow({
      where: { integrationId: seeded.integration.id, externalId: 'cat-1' },
    });
    expect(category.name).toBe('Receitas operacionais');
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: seeded.integration.id, externalId: 'r-1' },
    });
    expect(receivable.status).toBe('PAID');
    expect(receivable.total.toString()).toBe('15');
  });

  it('falha no meio não avança lastSuccessfulSyncAt e não marca ERROR', async () => {
    const seeded = await seedConnected('sync-engine-fail');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: pageClient({ failReceivablesOnPage: 1 }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_upstream_unavailable' });

    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.status).toBe('FAILED');
    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integration.lastSuccessfulSyncAt).toBeNull();
    expect(integration.status).toBe('CONNECTED');
    expect(await prisma.financialCategory.count()).toBe(1);
  });

  it('falha em página intermediária de AR não avança lastSuccessfulSyncAt e reexecução completa', async () => {
    const seeded = await seedConnected('sync-engine-partial');
    const failedRun = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const failingEngine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient({
        twoReceivablePages: true,
        failReceivablesOnPage: 2,
      }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await expect(
      failingEngine.execute({
        syncRunId: failedRun.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_upstream_unavailable' });

    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: failedRun.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.counts).toMatchObject({ categories: 1, financialAccounts: 1, parties: 1 });
    expect(await prisma.financialCategory.count()).toBe(1);
    expect(await prisma.financialAccount.count()).toBe(1);
    expect(await prisma.party.count()).toBe(1);
    const partialReceivables = await prisma.receivable.count();
    expect(partialReceivables).toBe(100);
    const integrationAfterFail = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integrationAfterFail.lastSuccessfulSyncAt).toBeNull();
    expect(integrationAfterFail.status).toBe('CONNECTED');

    const healthyRun = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const healthyEngine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient({ twoReceivablePages: true }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await healthyEngine.execute({
      syncRunId: healthyRun.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: healthyRun.id } });
    expect(success.status).toBe('SUCCESS');
    expect(await prisma.financialCategory.count()).toBe(1);
    expect(await prisma.receivable.count()).toBeGreaterThan(partialReceivables);
    const integrationAfterSuccess = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integrationAfterSuccess.lastSuccessfulSyncAt).toBeTruthy();
  });

  it('tenant desativado após enqueue não chama upstream', async () => {
    const seeded = await seedConnected('sync-engine-disabled');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    await tenants.disable(seeded.tenant.id);
    const calls: string[] = [];
    let tokenCalls = 0;
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient({
        onCall: (resource) => {
          calls.push(resource);
        },
      }),
      getValidAccessToken: async () => {
        tokenCalls += 1;
        return 'access';
      },
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_tenant_disabled' });
    expect(calls).toEqual([]);
    expect(tokenCalls).toBe(0);
    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('sync_tenant_disabled');
    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integration.lastSuccessfulSyncAt).toBeNull();
  });

  it('timeout operacional marca FAILED sem SUCCESS falso', async () => {
    const seeded = await seedConnected('sync-engine-timeout');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    let nowMs = Date.parse('2026-08-18T12:00:00.000Z');
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient({
        onCall: () => {
          nowMs += 200;
        },
      }),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => new Date(nowMs),
      timeoutMs: 100,
      heartbeatMinIntervalMs: 0,
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_timeout' });
    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('sync_timeout');
    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integration.lastSuccessfulSyncAt).toBeNull();
    await expect(
      syncRuns.createPending({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        startedAt: new Date(),
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('lock ativo impede segundo PENDING', async () => {
    const seeded = await seedConnected('sync-lock');
    await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    await expect(
      syncRuns.createPending({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        startedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('reexecução de run RUNNING é idempotente e não marca SUCCESS falso', async () => {
    const seeded = await seedConnected('sync-engine-rerun');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    await syncRuns.markRunning(run.id, new Date());
    await financial.upsertCategories(
      {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        syncedAt: new Date(),
      },
      [
        {
          externalId: 'cat-1',
          name: 'Parcial',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient(),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    expect(await prisma.financialCategory.count()).toBe(1);
    const category = await prisma.financialCategory.findFirstOrThrow();
    expect(category.name).toBe('Receitas');
    await engine.execute({
      syncRunId: run.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    expect((await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      'SUCCESS',
    );
    expect(await prisma.financialCategory.count()).toBe(1);
  });

  it('items null em pessoas esgota a página e segue para receber/pagar', async () => {
    const seeded = await seedConnected('sync-people-null-items');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const client = pageClient();
    client.getPeople = async () => ({ items: null, totalItems: 0 });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
    });
    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    expect(success.counts).toMatchObject({ parties: 0 });
    expect(await prisma.party.count()).toBe(0);
    expect(await prisma.receivable.count()).toBeGreaterThan(0);
    expect(await prisma.payable.count()).toBeGreaterThan(0);
  });

  it('pessoas inválidas falham a run e carregam diagnóstico sanitizado', async () => {
    const seeded = await seedConnected('sync-people-diag');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const client = pageClient();
    client.getPeople = async () => ({
      items: [{ id: 123, nome: 'SEGREDO-NAO-DEVE-APARECER' }],
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    try {
      await engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      });
      throw new Error('execute deveria falhar');
    } catch (error) {
      expect(error).toBeInstanceOf(ContaAzulSyncExecutionError);
      if (!(error instanceof ContaAzulSyncExecutionError)) {
        throw error;
      }
      expect(error.code).toBe('sync_invalid_payload');
      expect(error.diagnostic).toMatchObject({
        resource: 'pessoas',
        field: 'id',
        expected: 'non-empty-string',
        received: 'number',
        index: 0,
        page: 1,
      });
      const serialized = `${error.message}\n${JSON.stringify(error.diagnostic)}`;
      expect(serialized).not.toContain('SEGREDO-NAO-DEVE-APARECER');
    }
    const failed = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('sync_invalid_payload');
    expect(await prisma.party.count()).toBe(0);
    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: seeded.integration.id },
    });
    expect(integration.lastSuccessfulSyncAt).toBeNull();
  });

  it('JSON inválido em pessoas vira diagnóstico json_parse', async () => {
    const seeded = await seedConnected('sync-people-json');
    const run = await syncRuns.createPending({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      startedAt: new Date(),
    });
    const client = pageClient();
    client.getPeople = async () => {
      throw new ContaAzulApiError(
        'invalid_response',
        'A Conta Azul retornou uma resposta inválida.',
      );
    };
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    });
    try {
      await engine.execute({
        syncRunId: run.id,
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
      });
      throw new Error('execute deveria falhar');
    } catch (error) {
      expect(error).toBeInstanceOf(ContaAzulSyncExecutionError);
      if (!(error instanceof ContaAzulSyncExecutionError)) {
        throw error;
      }
      expect(error.diagnostic).toMatchObject({
        resource: 'pessoas',
        stage: 'json_parse',
        received: 'non_json_response',
        page: 1,
      });
      expect(JSON.stringify(error.diagnostic)).not.toContain('<html');
    }
  });
});
