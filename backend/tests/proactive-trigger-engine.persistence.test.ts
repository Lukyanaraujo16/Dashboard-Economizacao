import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow, GetMonthlyCashFlowInput } from '../src/modules/analytics/domain/types.js';
import { monthlyBilling, monthlyExpenses } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { calculateExpenseCeilingProgress } from '../src/modules/dashboard/domain/expense-ceiling-math.js';
import { calculateRevenueGoalProgress } from '../src/modules/dashboard/domain/revenue-goal-math.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import type { DueDateRangeQuery } from '../src/modules/finance/domain/types.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import type { ProactiveActor } from '../src/modules/advisor/domain/proactive-trigger-access.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createProactiveTriggerEngine } from '../src/modules/advisor/services/proactive-trigger-engine.service.js';
import { createProactiveTriggerService } from '../src/modules/advisor/services/proactive-trigger.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const triggers = createProactiveTriggerRepository(prisma);
const service = createProactiveTriggerService(triggers);
const admin: ProactiveActor = { role: 'ADMIN', supportSession: false };

const NOW = new Date('2026-10-15T15:00:00.000Z');
const MONTH = '2026-10';

type Money = string | null;

type PlanningFacts = {
  readonly target: Money;
  readonly inflows: Money;
  readonly receivables: Money;
  readonly ceiling: Money;
  readonly outflows: Money;
  readonly payables: Money;
};

type TitleFacts = {
  readonly receivables: readonly FinancialInstallmentReadRecord[];
  readonly payables: readonly FinancialInstallmentReadRecord[];
};

const AT_92: PlanningFacts = {
  target: '10000',
  inflows: '7000',
  receivables: '2200',
  ceiling: '10000',
  outflows: '5000',
  payables: '4200',
};

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedTenant(name: string) {
  return tenants.create({ name, displayName: name });
}

function decimalOrNull(value: Money): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function flowSlice(facts: PlanningFacts) {
  return {
    realized: {
      inflows: decimalOrNull(facts.inflows),
      outflows: decimalOrNull(facts.outflows),
    },
    expected: {
      receivables: decimalOrNull(facts.receivables),
      payables: decimalOrNull(facts.payables),
    },
  };
}

function titleRecord(input: {
  readonly id: string;
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid: string;
}): FinancialInstallmentReadRecord {
  const unpaid = new Prisma.Decimal(input.unpaid);
  return {
    id: input.id,
    tenantId: 'double',
    integrationId: 'integration',
    externalId: input.externalId,
    description: 'segredo-descricao',
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'OPEN',
    upstreamStatus: null,
    total: unpaid,
    paid: new Prisma.Decimal(0),
    unpaid,
    partyId: 'pessoa-x',
    categoryExternalIds: ['categoria-x'],
    syncedAt: NOW,
  };
}

function engineFor(facts: PlanningFacts, titles: TitleFacts = { receivables: [], payables: [] }) {
  const cashFlowCalls: GetMonthlyCashFlowInput[] = [];
  const goalReads: { tenantId: string; monthKey: string }[] = [];
  const ceilingReads: { tenantId: string; monthKey: string }[] = [];
  const receivableReads: DueDateRangeQuery[] = [];
  const payableReads: DueDateRangeQuery[] = [];
  const within = (row: FinancialInstallmentReadRecord, query: DueDateRangeQuery) =>
    row.dueDate.getTime() >= query.from.getTime() && row.dueDate.getTime() <= query.to.getTime();

  const engine = createProactiveTriggerEngine({
    triggers,
    triggerService: service,
    cashFlow: {
      async getMonthlyCashFlow(input) {
        cashFlowCalls.push(input);
        return {
          monthKey: input.monthKey ?? MONTH,
          realized: flowSlice(facts).realized,
          expected: flowSlice(facts).expected,
        } as MonthlyCashFlow;
      },
    },
    revenueGoals: {
      async findByTenantMonth(tenantId, monthKey) {
        goalReads.push({ tenantId, monthKey });
        if (facts.target === null) {
          return null;
        }
        return { monthKey, targetAmount: new Prisma.Decimal(facts.target), updatedAt: NOW };
      },
    },
    expenseCeilings: {
      async findByTenantMonth(tenantId, monthKey) {
        ceilingReads.push({ tenantId, monthKey });
        if (facts.ceiling === null) {
          return null;
        }
        return { monthKey, ceilingAmount: new Prisma.Decimal(facts.ceiling), updatedAt: NOW };
      },
    },
    receivables: {
      async findActiveByDueDateRange(query) {
        receivableReads.push(query);
        return titles.receivables.filter((row) => within(row, query));
      },
    },
    payables: {
      async findActiveByDueDateRange(query) {
        payableReads.push(query);
        return titles.payables.filter((row) => within(row, query));
      },
    },
  });

  return { engine, cashFlowCalls, goalReads, ceilingReads, receivableReads, payableReads };
}

describe('motor determinístico de gatilhos proativos', () => {
  it('cria 80 e 90, ignora 100, inativo e outro tenant, e deduplica a segunda avaliação', async () => {
    const tenantA = await seedTenant('motor-a');
    const tenantB = await seedTenant('motor-b');
    const revenue80 = await service.createConfiguration(admin, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 80,
    });
    const revenue90 = await service.createConfiguration(admin, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 90,
    });
    const revenue100 = await service.createConfiguration(admin, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 100,
    });
    const expense80 = await service.createConfiguration(admin, tenantA.id, 'EXPENSE_CEILING_PERCENTAGE', {
      percentage: 80,
    });
    const expense90 = await service.createConfiguration(admin, tenantA.id, 'EXPENSE_CEILING_PERCENTAGE', {
      percentage: 90,
    });
    const expense100 = await service.createConfiguration(admin, tenantA.id, 'EXPENSE_CEILING_PERCENTAGE', {
      percentage: 100,
    });
    const exceeded = await service.createConfiguration(admin, tenantA.id, 'EXPENSE_CEILING_EXCEEDED', {});
    const inactive = await service.createConfiguration(admin, tenantA.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 70,
    });
    await service.setConfigurationActive(admin, tenantA.id, inactive.id, false);

    const doubles = engineFor(AT_92);
    const first = await doubles.engine.evaluate({ tenantId: tenantA.id, now: NOW });
    expect(first.evaluated).toBe(7);
    expect(first.created).toBe(4);
    expect(first.reused).toBe(0);
    expect(doubles.cashFlowCalls).toHaveLength(1);
    expect(doubles.cashFlowCalls[0]).toMatchObject({
      tenantId: tenantA.id,
      monthKey: MONTH,
      now: NOW,
    });
    expect(doubles.cashFlowCalls[0]?.costCenterId).toBeUndefined();
    expect(doubles.cashFlowCalls[0]?.categoryFilter).toBeUndefined();
    expect(doubles.cashFlowCalls[0]?.integrationId).toBeUndefined();
    expect(doubles.goalReads).toEqual([{ tenantId: tenantA.id, monthKey: MONTH }]);
    expect(doubles.ceilingReads).toEqual([{ tenantId: tenantA.id, monthKey: MONTH }]);

    const billing = monthlyBilling(flowSlice(AT_92));
    const revenue = calculateRevenueGoalProgress({
      monthKey: MONTH,
      target: new Prisma.Decimal('10000'),
      actual: billing!,
      referenceMonthKey: MONTH,
    });
    const expenses = monthlyExpenses(flowSlice(AT_92));
    const ceiling = calculateExpenseCeilingProgress({
      monthKey: MONTH,
      ceiling: new Prisma.Decimal('10000'),
      monthlyExpenses: expenses,
      referenceMonthKey: MONTH,
    });
    expect(revenue.achievementRate?.equals(92)).toBe(true);
    expect(ceiling.consumedRate?.equals(92)).toBe(true);

    const byConfiguration = new Map(first.occurrences.map((item) => [item.configurationId, item]));
    expect(byConfiguration.get(revenue80.id)?.severity).toBe('INFORMATIVE');
    expect(byConfiguration.get(revenue90.id)?.severity).toBe('INFORMATIVE');
    expect(byConfiguration.get(expense80.id)?.severity).toBe('ATTENTION');
    expect(byConfiguration.get(expense90.id)?.severity).toBe('IMPORTANT');
    expect(byConfiguration.has(revenue100.id)).toBe(false);
    expect(byConfiguration.has(expense100.id)).toBe(false);
    expect(byConfiguration.has(exceeded.id)).toBe(false);
    expect(byConfiguration.has(inactive.id)).toBe(false);

    const revenueEvent = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: byConfiguration.get(revenue80.id)!.eventId },
    });
    const revenueInsight = await prisma.aiInsight.findUniqueOrThrow({
      where: { id: byConfiguration.get(revenue80.id)!.insightId },
    });
    expect(revenueEvent.tenantId).toBe(tenantA.id);
    expect(revenueEvent.severity).toBe('INFORMATIVE');
    expect(revenueEvent.parameterKey).toBe('percentage:80');
    expect(revenueEvent.periodKey).toBe(MONTH);
    expect(revenueEvent.subjectKey).toBe('');
    expect(revenueEvent.sourceMetric).toBe('revenue_goal.value.month');
    expect(revenueEvent.payload).toEqual({
      monthKey: MONTH,
      threshold: 80,
      target: revenue.target!.toString(),
      actual: revenue.actual.toString(),
      rate: revenue.achievementRate!.toString(),
      remaining: revenue.remaining!.toString(),
      exceeded: revenue.exceeded!.toString(),
      status: revenue.status,
    });
    expect(revenueInsight.severity).toBe('INFORMATIVE');
    expect(revenueInsight.content).toBeNull();
    expect(revenueInsight.narrationStatus).toBe('AWAITING_NARRATION');
    expect(revenueInsight.supportingData).toEqual(revenueEvent.payload);

    const expenseEvent = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: byConfiguration.get(expense90.id)!.eventId },
    });
    const expenseInsight = await prisma.aiInsight.findUniqueOrThrow({
      where: { id: byConfiguration.get(expense90.id)!.insightId },
    });
    expect(expenseEvent.severity).toBe('IMPORTANT');
    expect(expenseInsight.severity).toBe('IMPORTANT');
    expect(expenseEvent.sourceMetric).toBe('expense_ceiling.value.month');
    expect(expenseEvent.payload).toEqual({
      monthKey: MONTH,
      threshold: 90,
      ceiling: ceiling.ceiling!.toString(),
      expenses: ceiling.monthlyExpenses!.toString(),
      rate: ceiling.consumedRate!.toString(),
      remaining: ceiling.available!.toString(),
      exceeded: ceiling.exceeded!.toString(),
      status: ceiling.status,
    });

    const attention = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: byConfiguration.get(expense80.id)!.eventId },
    });
    expect(attention.severity).toBe('ATTENTION');
    expect(
      await prisma.aiInsight.findUniqueOrThrow({
        where: { id: byConfiguration.get(expense80.id)!.insightId },
      }),
    ).toMatchObject({ severity: 'ATTENTION', content: null, narrationStatus: 'AWAITING_NARRATION' });

    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenantA.id } })).toBe(4);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenantA.id } })).toBe(4);
    expect(await prisma.analyticalEvent.count({ where: { triggerConfigurationId: inactive.id } })).toBe(
      0,
    );
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenantB.id } })).toBe(0);

    const second = await doubles.engine.evaluate({ tenantId: tenantA.id, now: NOW });
    expect(second.evaluated).toBe(7);
    expect(second.created).toBe(0);
    expect(second.reused).toBe(4);
    expect(second.occurrences.map((item) => item.eventId).sort()).toEqual(
      first.occurrences.map((item) => item.eventId).sort(),
    );
    expect(doubles.cashFlowCalls).toHaveLength(2);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenantA.id } })).toBe(4);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenantA.id } })).toBe(4);

    await service.createConfiguration(admin, tenantB.id, 'REVENUE_GOAL_PERCENTAGE', { percentage: 80 });
    const other = await doubles.engine.evaluate({ tenantId: tenantB.id, now: NOW });
    expect(other.created).toBe(1);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenantB.id } })).toBe(1);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenantA.id } })).toBe(4);
    expect(doubles.cashFlowCalls.at(-1)?.tenantId).toBe(tenantB.id);
  });

  it('no teto exato grava o marco de 100 e não grava estouro', async () => {
    const tenant = await seedTenant('motor-exato');
    const percentage = await service.createConfiguration(admin, tenant.id, 'EXPENSE_CEILING_PERCENTAGE', {
      percentage: 100,
    });
    const exceeded = await service.createConfiguration(admin, tenant.id, 'EXPENSE_CEILING_EXCEEDED', {});
    const facts: PlanningFacts = {
      target: null,
      inflows: null,
      receivables: null,
      ceiling: '10000',
      outflows: '10000',
      payables: '0',
    };
    const { engine } = engineFor(facts);
    const result = await engine.evaluate({ tenantId: tenant.id, now: NOW });
    const progress = calculateExpenseCeilingProgress({
      monthKey: MONTH,
      ceiling: new Prisma.Decimal('10000'),
      monthlyExpenses: monthlyExpenses(flowSlice(facts)),
      referenceMonthKey: MONTH,
    });
    expect(progress.status).toBe('ACHIEVED');
    expect(result.created).toBe(1);
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        configurationId: percentage.id,
        created: true,
        severity: 'IMPORTANT',
      }),
    ]);
    expect(await prisma.analyticalEvent.count({ where: { triggerConfigurationId: exceeded.id } })).toBe(
      0,
    );
    const event = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: result.occurrences[0]!.eventId },
    });
    expect(event.severity).toBe('IMPORTANT');
  });

  it('grava estouro como crítico, sem threshold, e não narra', async () => {
    const tenant = await seedTenant('motor-estouro');
    const exceeded = await service.createConfiguration(admin, tenant.id, 'EXPENSE_CEILING_EXCEEDED', {});
    const facts: PlanningFacts = {
      target: null,
      inflows: null,
      receivables: null,
      ceiling: '10000',
      outflows: '10000',
      payables: '1000',
    };
    const { engine } = engineFor(facts);
    const result = await engine.evaluate({ tenantId: tenant.id, now: NOW });
    const progress = calculateExpenseCeilingProgress({
      monthKey: MONTH,
      ceiling: new Prisma.Decimal('10000'),
      monthlyExpenses: monthlyExpenses(flowSlice(facts)),
      referenceMonthKey: MONTH,
    });
    expect(progress.status).toBe('EXCEEDED');
    expect(result.occurrences).toEqual([
      expect.objectContaining({ configurationId: exceeded.id, created: true, severity: 'CRITICAL' }),
    ]);
    const event = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: result.occurrences[0]!.eventId },
    });
    const insight = await prisma.aiInsight.findUniqueOrThrow({
      where: { id: result.occurrences[0]!.insightId },
    });
    expect(event.severity).toBe('CRITICAL');
    expect(event.sourceMetric).toBe('expense_ceiling.value.month');
    expect(event.payload).toEqual({
      monthKey: MONTH,
      ceiling: progress.ceiling!.toString(),
      expenses: progress.monthlyExpenses!.toString(),
      rate: progress.consumedRate!.toString(),
      exceeded: progress.exceeded!.toString(),
      status: 'EXCEEDED',
    });
    expect(event.payload).not.toHaveProperty('threshold');
    expect(insight.severity).toBe('CRITICAL');
    expect(insight.content).toBeNull();
    expect(insight.narrationStatus).toBe('AWAITING_NARRATION');
  });

  it('não dispara sem meta nem com faturamento indisponível', async () => {
    const withoutGoal = await seedTenant('motor-sem-meta');
    await service.createConfiguration(admin, withoutGoal.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 80,
    });
    const missing = engineFor({ ...AT_92, target: null });
    const noGoal = await missing.engine.evaluate({ tenantId: withoutGoal.id, now: NOW });
    expect(noGoal.created).toBe(0);
    expect(noGoal.occurrences).toEqual([]);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: withoutGoal.id } })).toBe(0);

    const unavailable = await seedTenant('motor-sem-caixa');
    await service.createConfiguration(admin, unavailable.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 80,
    });
    const blocked = engineFor({ ...AT_92, inflows: null });
    const noBilling = await blocked.engine.evaluate({ tenantId: unavailable.id, now: NOW });
    expect(noBilling.evaluated).toBe(1);
    expect(noBilling.created).toBe(0);
    expect(blocked.cashFlowCalls).toHaveLength(1);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: unavailable.id } })).toBe(0);
  });

  it('preserva a parameterKey do evento antigo quando o percentual muda', async () => {
    const tenant = await seedTenant('motor-edicao');
    const configuration = await service.createConfiguration(admin, tenant.id, 'REVENUE_GOAL_PERCENTAGE', {
      percentage: 80,
    });
    const { engine } = engineFor(AT_92);
    const first = await engine.evaluate({ tenantId: tenant.id, now: NOW });
    expect(first.created).toBe(1);
    const historical = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: first.occurrences[0]!.eventId },
    });
    expect(historical.parameterKey).toBe('percentage:80');

    await service.updateConfiguration(admin, tenant.id, configuration.id, { percentage: 85 });
    const second = await engine.evaluate({ tenantId: tenant.id, now: NOW });
    expect(second.created).toBe(1);
    expect(second.reused).toBe(0);
    expect(
      (await prisma.analyticalEvent.findUniqueOrThrow({ where: { id: historical.id } })).parameterKey,
    ).toBe('percentage:80');
    const fresh = await prisma.analyticalEvent.findUniqueOrThrow({
      where: { id: second.occurrences[0]!.eventId },
    });
    expect(fresh.parameterKey).toBe('percentage:85');
    expect(fresh.id).not.toBe(historical.id);
  });

  it('não colide títulos nem kinds e ignora fora da janela, abaixo do mínimo e unpaid zero', async () => {
    const tenant = await seedTenant('motor-titulo');
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
    const payables = [
      titleRecord({ id: 'bad', externalId: 'id invalido', dueDate: '2026-10-16', unpaid: '9000' }),
      titleRecord({ id: 'zero', externalId: 'titulo-pago', dueDate: '2026-10-16', unpaid: '0' }),
      titleRecord({ id: 'baixo', externalId: 'titulo-baixo', dueDate: '2026-10-16', unpaid: '4999.99' }),
      titleRecord({ id: 'igual', externalId: 'titulo-a', dueDate: '2026-10-16', unpaid: '5000' }),
      titleRecord({ id: 'hoje', externalId: 'titulo-hoje', dueDate: '2026-10-15', unpaid: '6000' }),
      titleRecord({ id: 'meio', externalId: 'titulo-b', dueDate: '2026-10-17', unpaid: '8000' }),
      titleRecord({ id: 'limite', externalId: 'titulo-limite', dueDate: '2026-10-18', unpaid: '6000' }),
      titleRecord({ id: 'fora', externalId: 'titulo-fora', dueDate: '2026-10-19', unpaid: '9000' }),
      titleRecord({ id: 'novembro', externalId: 'titulo-nov', dueDate: '2026-11-01', unpaid: '9000' }),
    ];
    const receivables = [
      titleRecord({ id: 'rec-a', externalId: 'titulo-a', dueDate: '2026-10-16', unpaid: '6000' }),
      titleRecord({ id: 'rec-1', externalId: 'receber-1', dueDate: '2026-10-16', unpaid: '7000' }),
    ];
    const doubles = engineFor(
      { target: null, inflows: null, receivables: null, ceiling: null, outflows: null, payables: null },
      { payables, receivables },
    );
    const first = await doubles.engine.evaluate({ tenantId: tenant.id, now: NOW });
    expect(doubles.cashFlowCalls).toHaveLength(0);
    expect(doubles.goalReads).toHaveLength(0);
    expect(doubles.ceilingReads).toHaveLength(0);
    expect(doubles.payableReads).toEqual([
      {
        tenantId: tenant.id,
        from: new Date('2026-10-15T00:00:00.000Z'),
        to: new Date('2026-10-18T00:00:00.000Z'),
      },
    ]);
    expect(doubles.receivableReads).toEqual(doubles.payableReads);
    expect(first.evaluated).toBe(2);
    expect(first.created).toBe(6);
    expect(first.occurrences.every((item) => item.severity === 'ATTENTION')).toBe(true);

    const events = await prisma.analyticalEvent.findMany({ where: { tenantId: tenant.id } });
    expect(events.map((event) => event.subjectKey).sort()).toEqual(
      [
        'PAYABLE:titulo-a',
        'PAYABLE:titulo-b',
        'PAYABLE:titulo-hoje',
        'PAYABLE:titulo-limite',
        'RECEIVABLE:receber-1',
        'RECEIVABLE:titulo-a',
      ].sort(),
    );
    expect(new Set(events.map((event) => event.id)).size).toBe(6);
    expect(events.every((event) => event.sourceMetric === 'installment.due_soon')).toBe(true);
    expect(events.every((event) => event.severity === 'ATTENTION')).toBe(true);

    const equal = events.find((event) => event.subjectKey === 'PAYABLE:titulo-a');
    expect(equal?.triggerConfigurationId).toBe(payable.id);
    expect(equal?.periodKey).toBe('2026-10-16');
    expect(equal?.payload).toEqual({
      titleKind: 'PAYABLE',
      externalId: 'titulo-a',
      dueDate: '2026-10-16',
      unpaid: '5000',
      minimumAmount: '5000.0000',
      daysAhead: 3,
      status: 'OPEN',
      description: 'segredo-descricao',
    });
    expect(JSON.stringify(equal?.payload)).not.toContain('pessoa-x');
    expect(JSON.stringify(equal?.payload)).not.toContain('categoria-x');

    const sameId = events.find((event) => event.subjectKey === 'RECEIVABLE:titulo-a');
    expect(sameId?.triggerConfigurationId).toBe(receivable.id);
    expect(sameId?.id).not.toBe(equal?.id);

    const insight = await prisma.aiInsight.findFirstOrThrow({
      where: { analyticalEventId: equal!.id },
    });
    expect(insight.content).toBeNull();
    expect(insight.narrationStatus).toBe('AWAITING_NARRATION');
    expect(insight.severity).toBe('ATTENTION');

    const second = await doubles.engine.evaluate({ tenantId: tenant.id, now: NOW });
    expect(second.created).toBe(0);
    expect(second.reused).toBe(6);
    expect(await prisma.analyticalEvent.count({ where: { tenantId: tenant.id } })).toBe(6);
    expect(await prisma.aiInsight.count({ where: { tenantId: tenant.id } })).toBe(6);
  });
});
