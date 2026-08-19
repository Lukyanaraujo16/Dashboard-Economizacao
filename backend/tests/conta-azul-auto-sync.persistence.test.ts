import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import type { ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncCursorRepository } from '../src/modules/integrations/conta-azul/repositories/sync-cursor.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import {
  ContaAzulSyncExecutionError,
  createContaAzulManualSyncEngine,
} from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const cursors = createContaAzulSyncCursorRepository(prisma);

const BASELINE = new Date('2026-08-18T12:00:00.000Z');
const STARTED = new Date('2026-08-18T13:00:00.000Z');

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedReady(name: string) {
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
    externalAccountId: 'erp-1',
    externalCompanyName: 'ERP Um',
    metadata: null,
  });
  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSuccessfulSyncAt: BASELINE },
  });
  return { tenant, integration };
}

function capturingClient(input?: {
  readonly people?: unknown;
  readonly failPayables?: boolean;
  readonly unauthorizedThenOk?: boolean;
  readonly unauthorizedForever?: boolean;
}): {
  readonly client: ContaAzulApiClient;
  readonly peopleQueries: unknown[];
  readonly receivableQueries: unknown[];
  readonly payableQueries: unknown[];
  readonly categoryTokens: string[];
  readonly forceRefresh: ReturnType<typeof vi.fn>;
} {
  const peopleQueries: unknown[] = [];
  const receivableQueries: unknown[] = [];
  const payableQueries: unknown[] = [];
  const categoryTokens: string[] = [];
  let categoryCalls = 0;
  const base = createMockContaAzulApiClient();
  const forceRefresh = vi.fn(async () => 'refreshed-access');
  const client: ContaAzulApiClient = {
    ...base,
    getCategories: async (token, query) => {
      categoryTokens.push(token);
      categoryCalls += 1;
      if (input?.unauthorizedForever || (input?.unauthorizedThenOk && categoryCalls === 1)) {
        throw new ContaAzulApiError('unauthorized', '401', { httpStatus: 401 });
      }
      return base.getCategories(token, query);
    },
    getPeople: async (token, query) => {
      peopleQueries.push(query);
      if (input?.people !== undefined) {
        return input.people;
      }
      return base.getPeople(token, query);
    },
    searchReceivables: async (token, query) => {
      receivableQueries.push(query);
      return base.searchReceivables(token, query);
    },
    searchPayables: async (token, query) => {
      payableQueries.push(query);
      if (input?.failPayables) {
        throw new ContaAzulApiError('unavailable', 'ap fail', { httpStatus: 500 });
      }
      return base.searchPayables(token, query);
    },
  };
  return { client, peopleQueries, receivableQueries, payableQueries, categoryTokens, forceRefresh };
}

describe('Cursors e engine incremental', () => {
  it('janela vazia avança o cursor até o limite processado', async () => {
    const { tenant, integration } = await seedReady('auto-empty');
    const captured = capturingClient({ people: { totalItems: 0, items: null } });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'access',
      forceRefresh: captured.forceRefresh,
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    const stored = await cursors.listByIntegrationId(integration.id);
    const people = stored.find((row) => row.resource === 'PEOPLE');
    expect(people?.cursorAt.toISOString()).toBe(STARTED.toISOString());
    expect(captured.peopleQueries[0]).toMatchObject({
      dataAlteracaoDe: '2026-08-18T07:00:00',
      dataAlteracaoAte: '2026-08-18T10:00:00',
    });
  });

  it('AR/AP incremental envia vencimento 90d e data_alteracao', async () => {
    const { tenant, integration } = await seedReady('auto-arap');
    const captured = capturingClient();
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    const first = captured.receivableQueries[0] as {
      dataVencimentoDe: string;
      dataVencimentoAte: string;
      dataAlteracaoDe: string;
      dataAlteracaoAte: string;
    };
    expect(first.dataAlteracaoDe).toBe('2026-08-18T07:00:00');
    expect(first.dataAlteracaoAte).toBe('2026-08-18T10:00:00');
    const from = Date.parse(`${first.dataVencimentoDe}T00:00:00.000Z`);
    const to = Date.parse(`${first.dataVencimentoAte}T00:00:00.000Z`);
    expect(to - from).toBeLessThanOrEqual(89 * 24 * 60 * 60 * 1000);
    expect(captured.payableQueries[0]).toMatchObject({
      dataAlteracaoDe: '2026-08-18T07:00:00',
    });
  });

  it('falha em AP não avança o cursor de AP; People/AR avançam; lastSuccessful não muda', async () => {
    const { tenant, integration } = await seedReady('auto-partial');
    const captured = capturingClient({ failPayables: true });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: tenant.id,
        integrationId: integration.id,
      }),
    ).rejects.toBeInstanceOf(ContaAzulSyncExecutionError);
    const stored = await cursors.listByIntegrationId(integration.id);
    expect(stored.find((row) => row.resource === 'PEOPLE')?.cursorAt.toISOString()).toBe(
      STARTED.toISOString(),
    );
    expect(stored.find((row) => row.resource === 'RECEIVABLES')?.cursorAt.toISOString()).toBe(
      STARTED.toISOString(),
    );
    expect(stored.find((row) => row.resource === 'PAYABLES')).toBeUndefined();
    const integrationAfter = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(integrationAfter.lastSuccessfulSyncAt?.toISOString()).toBe(BASELINE.toISOString());
    expect(integrationAfter.status).toBe('CONNECTED');
  });

  it('identity mismatch bloqueia incremental e não apaga cursor/financeiro', async () => {
    const { tenant, integration } = await seedReady('auto-identity');
    await cursors.upsert({
      tenantId: tenant.id,
      integrationId: integration.id,
      resource: 'PEOPLE',
      cursorAt: BASELINE,
      externalAccountId: 'erp-old',
      lastRunId: (
        await syncRuns.createPending({
          tenantId: tenant.id,
          integrationId: integration.id,
          startedAt: BASELINE,
          triggerType: 'MANUAL',
        })
      ).id,
    });
    await prisma.syncRun.updateMany({
      where: { integrationId: integration.id },
      data: { status: 'SUCCESS', finishedAt: BASELINE },
    });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: createMockContaAzulApiClient(),
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: tenant.id,
        integrationId: integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_identity_changed' });
    const stored = await cursors.listByIntegrationId(integration.id);
    expect(stored[0]?.cursorAt.toISOString()).toBe(BASELINE.toISOString());
    expect(stored[0]?.externalAccountId).toBe('erp-old');
  });

  it('reconnect com a mesma identidade reutiliza o cursor', async () => {
    const { tenant, integration } = await seedReady('auto-same');
    await cursors.upsert({
      tenantId: tenant.id,
      integrationId: integration.id,
      resource: 'PEOPLE',
      cursorAt: new Date('2026-08-18T11:30:00.000Z'),
      externalAccountId: 'erp-1',
      lastRunId: (
        await syncRuns.createPending({
          tenantId: tenant.id,
          integrationId: integration.id,
          startedAt: BASELINE,
          triggerType: 'MANUAL',
        })
      ).id,
    });
    await prisma.syncRun.updateMany({
      where: { integrationId: integration.id },
      data: { status: 'SUCCESS', finishedAt: BASELINE },
    });
    const captured = capturingClient({ people: { totalItems: 0, items: [] } });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(captured.peopleQueries[0]).toMatchObject({
      dataAlteracaoDe: '2026-08-18T06:30:00',
    });
  });

  it('401 + forceRefresh + 200 conclui SUCCESS', async () => {
    const { tenant, integration } = await seedReady('auto-401-ok');
    const captured = capturingClient({ unauthorizedThenOk: true });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'stale-access',
      forceRefresh: captured.forceRefresh,
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(captured.forceRefresh).toHaveBeenCalledTimes(1);
    expect(captured.categoryTokens).toEqual(['stale-access', 'refreshed-access']);
    const integrationAfter = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(integrationAfter.status).toBe('CONNECTED');
    expect(integrationAfter.lastSuccessfulSyncAt?.toISOString()).toBe(STARTED.toISOString());
  });

  it('401 + refresh + 401 marca ERROR sem loop', async () => {
    const { tenant, integration } = await seedReady('auto-401-fail');
    const captured = capturingClient({ unauthorizedForever: true });
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: STARTED,
      triggerType: 'SCHEDULED',
    });
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      cursors,
      apiClient: captured.client,
      getValidAccessToken: async () => 'stale-access',
      forceRefresh: captured.forceRefresh,
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => STARTED,
    });
    await expect(
      engine.execute({
        syncRunId: run.id,
        tenantId: tenant.id,
        integrationId: integration.id,
      }),
    ).rejects.toMatchObject({ code: 'sync_unauthorized' });
    expect(captured.forceRefresh).toHaveBeenCalledTimes(1);
    expect(captured.categoryTokens).toHaveLength(2);
    const integrationAfter = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(integrationAfter.status).toBe('ERROR');
    expect(integrationAfter.lastErrorCode).toBe('identity_unauthorized');
    expect(integrationAfter.lastSuccessfulSyncAt?.toISOString()).toBe(BASELINE.toISOString());
  });
});
