import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { composeAdvisorPlanningAnswer } from '../src/modules/advisor/domain/compose-advisor-planning-answer.js';
import { loadMonthlyPlanningFact } from '../src/modules/advisor/domain/load-monthly-planning-fact.js';
import { resolveAdvisorPlanningIntent } from '../src/modules/advisor/domain/resolve-advisor-planning-intent.js';
import { runAdvisorMonthlyPlanning } from '../src/modules/advisor/domain/run-advisor-monthly-planning.js';
import type { ExpenseCeilingRepository } from '../src/modules/dashboard/repositories/expense-ceiling.repository.js';
import type { RevenueGoalRepository } from '../src/modules/dashboard/repositories/revenue-goal.repository.js';

const NOW = new Date('2026-09-15T15:00:00.000Z');

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(input: {
  readonly monthKey: string;
  readonly inflows: string | null;
  readonly receivables: string | null;
  readonly outflows: string | null;
  readonly payables: string | null;
}): MonthlyCashFlow {
  return {
    monthKey: input.monthKey,
    realized: {
      inflows: input.inflows === null ? null : money(input.inflows),
      outflows: input.outflows === null ? null : money(input.outflows),
      result: null,
    },
    expected: {
      receivables: input.receivables === null ? null : money(input.receivables),
      payables: input.payables === null ? null : money(input.payables),
      result: null,
    },
  } as MonthlyCashFlow;
}

function memoryGoals(rows: Record<string, string>): RevenueGoalRepository {
  return {
    async findByTenantMonth(tenantId, monthKey) {
      const amount = rows[`${tenantId}|${monthKey}`];
      return amount === undefined
        ? null
        : { monthKey, targetAmount: money(amount), updatedAt: NOW };
    },
    async listByTenantMonths() {
      return [];
    },
    async upsert() {
      throw new Error('upsert não usado neste teste');
    },
  };
}

function memoryCeilings(rows: Record<string, string>): ExpenseCeilingRepository {
  return {
    async findByTenantMonth(tenantId, monthKey) {
      const amount = rows[`${tenantId}|${monthKey}`];
      return amount === undefined
        ? null
        : { monthKey, ceilingAmount: money(amount), updatedAt: NOW };
    },
    async upsert() {
      throw new Error('upsert não usado neste teste');
    },
  };
}

describe('planejamento mensal da Lia', () => {
  it('reconhece meta, teto e a combinação, e ignora pergunta genérica', () => {
    expect(resolveAdvisorPlanningIntent('Qual é minha meta de faturamento deste mês?')?.subjects).toEqual([
      'REVENUE_GOAL',
    ]);
    expect(resolveAdvisorPlanningIntent('Qual é meu teto de gastos?')?.subjects).toEqual([
      'EXPENSE_CEILING',
    ]);
    expect(
      resolveAdvisorPlanningIntent('Como estou em relação à meta de faturamento e ao teto de gastos?')
        ?.subjects,
    ).toEqual(['REVENUE_GOAL', 'EXPENSE_CEILING']);
    expect(resolveAdvisorPlanningIntent('Qual foi meu faturamento em agosto?')).toBeNull();
  });

  it('responde falta, percentual, atingimento e excedente da meta com números do sistema', async () => {
    const services = {
      cashFlow: {
        async getMonthlyCashFlow(input: { tenantId: string; monthKey?: string; costCenterId?: string }) {
          expect(input.costCenterId).toBeUndefined();
          expect(input.tenantId).toBe('tenant-a');
          return flow({
            monthKey: input.monthKey ?? '2026-09',
            inflows: '70000',
            receivables: '10000',
            outflows: '0',
            payables: '0',
          });
        },
      },
      revenueGoals: memoryGoals({ 'tenant-a|2026-09': '100000', 'tenant-b|2026-09': '1' }),
      expenseCeilings: memoryCeilings({}),
    };
    const fact = await loadMonthlyPlanningFact({
      tenantId: 'tenant-a',
      monthKey: '2026-09',
      now: NOW,
      subject: 'REVENUE_GOAL',
      services,
    });
    expect(fact.status).toBe('IN_PROGRESS');
    expect(fact.actual).toBe('80000');
    expect(fact.remaining).toBe('20000');
    const answer = composeAdvisorPlanningAnswer({
      content: 'Quanto falta para atingir minha meta?',
      facts: [fact],
    });
    expect(answer).toContain('R$ 100.000,00');
    expect(answer).toContain('R$ 80.000,00');
    expect(answer).toContain('R$ 20.000,00');
    expect(answer).toContain('80,00%');
    expect(answer).not.toContain('R$ 1,00');
  });

  it('responde teto, consumo, disponível, excedente e ausência sem inventar', async () => {
    const services = {
      cashFlow: {
        async getMonthlyCashFlow() {
          return flow({
            monthKey: '2026-09',
            inflows: '0',
            receivables: '0',
            outflows: '90000',
            payables: '15000',
          });
        },
      },
      revenueGoals: memoryGoals({}),
      expenseCeilings: memoryCeilings({ 'tenant-a|2026-09': '100000' }),
    };
    const exceeded = await loadMonthlyPlanningFact({
      tenantId: 'tenant-a',
      monthKey: '2026-09',
      now: NOW,
      subject: 'EXPENSE_CEILING',
      services,
    });
    expect(exceeded.status).toBe('EXCEEDED');
    expect(exceeded.actual).toBe('105000');
    expect(exceeded.exceeded).toBe('5000');
    const answer = composeAdvisorPlanningAnswer({
      content: 'Já ultrapassei meu teto?',
      facts: [exceeded],
    });
    expect(answer).toContain('ultrapassado');
    expect(answer).toContain('R$ 5.000,00');
    expect(answer).toContain('105,00%');

    const absent = await loadMonthlyPlanningFact({
      tenantId: 'tenant-a',
      monthKey: '2026-08',
      now: NOW,
      subject: 'EXPENSE_CEILING',
      services: {
        ...services,
        cashFlow: {
          async getMonthlyCashFlow() {
            return flow({
              monthKey: '2026-08',
              inflows: '0',
              receivables: '0',
              outflows: '10',
              payables: '0',
            });
          },
        },
      },
    });
    expect(absent.status).toBe('NO_TARGET');
    expect(
      composeAdvisorPlanningAnswer({ content: 'Qual é meu teto?', facts: [absent] }),
    ).toContain('Não há teto de gastos definido');
  });

  it('métrica nula não vira zero e outro mês vence o selecionado', async () => {
    const seen: string[] = [];
    const planned = await runAdvisorMonthlyPlanning({
      content: 'Qual é meu teto de gastos em agosto?',
      monthKey: '2026-08',
      runtime: {
        tenantId: 'tenant-a',
        now: NOW,
        planningCashFlow: {
          async getMonthlyCashFlow(input) {
            seen.push(input.monthKey ?? '');
            expect(input.costCenterId).toBeUndefined();
            return flow({
              monthKey: input.monthKey ?? '2026-08',
              inflows: '0',
              receivables: '0',
              outflows: null,
              payables: null,
            });
          },
        },
        revenueGoals: memoryGoals({}),
        expenseCeilings: memoryCeilings({ 'tenant-a|2026-08': '100000' }),
      },
    });
    expect(seen).toEqual(['2026-08']);
    expect(planned?.answer).toContain('indisponíveis');
    expect(planned?.answer).not.toContain('0,00%');
    expect(planned?.answer).not.toContain('R$ 0,00');
  });

  it('pergunta combinada traz os dois fatos e cita consolidação quando há centro de custo', async () => {
    const planned = await runAdvisorMonthlyPlanning({
      content: 'Como estou na meta de faturamento e no teto de gastos do centro de custo?',
      monthKey: '2026-09',
      runtime: {
        tenantId: 'tenant-a',
        now: NOW,
        planningCashFlow: {
          async getMonthlyCashFlow(input) {
            expect(input.costCenterId).toBeUndefined();
            return flow({
              monthKey: '2026-09',
              inflows: '100',
              receivables: '0',
              outflows: '40',
              payables: '10',
            });
          },
        },
        revenueGoals: memoryGoals({ 'tenant-a|2026-09': '200' }),
        expenseCeilings: memoryCeilings({ 'tenant-a|2026-09': '80' }),
      },
    });
    expect(planned?.answer).toContain('meta de faturamento');
    expect(planned?.answer).toContain('teto de gastos');
    expect(planned?.answer).toContain('consolidados da empresa');
    expect(planned?.answer).toContain('R$ 50,00');
  });

  it('tenant B não lê a meta do tenant A', async () => {
    const fact = await loadMonthlyPlanningFact({
      tenantId: 'tenant-b',
      monthKey: '2026-09',
      now: NOW,
      subject: 'REVENUE_GOAL',
      services: {
        cashFlow: {
          async getMonthlyCashFlow() {
            return flow({
              monthKey: '2026-09',
              inflows: '10',
              receivables: '0',
              outflows: '0',
              payables: '0',
            });
          },
        },
        revenueGoals: memoryGoals({ 'tenant-a|2026-09': '999' }),
        expenseCeilings: memoryCeilings({ 'tenant-a|2026-09': '999' }),
      },
    });
    expect(fact.status).toBe('NO_TARGET');
    expect(
      composeAdvisorPlanningAnswer({ content: 'Qual é minha meta?', facts: [fact] }),
    ).toContain('Não há meta de faturamento definida');
  });
});
