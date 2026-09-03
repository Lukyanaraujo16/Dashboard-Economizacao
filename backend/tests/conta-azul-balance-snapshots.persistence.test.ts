import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { ContaAzulApiError, type ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulManualSyncEngine } from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
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

function balanceClient(options?: {
  readonly balances?: Record<string, number | 'fail'>;
  readonly accounts?: readonly { id: string; nome: string; ativo: boolean }[];
}): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  const accounts = options?.accounts ?? [
    { id: 'acc-1', nome: 'Caixa', ativo: true },
    { id: 'acc-2', nome: 'Banco', ativo: true },
    { id: 'acc-off', nome: 'Inativa', ativo: false },
  ];
  return {
    ...base,
    getFinancialAccounts: async (_token, query) => {
      if (query.pagina > 1) {
        return { itens_totais: accounts.length, itens: [] };
      }
      return {
        itens_totais: accounts.length,
        itens: accounts.map((account) => ({
          id: account.id,
          nome: account.nome,
          tipo: 'CONTA_CORRENTE',
          ativo: account.ativo,
        })),
      };
    },
    getFinancialAccountCurrentBalance: async (_token, externalId) => {
      const balances = options?.balances ?? { 'acc-1': 100, 'acc-2': 50 };
      const value = balances[externalId];
      if (value === 'fail') {
        throw new ContaAzulApiError('unavailable', 'boom', { httpStatus: 500 });
      }
      if (value === undefined) {
        throw new ContaAzulApiError('unavailable', 'sem saldo', { httpStatus: 500 });
      }
      return { saldo_atual: value };
    },
  };
}

async function runSync(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly apiClient: ContaAzulApiClient;
  readonly clock?: () => Date;
}) {
  const run = await syncRuns.createPending({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    startedAt: new Date(),
  });
  const engine = createContaAzulManualSyncEngine({
    tenants,
    integrations,
    syncRuns,
    financial,
    apiClient: input.apiClient,
    getValidAccessToken: async () => 'token',
    rateLimiter: createContaAzulRateLimiter({ minIntervalMs: 0 }),
    ...(input.clock ? { clock: input.clock } : {}),
  });
  await engine.execute({
    syncRunId: run.id,
    tenantId: input.tenantId,
    integrationId: input.integrationId,
  });
  return syncRuns.findById(run.id);
}

describe('Snapshots de saldo bancário (08-C1)', () => {
  it('cria snapshot, faz upsert no mesmo dia e atualiza saldo mais recente', async () => {
    const seeded = await seedConnected('bal-upsert');
    const clock = () => new Date('2026-09-02T15:00:00.000Z');
    await runSync({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      apiClient: balanceClient({
        accounts: [{ id: 'acc-1', nome: 'Caixa', ativo: true }],
        balances: { 'acc-1': 10 },
      }),
      clock,
    });
    await runSync({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      apiClient: balanceClient({
        accounts: [{ id: 'acc-1', nome: 'Caixa', ativo: true }],
        balances: { 'acc-1': 25.5 },
      }),
      clock,
    });
    const rows = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: seeded.tenant.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.balance.toString()).toBe('25.5');
    expect(rows[0]!.balanceDate.toISOString().slice(0, 10)).toBe('2026-09-02');
  });

  it('usa dia civil America/Sao_Paulo na virada próxima à meia-noite', async () => {
    const seeded = await seedConnected('bal-tz');
    // 2026-09-03 02:30 UTC = ainda 23:30 de 02/09 em SP (UTC-3)
    await runSync({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      apiClient: balanceClient({
        accounts: [{ id: 'acc-1', nome: 'Caixa', ativo: true }],
        balances: { 'acc-1': 1 },
      }),
      clock: () => new Date('2026-09-03T02:30:00.000Z'),
    });
    const before = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: seeded.tenant.id },
    });
    expect(before[0]!.balanceDate.toISOString().slice(0, 10)).toBe('2026-09-02');

    // 2026-09-03 03:30 UTC = 00:30 de 03/09 em SP
    await runSync({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      apiClient: balanceClient({
        accounts: [{ id: 'acc-1', nome: 'Caixa', ativo: true }],
        balances: { 'acc-1': 2 },
      }),
      clock: () => new Date('2026-09-03T03:30:00.000Z'),
    });
    const rows = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: seeded.tenant.id },
      orderBy: { balanceDate: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.balanceDate.toISOString().slice(0, 10))).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('captura só contas ativas, isola tenant e não apaga histórico ao inativar', async () => {
    const a = await seedConnected('bal-active-a');
    const b = await seedConnected('bal-active-b');
    await runSync({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      apiClient: balanceClient(),
      clock: () => new Date('2026-09-02T12:00:00.000Z'),
    });
    await runSync({
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
      apiClient: balanceClient({
        accounts: [{ id: 'acc-b', nome: 'Outro', ativo: true }],
        balances: { 'acc-b': 999 },
      }),
      clock: () => new Date('2026-09-02T12:00:00.000Z'),
    });

    const forA = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: a.tenant.id },
    });
    expect(forA).toHaveLength(2);
    expect(forA.every((row) => row.tenantId === a.tenant.id)).toBe(true);
    expect(forA.map((row) => row.financialAccountExternalId).sort()).toEqual(['acc-1', 'acc-2']);

    await prisma.financialAccount.updateMany({
      where: { tenantId: a.tenant.id, externalId: 'acc-2' },
      data: { active: false },
    });
    await runSync({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      apiClient: balanceClient({
        accounts: [
          { id: 'acc-1', nome: 'Caixa', ativo: true },
          { id: 'acc-2', nome: 'Banco', ativo: false },
        ],
        balances: { 'acc-1': 110 },
      }),
      clock: () => new Date('2026-09-02T18:00:00.000Z'),
    });

    const after = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: a.tenant.id },
      orderBy: { financialAccountExternalId: 'asc' },
    });
    expect(after).toHaveLength(2);
    const acc2 = after.find((row) => row.financialAccountExternalId === 'acc-2');
    expect(acc2!.balance.toString()).toBe('50');
    const acc1 = after.find((row) => row.financialAccountExternalId === 'acc-1');
    expect(acc1!.balance.toString()).toBe('110');
  });

  it('falha de uma conta não corrompe outras nem grava zero', async () => {
    const seeded = await seedConnected('bal-partial-fail');
    const finished = await runSync({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      apiClient: balanceClient({
        accounts: [
          { id: 'acc-1', nome: 'Ok', ativo: true },
          { id: 'acc-bad', nome: 'Falha', ativo: true },
        ],
        balances: {
          'acc-1': 40,
          'acc-bad': 'fail',
        },
      }),
      clock: () => new Date('2026-09-02T12:00:00.000Z'),
    });
    expect(finished?.status).toBe('SUCCESS');
    expect(finished?.counts?.balanceSnapshotsUpserted).toBe(1);
    expect(finished?.counts?.balanceSnapshotsFailed).toBe(1);
    const rows = await prisma.financialAccountBalanceSnapshot.findMany({
      where: { tenantId: seeded.tenant.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.balance.toString()).toBe('40');
    expect(rows.some((row) => row.balance.equals(new Prisma.Decimal(0)))).toBe(false);
  });
});
