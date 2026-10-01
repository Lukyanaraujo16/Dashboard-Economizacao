import { Prisma } from '../../../generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey } from '../../analytics/domain/civil-calendar.js';
import { monthlyBilling, monthlyExpenses } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import {
  calculateExpenseCeilingProgress,
  type ExpenseCeilingStatus,
} from '../../dashboard/domain/expense-ceiling-math.js';
import {
  calculateRevenueGoalProgress,
  type RevenueGoalStatus,
} from '../../dashboard/domain/revenue-goal-math.js';
import type { ExpenseCeilingRepository } from '../../dashboard/repositories/expense-ceiling.repository.js';
import type { RevenueGoalRepository } from '../../dashboard/repositories/revenue-goal.repository.js';
import type { AdvisorPlanningSubject } from './resolve-advisor-planning-intent.js';

export const ADVISOR_PLANNING_FACT_KIND = 'MONTHLY_PLANNING';

export type MonthlyPlanningServices = {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly revenueGoals: RevenueGoalRepository;
  readonly expenseCeilings: ExpenseCeilingRepository;
};

function money(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

/**
 * Fato oficial de planejamento do mês, consolidado da empresa.
 * Não aplica centro de custo, categoria nem situation.
 */
export async function loadMonthlyPlanningFact(input: {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly now?: Date;
  readonly subject: AdvisorPlanningSubject;
  readonly services: MonthlyPlanningServices;
}): Promise<Record<string, unknown>> {
  const flow = await input.services.cashFlow.getMonthlyCashFlow({
    tenantId: input.tenantId,
    monthKey: input.monthKey,
    now: input.now,
  });
  const referenceMonthKey = civilMonthKey(civilTodayInSaoPaulo(input.now ?? new Date()));

  if (input.subject === 'REVENUE_GOAL') {
    const row = await input.services.revenueGoals.findByTenantMonth(input.tenantId, flow.monthKey);
    const billing = monthlyBilling(flow);
    if (row === null) {
      return planningFact({
        subject: 'REVENUE_GOAL',
        monthKey: flow.monthKey,
        status: 'NO_TARGET',
        target: null,
        actual: money(billing),
        rate: null,
        remaining: null,
        exceeded: null,
      });
    }
    if (billing === null) {
      return planningFact({
        subject: 'REVENUE_GOAL',
        monthKey: flow.monthKey,
        status: 'UNAVAILABLE',
        target: row.targetAmount.toString(),
        actual: null,
        rate: null,
        remaining: null,
        exceeded: null,
      });
    }
    const progress = calculateRevenueGoalProgress({
      monthKey: flow.monthKey,
      target: row.targetAmount,
      actual: billing,
      referenceMonthKey,
    });
    return planningFact({
      subject: 'REVENUE_GOAL',
      monthKey: progress.monthKey,
      status: progress.status,
      target: money(progress.target),
      actual: progress.actual.toString(),
      rate: money(progress.achievementRate),
      remaining: money(progress.remaining),
      exceeded: money(progress.exceeded),
    });
  }

  const row = await input.services.expenseCeilings.findByTenantMonth(input.tenantId, flow.monthKey);
  const expenses = monthlyExpenses(flow);
  const progress = calculateExpenseCeilingProgress({
    monthKey: flow.monthKey,
    ceiling: row?.ceilingAmount ?? null,
    monthlyExpenses: expenses,
    referenceMonthKey,
  });
  return planningFact({
    subject: 'EXPENSE_CEILING',
    monthKey: progress.monthKey,
    status: progress.status,
    target: money(progress.ceiling),
    actual: money(progress.monthlyExpenses),
    rate: money(progress.consumedRate),
    remaining: money(progress.available),
    exceeded: money(progress.exceeded),
  });
}

function planningFact(input: {
  readonly subject: AdvisorPlanningSubject;
  readonly monthKey: string;
  readonly status: RevenueGoalStatus | ExpenseCeilingStatus | 'UNAVAILABLE';
  readonly target: string | null;
  readonly actual: string | null;
  readonly rate: string | null;
  readonly remaining: string | null;
  readonly exceeded: string | null;
}): Record<string, unknown> {
  return {
    factKind: ADVISOR_PLANNING_FACT_KIND,
    subject: input.subject,
    monthKey: input.monthKey,
    scope: 'COMPANY',
    status: input.status,
    target: input.target,
    actual: input.actual,
    rate: input.rate,
    remaining: input.remaining,
    exceeded: input.exceeded,
  };
}
