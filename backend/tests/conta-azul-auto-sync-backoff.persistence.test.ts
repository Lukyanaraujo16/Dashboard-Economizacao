import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  emptySyncCounts,
  type ContaAzulManualSyncJobPayload,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncCursorRepository } from '../src/modules/integrations/conta-azul/repositories/sync-cursor.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import {
  createContaAzulAutoSyncPlanner,
  type AutoSyncLogFields,
} from '../src/modules/integrations/conta-azul/services/conta-azul-auto-sync.planner.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const cursors = createContaAzulSyncCursorRepository(prisma);

const MIN = 60_000;
const T0 = new Date('2026-11-12T12:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedCandidate(name: string, lastSuccessfulSyncAt: Date) {
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
  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSuccessfulSyncAt },
  });
  return { tenant, integration };
}

function createPlanner() {
  const enqueued: ContaAzulManualSyncJobPayload[] = [];
  const skipped: Array<{ readonly event: string } & AutoSyncLogFields> = [];
  const planner = createContaAzulAutoSyncPlanner({
    integrations,
    syncRuns,
    cursors,
    publisher: {
      enqueue: async (payload) => {
        enqueued.push(payload);
      },
    },
    intervalMinutes: 60,
    log: (event, fields) => {
      if (event === 'conta_azul_auto_sync_skipped') {
        skipped.push({ event, ...fields });
      }
    },
  });
  return { planner, enqueued, skipped };
}

describe('Backoff do planner após falhas consecutivas', () => {
  it('falha persistente: 3 tentativas em ~4h em vez de uma por minuto', async () => {
    const { integration } = await seedCandidate('backoff-a', T0);
    const { planner, enqueued, skipped } = createPlanner();

    const attempts: number[] = [];
    for (let minute = 0; minute <= 245; minute += 1) {
      const before = enqueued.length;
      await planner.plan(at(minute));
      if (enqueued.length > before) {
        attempts.push(minute);
        // A execução falha 1 minuto depois, como em produção em 12/11.
        await syncRuns.markFailed({
          id: enqueued[enqueued.length - 1]!.syncRunId,
          errorCode: 'sync_upstream_rejected',
          at: at(minute + 1),
        });
      }
    }

    // 60 min após o sucesso; depois +60 min da 1ª falha; depois +120 min (teto 2h).
    expect(attempts).toEqual([60, 121, 242]);
    expect(enqueued.every((job) => job.integrationId === integration.id)).toBe(true);
    const backoff = skipped.filter((row) => row.reason === 'backoff');
    expect(backoff.length).toBeGreaterThan(100);
    expect(backoff[0]).toMatchObject({
      integrationId: integration.id,
      consecutiveFailures: 1,
      nextAttemptAt: at(121).toISOString(),
    });
    expect(
      await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } }),
    ).toMatchObject({ status: 'CONNECTED', lastSuccessfulSyncAt: T0 });
  });

  it('recupera após sucesso: falhas anteriores ao último sucesso deixam de contar', async () => {
    const { integration, tenant } = await seedCandidate('backoff-recover', T0);
    const { planner, enqueued } = createPlanner();

    await planner.plan(at(60));
    await syncRuns.markFailed({ id: enqueued[0]!.syncRunId, errorCode: 'sync_upstream_rejected', at: at(61) });
    expect(await syncRuns.summarizeFailuresSince(integration.id, T0)).toEqual({
      consecutiveFailures: 1,
      lastFailureAt: at(61),
    });

    const manual = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: at(70),
      triggerType: 'MANUAL',
    });
    await syncRuns.markSuccess({
      id: manual.id,
      integrationId: integration.id,
      counts: emptySyncCounts(),
      at: at(75),
    });
    expect(await syncRuns.summarizeFailuresSince(integration.id, at(75))).toEqual({
      consecutiveFailures: 0,
      lastFailureAt: null,
    });

    await planner.plan(at(134));
    expect(enqueued).toHaveLength(1);
    await planner.plan(at(135));
    expect(enqueued).toHaveLength(2);
  });

  it('isola integrações: o backoff de uma não altera o agendamento da outra', async () => {
    const failing = await seedCandidate('backoff-failing', T0);
    const healthy = await seedCandidate('backoff-healthy', T0);
    const { planner, enqueued } = createPlanner();
    const jobFor = (integrationId: string) =>
      enqueued.filter((job) => job.integrationId === integrationId).at(-1)!;

    await planner.plan(at(60));
    expect(enqueued).toHaveLength(2);
    await syncRuns.markFailed({ id: jobFor(failing.integration.id).syncRunId, errorCode: 'sync_upstream_rejected', at: at(61) });
    await syncRuns.markSuccess({
      id: jobFor(healthy.integration.id).syncRunId,
      integrationId: healthy.integration.id,
      counts: emptySyncCounts(),
      at: at(62),
    });

    await planner.plan(at(121));
    expect(enqueued.map((job) => job.integrationId).slice(2)).toEqual([failing.integration.id]);
    await syncRuns.markFailed({ id: jobFor(failing.integration.id).syncRunId, errorCode: 'sync_upstream_rejected', at: at(122) });

    await planner.plan(at(122));
    expect(enqueued.map((job) => job.integrationId).slice(3)).toEqual([healthy.integration.id]);

    for (const job of enqueued) {
      const row = await prisma.integration.findUniqueOrThrow({ where: { id: job.integrationId } });
      expect(row.tenantId).toBe(job.tenantId);
    }
  });

  it('não duplica job: run ativo bloqueia novo enqueue no mesmo tick e nos seguintes', async () => {
    await seedCandidate('backoff-dup', T0);
    const { planner, enqueued, skipped } = createPlanner();
    await planner.plan(at(60));
    await planner.plan(at(60));
    await planner.plan(at(61));
    expect(enqueued).toHaveLength(1);
    expect(skipped.some((row) => row.reason === 'in_progress')).toBe(true);
  });

  it('compatível com histórico: códigos antigos e finished_at nulo contam; antes do sucesso não', async () => {
    const { integration, tenant } = await seedCandidate('backoff-legacy', at(60));
    // Falha anterior ao último sucesso: ignorada.
    await prisma.syncRun.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        triggerType: 'SCHEDULED',
        status: 'FAILED',
        startedAt: at(10),
        finishedAt: at(11),
        errorCode: 'sync_upstream_unavailable',
      },
    });
    // Registros como os de produção: código antigo e um sem finished_at.
    await prisma.syncRun.createMany({
      data: [
        {
          tenantId: tenant.id,
          integrationId: integration.id,
          triggerType: 'SCHEDULED',
          status: 'FAILED',
          startedAt: at(120),
          finishedAt: at(121),
          errorCode: 'sync_upstream_unavailable',
        },
        {
          tenantId: tenant.id,
          integrationId: integration.id,
          triggerType: 'SCHEDULED',
          status: 'FAILED',
          startedAt: at(125),
          finishedAt: null,
          errorCode: null,
        },
      ],
    });
    // Falha de enfileiramento (Redis) não é falha da origem: não entra no backoff.
    await prisma.syncRun.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        triggerType: 'SCHEDULED',
        status: 'FAILED',
        startedAt: at(130),
        finishedAt: at(130),
        errorCode: 'sync_enqueue_failed',
      },
    });
    expect(await syncRuns.summarizeFailuresSince(integration.id, at(60))).toEqual({
      consecutiveFailures: 2,
      lastFailureAt: at(125),
    });

    const { planner, enqueued } = createPlanner();
    // 2 falhas → espera 120 min desde a última (min 125) → libera no min 245.
    await planner.plan(at(244));
    expect(enqueued).toHaveLength(0);
    await planner.plan(at(245));
    expect(enqueued).toHaveLength(1);
  });
});
