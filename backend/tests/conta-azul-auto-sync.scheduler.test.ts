import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { createContaAzulPlanSyncsScheduler } from '../src/infrastructure/jobs/conta-azul-plan-syncs.queue.js';
import { createBullmqRedisOptions } from '../src/infrastructure/jobs/bullmq-connection.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncCursorRepository } from '../src/modules/integrations/conta-azul/repositories/sync-cursor.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulAutoSyncPlanner } from '../src/modules/integrations/conta-azul/services/conta-azul-auto-sync.planner.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  drainContaAzulPlanSyncsTestQueue,
  drainContaAzulTestQueue,
} from './helpers/conta-azul-test-queue.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const cursors = createContaAzulSyncCursorRepository(prisma);
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const T0 = new Date('2026-08-18T12:00:00.000Z');
const T1H = new Date('2026-08-18T13:00:00.000Z');
const T3H = new Date('2026-08-18T15:00:00.000Z');

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await drainContaAzulTestQueue();
  await drainContaAzulPlanSyncsTestQueue();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedCandidate(name: string, lastSuccessfulSyncAt: Date | null) {
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
  if (lastSuccessfulSyncAt) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSuccessfulSyncAt },
    });
  }
  return { tenant, integration };
}

function createPlanner(enqueued: unknown[], skipped: string[]) {
  return createContaAzulAutoSyncPlanner({
    integrations,
    syncRuns,
    cursors,
    publisher: {
      enqueue: async (payload) => {
        enqueued.push(payload);
      },
    },
    intervalMinutes: 60,
    clock: () => T0,
    log: (event, fields) => {
      if (event === 'conta_azul_auto_sync_skipped' && fields.reason) {
        skipped.push(String(fields.reason));
      }
    },
  });
}

describe('Planner global e coalescing', () => {
  it('não enfileira sem baseline; enfileira quando due; downtime 3h gera um enqueue', async () => {
    const withoutBaseline = await seedCandidate('auto-no-base', null);
    const due = await seedCandidate('auto-due', T0);
    const enqueued: unknown[] = [];
    const skipped: string[] = [];
    const planner = createPlanner(enqueued, skipped);

    await planner.plan(new Date('2026-08-18T12:30:00.000Z'));
    expect(enqueued).toHaveLength(0);
    expect(skipped).toContain('not_due');
    expect(await integrations.listAutoSyncCandidates()).toEqual([
      expect.objectContaining({ integrationId: due.integration.id }),
    ]);
    expect(
      (await integrations.listAutoSyncCandidates()).some(
        (row) => row.integrationId === withoutBaseline.integration.id,
      ),
    ).toBe(false);

    await planner.plan(T1H);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      tenantId: due.integration.tenantId,
      integrationId: due.integration.id,
      trigger: 'SCHEDULED',
    });
    expect(JSON.stringify(enqueued[0])).not.toMatch(/token|cursor|credential/i);

    const later: unknown[] = [];
    const laterPlanner = createContaAzulAutoSyncPlanner({
      integrations,
      syncRuns,
      cursors,
      publisher: { enqueue: async (payload) => later.push(payload) },
      intervalMinutes: 60,
      clock: () => T3H,
    });
    await laterPlanner.plan(T3H);
    expect(later).toHaveLength(0);

    await prisma.syncRun.updateMany({
      where: { integrationId: due.integration.id },
      data: { status: 'SUCCESS', finishedAt: T1H },
    });
    await prisma.integration.update({
      where: { id: due.integration.id },
      data: { lastSuccessfulSyncAt: T0 },
    });
    const coalesced: unknown[] = [];
    const coalescedPlanner = createContaAzulAutoSyncPlanner({
      integrations,
      syncRuns,
      cursors,
      publisher: { enqueue: async (payload) => coalesced.push(payload) },
      intervalMinutes: 60,
      clock: () => T3H,
    });
    await coalescedPlanner.plan(T3H);
    expect(coalesced).toHaveLength(1);
    expect(withoutBaseline.integration.id).toBeTruthy();
  });

  it('manual ativo faz o planner skipar; scheduled ativo impede segundo scheduled', async () => {
    const { tenant, integration } = await seedCandidate('auto-lock', T0);
    await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: T0,
      triggerType: 'MANUAL',
    });
    const enqueued: unknown[] = [];
    const skipped: string[] = [];
    const planner = createPlanner(enqueued, skipped);
    await planner.plan(T1H);
    expect(enqueued).toHaveLength(0);
    expect(skipped).toContain('in_progress');

    await prisma.syncRun.updateMany({
      where: { integrationId: integration.id },
      data: { status: 'SUCCESS', finishedAt: T0 },
    });
    const first: unknown[] = [];
    const second: unknown[] = [];
    const a = createContaAzulAutoSyncPlanner({
      integrations,
      syncRuns,
      cursors,
      publisher: { enqueue: async (payload) => first.push(payload) },
      intervalMinutes: 60,
    });
    const b = createContaAzulAutoSyncPlanner({
      integrations,
      syncRuns,
      cursors,
      publisher: { enqueue: async (payload) => second.push(payload) },
      intervalMinutes: 60,
    });
    await Promise.all([a.plan(T1H), b.plan(T1H)]);
    expect(first.length + second.length).toBe(1);
  });

  it('skipa disconnected, error, tenant disabled, credential e identidade', async () => {
    const disconnected = await seedCandidate('auto-disc', T0);
    await integrations.disconnect(disconnected.tenant.id, T0);

    const errored = await seedCandidate('auto-err', T0);
    await integrations.markError(errored.tenant.id, 'refresh_failed', T0);

    const disabled = await seedCandidate('auto-dis', T0);
    await tenants.disable(disabled.tenant.id);

    const noCred = await seedCandidate('auto-cred', T0);
    await prisma.integrationCredential.deleteMany({
      where: { integrationId: noCred.integration.id },
    });

    const mismatch = await seedCandidate('auto-mis', T0);
    await cursors.upsert({
      tenantId: mismatch.tenant.id,
      integrationId: mismatch.integration.id,
      resource: 'PEOPLE',
      cursorAt: T0,
      externalAccountId: 'other-erp',
    });

    const enqueued: unknown[] = [];
    const skipped: string[] = [];
    const planner = createPlanner(enqueued, skipped);
    await planner.plan(T1H);
    expect(enqueued).toHaveLength(0);
    expect(skipped).toContain('identity_changed');
    const candidates = await integrations.listAutoSyncCandidates();
    expect(candidates.map((row) => row.integrationId)).toEqual([mismatch.integration.id]);
  });

  it('Job Scheduler global é idempotente no boot', async () => {
    const scheduler = createContaAzulPlanSyncsScheduler({
      connection: createBullmqRedisOptions(TEST_REDIS_URL),
      nodeEnv: 'test',
    });
    try {
      await scheduler.upsert();
      await scheduler.upsert();
      const ids = await scheduler.listSchedulerIds();
      const matching = ids.filter(
        (id) =>
          id === CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID ||
          id.includes(CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID),
      );
      expect(matching.length).toBe(1);
    } finally {
      await scheduler.close();
    }
  });
});
