import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { GenerationInput } from '../src/infrastructure/ai/types.js';
import { IaProviderError } from '../src/infrastructure/ai/types.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import { PROACTIVE_NARRATION_INSTRUCTIONS } from '../src/modules/advisor/domain/proactive-narration-prompt.js';
import { createUserRepository } from '../src/modules/auth/repositories/user.repository.js';
import { createAdvisorConversationRepository } from '../src/modules/advisor/repositories/advisor-conversation.repository.js';
import { createAdvisorRunRepository } from '../src/modules/advisor/repositories/advisor-run.repository.js';
import { createAdvisorSettingsRepository } from '../src/modules/advisor/repositories/advisor-settings.repository.js';
import { createProactiveInsightRepository } from '../src/modules/advisor/repositories/proactive-insight.repository.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createAdminConsultantService } from '../src/modules/advisor/services/admin-consultant.service.js';
import { createProactiveInsightDelivery } from '../src/modules/advisor/services/proactive-insight-delivery.service.js';
import { createProactiveNarrationService } from '../src/modules/advisor/services/proactive-narration.service.js';
import { runProactiveTenantEvaluation } from '../src/modules/advisor/services/proactive-evaluation.service.js';
import { createProactiveTriggerBootstrap } from '../src/modules/advisor/services/proactive-trigger-bootstrap.service.js';
import { createProactiveTriggerEngine } from '../src/modules/advisor/services/proactive-trigger-engine.service.js';
import { createProactiveTriggerService } from '../src/modules/advisor/services/proactive-trigger.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const triggers = createProactiveTriggerRepository(prisma);
const triggerService = createProactiveTriggerService(triggers);
const bootstrap = createProactiveTriggerBootstrap({ prisma, triggers });
const insights = createProactiveInsightRepository(prisma);
const settings = createAdvisorSettingsRepository(prisma);
const runs = createAdvisorRunRepository(prisma);
const conversations = createAdvisorConversationRepository(prisma);
const delivery = createProactiveInsightDelivery({
  insights,
  conversations,
  reads: triggers,
});

const NOW = new Date('2026-10-15T15:00:00.000Z');

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedTenant(name: string) {
  return tenants.create({ name, displayName: name });
}

async function seedUser(tenantId: string, email: string) {
  return users.create({
    name: email,
    email,
    role: 'USER',
    tenantId,
    status: 'ACTIVE',
  });
}

function engineFor(facts: {
  readonly target: string | null;
  readonly ceiling: string | null;
  readonly inflows: string | null;
  readonly receivables: string | null;
  readonly outflows: string | null;
  readonly payables: string | null;
}) {
  return createProactiveTriggerEngine({
    triggers,
    triggerService,
    cashFlow: {
      async getMonthlyCashFlow(input) {
        return {
          monthKey: input.monthKey ?? '2026-10',
          realized: {
            inflows: facts.inflows === null ? null : new Prisma.Decimal(facts.inflows),
            outflows: facts.outflows === null ? null : new Prisma.Decimal(facts.outflows),
          },
          expected: {
            receivables: facts.receivables === null ? null : new Prisma.Decimal(facts.receivables),
            payables: facts.payables === null ? null : new Prisma.Decimal(facts.payables),
          },
        } as MonthlyCashFlow;
      },
    },
    revenueGoals: {
      async findByTenantMonth(_tenantId, monthKey) {
        if (facts.target === null) {
          return null;
        }
        return { monthKey, targetAmount: new Prisma.Decimal(facts.target), updatedAt: NOW };
      },
    },
    expenseCeilings: {
      async findByTenantMonth(_tenantId, monthKey) {
        if (facts.ceiling === null) {
          return null;
        }
        return { monthKey, ceilingAmount: new Prisma.Decimal(facts.ceiling), updatedAt: NOW };
      },
    },
    receivables: { async findActiveByDueDateRange() { return []; } },
    payables: { async findActiveByDueDateRange() { return []; } },
  });
}

const WITHOUT_PLANNING = {
  target: null,
  ceiling: null,
  inflows: null,
  receivables: null,
  outflows: null,
  payables: null,
};

const AT_92 = {
  target: '10000',
  ceiling: '10000',
  inflows: '7000',
  receivables: '2200',
  outflows: '5000',
  payables: '4200',
};

describe('bootstrap dos gatilhos padrão', () => {
  it('provisiona 9 ativos no save do Consultor ativo e não duplica nem reativa', async () => {
    const tenant = await seedTenant('bootstrap-novo');
    const admin = createAdminConsultantService({
      tenants,
      settings,
      knowledge: {} as never,
      nodeEnv: 'test',
      bootstrapDefaults: (tenantId) => bootstrap.ensureDefaultPackage(tenantId).then(() => undefined),
    });

    await admin.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'DISABLED',
    });
    expect(await prisma.proactiveTriggerConfiguration.count({ where: { tenantId: tenant.id } })).toBe(0);

    await admin.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'ACTIVE',
    });
    const first = await prisma.proactiveTriggerConfiguration.findMany({ where: { tenantId: tenant.id } });
    expect(first).toHaveLength(9);
    expect(first.every((row) => row.active)).toBe(true);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBe(0);

    await admin.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'ACTIVE',
    });
    expect(await prisma.proactiveTriggerConfiguration.count({ where: { tenantId: tenant.id } })).toBe(9);
  });

  it('preserva configuração manual e desativada, e não recria o que foi apagado depois do marcador', async () => {
    const tenant = await seedTenant('bootstrap-existente');
    const other = await seedTenant('bootstrap-outro');
    await triggerService.createConfiguration(
      { role: 'ADMIN', supportSession: false },
      tenant.id,
      'REVENUE_GOAL_PERCENTAGE',
      { percentage: 75 },
    );
    const inactive = await triggerService.createConfiguration(
      { role: 'ADMIN', supportSession: false },
      tenant.id,
      'REVENUE_GOAL_PERCENTAGE',
      { percentage: 80 },
    );
    await triggerService.setConfigurationActive(
      { role: 'ADMIN', supportSession: false },
      tenant.id,
      inactive.id,
      false,
    );

    const first = await bootstrap.ensureDefaultPackage(tenant.id);
    expect(first.alreadyBootstrapped).toBe(false);
    expect(first.created).toBe(8);
    expect(first.preserved).toBe(1);
    const rows = await prisma.proactiveTriggerConfiguration.findMany({ where: { tenantId: tenant.id } });
    expect(rows).toHaveLength(10);
    expect(rows.find((row) => row.id === inactive.id)?.active).toBe(false);
    expect(rows.some((row) => row.parameterKey === 'percentage:75')).toBe(true);

    const hundred = rows.find(
      (row) => row.triggerType === 'REVENUE_GOAL_PERCENTAGE' && row.parameterKey === 'percentage:100',
    );
    expect(hundred).toBeTruthy();
    await prisma.proactiveTriggerConfiguration.delete({ where: { id: hundred!.id } });

    const second = await bootstrap.ensureDefaultPackage(tenant.id);
    expect(second.alreadyBootstrapped).toBe(true);
    expect(
      await prisma.proactiveTriggerConfiguration.findFirst({
        where: { tenantId: tenant.id, parameterKey: 'percentage:100', triggerType: 'REVENUE_GOAL_PERCENTAGE' },
      }),
    ).toBeNull();
    expect(await prisma.proactiveTriggerConfiguration.count({ where: { tenantId: other.id } })).toBe(0);

    await runProactiveTenantEvaluation(
      {
        engine: engineFor(WITHOUT_PLANNING),
        insights,
        enqueueNarration: async () => undefined,
      },
      tenant.id,
    );
    expect(await prisma.proactiveTriggerBootstrap.count()).toBe(1);
    expect(await prisma.analyticalEvent.count()).toBe(0);
  });
});

describe('fluxo proativo da Lia', () => {
  function narration(input: {
    readonly fail?: boolean;
    readonly calls: GenerationInput[];
    readonly apiKey?: string | null;
  }) {
    return createProactiveNarrationService({
      insights,
      settings,
      runs,
      resolveProviderApiKey: async () => (input.apiKey === undefined ? 'test-key' : input.apiKey),
      providers: {
        resolve() {
          return {
            id: 'OPENAI',
            async generate(block) {
              input.calls.push(block);
              if (input.fail) {
                throw new IaProviderError('PROVIDER_ERROR', 'indisponível');
              }
              return {
                text: 'Texto livre do provedor.',
                usage: { inputTokens: 3, outputTokens: 4 },
              };
            },
          };
        },
      },
    });
  }

  it('decide no motor, redige com o provider e entrega a leitura por usuário', async () => {
    const tenant = await seedTenant('lia-fluxo');
    const other = await seedTenant('lia-outro');
    const userA = await seedUser(tenant.id, 'a@acme.test');
    const userB = await seedUser(tenant.id, 'b@acme.test');
    const outsider = await seedUser(other.id, 'c@acme.test');
    await settings.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'ACTIVE',
    });
    await bootstrap.ensureDefaultPackage(tenant.id);

    await runProactiveTenantEvaluation(
      {
        engine: engineFor(WITHOUT_PLANNING),
        insights,
        enqueueNarration: async () => undefined,
        now: NOW,
      },
      tenant.id,
    );
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBe(0);

    const queued: string[] = [];
    const firstPass = await runProactiveTenantEvaluation(
      {
        engine: engineFor(AT_92),
        insights,
        enqueueNarration: async (insightId) => {
          queued.push(insightId);
        },
        now: NOW,
      },
      tenant.id,
    );
    expect(firstPass.created).toBeGreaterThan(0);
    expect(queued.length).toBe(firstPass.created);
    const events = await prisma.analyticalEvent.findMany({ where: { tenantId: tenant.id } });
    expect(events.every((event) => event.periodKey.includes('2026-10'))).toBe(true);
    expect(events.some((event) => event.periodKey.includes('2026-08'))).toBe(false);

    const secondPass = await runProactiveTenantEvaluation(
      {
        engine: engineFor(AT_92),
        insights,
        enqueueNarration: async () => undefined,
        now: NOW,
      },
      tenant.id,
    );
    expect(secondPass.created).toBe(0);
    expect(secondPass.reused).toBe(firstPass.created);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenant.id } })).toBe(firstPass.created);

    const [awaiting] = await insights.listAwaitingNarration(tenant.id);
    expect(awaiting).toBeTruthy();
    const severityBefore = awaiting!.severity;
    const supportingBefore = JSON.stringify(awaiting!.supportingData);
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
    })).toBe(0);

    const calls: GenerationInput[] = [];
    const narrator = narration({ calls });
    await expect(narrator.narrate({ tenantId: other.id, insightId: awaiting!.id })).resolves.toBe('skipped');
    expect(calls).toHaveLength(0);

    const failing = narration({ calls, fail: true });
    await expect(failing.narrate({ tenantId: tenant.id, insightId: awaiting!.id })).rejects.toBeInstanceOf(
      IaProviderError,
    );
    const failed = await insights.findByTenant(tenant.id, awaiting!.id);
    expect(failed?.narrationStatus).toBe('NARRATION_FAILED');
    expect(JSON.stringify(failed?.supportingData)).toBe(supportingBefore);
    expect(failed?.severity).toBe(severityBefore);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBe(firstPass.created);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenant.id } })).toBe(firstPass.created);

    await narrator.narrate({ tenantId: tenant.id, insightId: awaiting!.id });
    await narrator.narrate({ tenantId: tenant.id, insightId: awaiting!.id });
    expect(calls).toHaveLength(2);
    const narrated = await insights.findByTenant(tenant.id, awaiting!.id);
    expect(narrated?.narrationStatus).toBe('NARRATED');
    expect(narrated?.content).toBe('Texto livre do provedor.');
    expect(narrated?.severity).toBe(severityBefore);
    expect(JSON.stringify(narrated?.supportingData)).toBe(supportingBefore);
    const factBlock = calls[1]?.blocks.find((block) => block.type === 'ANALYTICAL_FACTS');
    expect(factBlock?.content).toContain(supportingBefore);
    expect(calls[1]?.blocks[0]?.content).toBe(PROACTIVE_NARRATION_INSTRUCTIONS);
    expect(calls[1]?.tools).toBeUndefined();

    const runRows = await prisma.aiRun.findMany({
      where: { tenantId: tenant.id, insightId: awaiting!.id, runType: 'PROACTIVE_NARRATION' },
    });
    expect(runRows.length).toBeGreaterThanOrEqual(2);
    expect(runRows.some((row) => row.status === 'SUCCEEDED')).toBe(true);
    expect(runRows.every((row) => row.userId === null)).toBe(true);

    const unreadA = await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
    });
    expect(unreadA).toBe(1);
    const listed = await delivery.listEligible({ tenantId: tenant.id, userId: userA.id });
    expect(listed).toHaveLength(1);
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
    })).toBe(1);

    const operator = await users.create({
      name: 'Operador',
      email: 'ops@acme.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: operator.id,
      actor: 'support-operator',
    })).toBe(0);

    const presented = await delivery.present({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(presented.materialized).toBe(1);
    expect(presented.messages[0]?.relatedInsightId).toBe(awaiting!.id);
    expect(presented.messages[0]?.senderType).toBe('SYSTEM');
    const again = await delivery.present({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
      now: NOW,
    });
    expect(again.materialized).toBe(0);
    expect(await prisma.aiMessage.count({
      where: { tenantId: tenant.id, relatedInsightId: awaiting!.id },
    })).toBe(1);
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userA.id,
      actor: 'tenant-member',
    })).toBe(0);
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userB.id,
      actor: 'tenant-member',
    })).toBe(1);
    expect(await delivery.unreadCount({
      tenantId: other.id,
      userId: outsider.id,
      actor: 'tenant-member',
    })).toBe(0);

    const supportView = await delivery.present({
      tenantId: tenant.id,
      userId: operator.id,
      actor: 'support-operator',
      now: NOW,
    });
    expect(supportView.materialized).toBe(1);
    expect(await prisma.aiInsightRead.count({
      where: { tenantId: tenant.id, userId: userA.id },
    })).toBe(1);
    expect(await prisma.aiInsightRead.count({
      where: { tenantId: tenant.id, userId: userB.id },
    })).toBe(0);
    expect(await prisma.aiInsightRead.count({
      where: { tenantId: tenant.id, userId: operator.id },
    })).toBe(0);
    expect(await delivery.unreadCount({
      tenantId: tenant.id,
      userId: userB.id,
      actor: 'tenant-member',
    })).toBe(1);
  });

  it('credencial ausente preserva o insight e não chama o provider', async () => {
    const tenant = await seedTenant('lia-sem-chave');
    await settings.upsertSettings(tenant.id, {
      provider: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      status: 'ACTIVE',
    });
    await bootstrap.ensureDefaultPackage(tenant.id);
    await runProactiveTenantEvaluation(
      {
        engine: engineFor(AT_92),
        insights,
        enqueueNarration: async () => undefined,
        now: NOW,
      },
      tenant.id,
    );
    const [awaiting] = await insights.listAwaitingNarration(tenant.id);
    const calls: GenerationInput[] = [];
    const narrator = narration({ calls, apiKey: null });
    await expect(narrator.narrate({ tenantId: tenant.id, insightId: awaiting!.id })).resolves.toBe('failed');
    expect(calls).toHaveLength(0);
    expect((await insights.findByTenant(tenant.id, awaiting!.id))?.narrationStatus).toBe('NARRATION_FAILED');
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBeGreaterThan(0);
  });
});
