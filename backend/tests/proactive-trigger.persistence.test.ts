import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';
import type { ProactiveActor } from '../src/modules/advisor/domain/proactive-trigger-access.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createProactiveTriggerService } from '../src/modules/advisor/services/proactive-trigger.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const service = createProactiveTriggerService(createProactiveTriggerRepository(prisma));

const admin: ProactiveActor = { role: 'ADMIN', supportSession: false };
const supportAdmin: ProactiveActor = { role: 'SUPER_ADMIN', supportSession: true };
const userActor: ProactiveActor = { role: 'USER', supportSession: false };

const detectedAt = new Date('2026-10-01T15:00:00.000Z');
const monthStart = new Date('2026-10-01T00:00:00.000Z');
const monthEnd = new Date('2026-10-31T00:00:00.000Z');

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
  return prisma.user.create({
    data: {
      tenantId,
      name: email,
      email,
      status: 'ACTIVE',
      role: 'USER',
    },
  });
}

describe('persistência de gatilhos proativos', () => {
  it('não ativa sugestão sozinha e isola configuração por tenant', async () => {
    const tenantA = await seedTenant('gatilho-a');
    const tenantB = await seedTenant('gatilho-b');
    expect(await service.listConfigurations(admin, tenantA.id)).toEqual([]);
    await service.createConfiguration(admin, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', { percentage: 80 });
    expect(await service.listConfigurations(admin, tenantB.id)).toEqual([]);
    await expect(
      service.createConfiguration(userActor, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', { percentage: 90 }),
    ).rejects.toMatchObject({ code: 'TRIGGER_ADMIN_FORBIDDEN' });
    await expect(
      service.createConfiguration(supportAdmin, tenantA.id, 'EXPENSE_CEILING_EXCEEDED', {}),
    ).rejects.toMatchObject({ code: 'SUPPORT_CANNOT_ADMINISTER_TRIGGERS' });
  });

  it('preserva evento ao editar ou desativar e deduplica a mesma ocorrência', async () => {
    const tenant = await seedTenant('gatilho-hist');
    const configuration = await service.createConfiguration(
      admin,
      tenant.id,
      'EXPENSE_CEILING_PERCENTAGE',
      { percentage: 80 },
    );
    const first = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: configuration.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'expense_ceiling',
      payload: { consumedRate: '92' },
      detectedAt,
    });
    const repeat = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: configuration.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'expense_ceiling',
      payload: { consumedRate: '92' },
      detectedAt,
    });
    expect(repeat.created).toBe(false);
    expect(repeat.eventId).toBe(first.eventId);
    expect(first.content).toBeNull();
    expect(first.narrationStatus).toBe('AWAITING_NARRATION');
    expect(first.parameterKey).toBe('percentage:80');

    const otherPeriod = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: configuration.id,
      periodKey: '2026-11',
      subjectKey: '',
      periodStart: new Date('2026-11-01T00:00:00.000Z'),
      periodEnd: new Date('2026-11-30T00:00:00.000Z'),
      sourceMetric: 'expense_ceiling',
      payload: { consumedRate: '81' },
      detectedAt,
    });
    expect(otherPeriod.eventId).not.toBe(first.eventId);

    const updated = await service.updateConfiguration(admin, tenant.id, configuration.id, {
      percentage: 90,
    });
    expect(updated.parameterKey).toBe('percentage:90');
    const historical = await prisma.analyticalEvent.findUniqueOrThrow({ where: { id: first.eventId } });
    expect(historical.parameterKey).toBe('percentage:80');
    expect(historical.severity).toBeNull();

    const afterEdit = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: configuration.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'expense_ceiling',
      payload: { consumedRate: '92' },
      detectedAt,
    });
    expect(afterEdit.created).toBe(true);
    expect(afterEdit.parameterKey).toBe('percentage:90');

    await service.setConfigurationActive(admin, tenant.id, configuration.id, false);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBe(3);
    await expect(
      service.recordOccurrence({
        tenantId: tenant.id,
        configurationId: configuration.id,
        periodKey: '2026-12',
        subjectKey: '',
        periodStart: new Date('2026-12-01T00:00:00.000Z'),
        periodEnd: new Date('2026-12-31T00:00:00.000Z'),
        sourceMetric: 'expense_ceiling',
        payload: { consumedRate: '1' },
        detectedAt,
      }),
    ).rejects.toBeInstanceOf(AdvisorDomainError);
    await expect(service.deleteConfiguration(admin, tenant.id, configuration.id)).rejects.toMatchObject({
      code: 'TRIGGER_CONFIGURATION_HAS_HISTORY',
    });
  });

  it('não colide título, kind nem configuração percentual distinta', async () => {
    const tenant = await seedTenant('gatilho-titulo');
    const goal80 = await service.createConfiguration(admin, tenant.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 80,
    });
    const goal90 = await service.createConfiguration(admin, tenant.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 90,
    });
    const payable = await service.createConfiguration(admin, tenant.id, 'TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    });
    const receivable = await service.createConfiguration(admin, tenant.id, 'TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'RECEIVABLE',
    });
    const base = {
      tenantId: tenant.id,
      periodStart: new Date('2026-10-04T00:00:00.000Z'),
      periodEnd: new Date('2026-10-04T00:00:00.000Z'),
      sourceMetric: 'title_due',
      payload: { unpaid: '6000' },
      detectedAt,
    };
    const titleA = await service.recordOccurrence({
      ...base,
      configurationId: payable.id,
      periodKey: '2026-10-04',
      subjectKey: 'PAYABLE:titulo-a',
    });
    const titleB = await service.recordOccurrence({
      ...base,
      configurationId: payable.id,
      periodKey: '2026-10-04',
      subjectKey: 'PAYABLE:titulo-b',
    });
    const sameIdOtherKind = await service.recordOccurrence({
      ...base,
      configurationId: receivable.id,
      periodKey: '2026-10-04',
      subjectKey: 'RECEIVABLE:titulo-a',
    });
    const crossed80 = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: goal80.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'revenue_goal',
      payload: { achievementRate: '92' },
      detectedAt,
    });
    const crossed90 = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: goal90.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'revenue_goal',
      payload: { achievementRate: '92' },
      detectedAt,
    });
    const ids = new Set([
      titleA.eventId,
      titleB.eventId,
      sameIdOtherKind.eventId,
      crossed80.eventId,
      crossed90.eventId,
    ]);
    expect(ids.size).toBe(5);
    const raced = await Promise.all([
      service.recordOccurrence({
        ...base,
        configurationId: payable.id,
        periodKey: '2026-10-04',
        subjectKey: 'PAYABLE:titulo-a',
      }),
      service.recordOccurrence({
        ...base,
        configurationId: payable.id,
        periodKey: '2026-10-04',
        subjectKey: 'PAYABLE:titulo-a',
      }),
    ]);
    expect(raced.filter((item) => item.created).length).toBeLessThanOrEqual(0);
    expect(await prisma.analyticalEvent.count({ where: { triggerConfigurationId: payable.id, subjectKey: 'PAYABLE:titulo-a' } })).toBe(1);
  });

  it('mantém leitura independente por usuário e bloqueia o modo suporte', async () => {
    const tenant = await seedTenant('gatilho-leitura');
    const readerA = await seedUser(tenant.id, 'leitura-a@example.com');
    const readerB = await seedUser(tenant.id, 'leitura-b@example.com');
    const other = await seedTenant('gatilho-outro');
    const outsider = await seedUser(other.id, 'leitura-fora@example.com');
    const configuration = await service.createConfiguration(admin, tenant.id, 'EXPENSE_CEILING_EXCEEDED', {});
    const occurrence = await service.recordOccurrence({
      tenantId: tenant.id,
      configurationId: configuration.id,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: monthStart,
      periodEnd: monthEnd,
      sourceMetric: 'expense_ceiling',
      payload: { status: 'EXCEEDED' },
      detectedAt,
    });
    const readAt = new Date('2026-10-02T12:00:00.000Z');
    await service.markInsightRead(userActor, {
      tenantId: tenant.id,
      insightId: occurrence.insightId,
      userId: readerA.id,
      readAt,
    });
    expect(await prisma.aiInsightRead.count({ where: { insightId: occurrence.insightId, userId: readerB.id } })).toBe(0);
    expect(await prisma.aiInsight.count({ where: { id: occurrence.insightId } })).toBe(1);
    await expect(
      service.markInsightRead(supportAdmin, {
        tenantId: tenant.id,
        insightId: occurrence.insightId,
        userId: readerB.id,
        readAt,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CANNOT_MARK_INSIGHT_READ' });
    await expect(
      service.markInsightRead(userActor, {
        tenantId: tenant.id,
        insightId: occurrence.insightId,
        userId: outsider.id,
        readAt,
      }),
    ).rejects.toMatchObject({ code: 'INSIGHT_READER_FORBIDDEN' });
    await expect(
      service.recordOccurrence({
        tenantId: other.id,
        configurationId: configuration.id,
        periodKey: '2026-10',
        subjectKey: '',
        periodStart: monthStart,
        periodEnd: monthEnd,
        sourceMetric: 'expense_ceiling',
        payload: { status: 'EXCEEDED' },
        detectedAt,
      }),
    ).rejects.toMatchObject({ code: 'TRIGGER_CONFIGURATION_NOT_FOUND' });
  });
});
