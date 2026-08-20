import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../lib/format-money-brl';
import type { DashboardMonthPhase } from '../../lib/dashboard-month';
import type { DashboardMonthlyExpenseResponse } from '../../services/dashboard/monthly-expenses.types';
import type { DashboardMonthlyRevenueResponse } from '../../services/dashboard/monthly-revenue.types';
import { isExpenseCompositionEmpty } from './dashboard-expense-composition-view';
import { decimalAbsScaled } from './dashboard-forecast-view';
import { isMonthlyRevenueEmpty } from './dashboard-monthly-revenue-view';
import { subtractDecimalStrings } from './v2/chart-math';

export type MonthlyContextKpiView = {
  readonly id: string;
  readonly title: string;
  readonly state: 'ready' | 'empty';
  readonly value?: string;
  readonly meta: string;
  readonly emptyMessage?: string;
};

export function isMonthlyExpenseEmpty(data: DashboardMonthlyExpenseResponse): boolean {
  return isExpenseCompositionEmpty(data.payables.items, data.payables.total);
}

function competenceMeta(phase: DashboardMonthPhase, future: string, other: string): string {
  return phase === 'future' ? future : other;
}

export function toMonthlyReceivableKpi(
  data: DashboardMonthlyRevenueResponse,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  if (isMonthlyRevenueEmpty(data)) {
    return {
      id: 'receivables-month',
      title: 'A receber',
      state: 'empty',
      meta: competenceMeta(phase, 'Sem receitas previstas', 'Sem saldo na competência'),
      emptyMessage: competenceMeta(phase, 'Sem receitas previstas', 'Sem saldo na competência'),
    };
  }
  return {
    id: 'receivables-month',
    title: 'A receber',
    state: 'ready',
    value: formatMoneyBrl(data.receivables.outstanding),
    meta: competenceMeta(phase, 'Já lançado na competência', 'Saldo da competência'),
  };
}

export function toMonthlyReceivedKpi(
  data: DashboardMonthlyRevenueResponse,
): MonthlyContextKpiView {
  if (isMonthlyRevenueEmpty(data)) {
    return {
      id: 'received-month',
      title: 'Já recebido',
      state: 'empty',
      meta: 'Sem títulos na competência',
      emptyMessage: 'Sem títulos na competência',
    };
  }
  return {
    id: 'received-month',
    title: 'Já recebido',
    state: 'ready',
    value: formatMoneyBrl(data.receivables.received),
    meta: 'Baixas registradas nos títulos da competência',
  };
}

export function toMonthlyPayableKpi(
  data: DashboardMonthlyExpenseResponse,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  if (isMonthlyExpenseEmpty(data)) {
    return {
      id: 'payables-month',
      title: 'A pagar',
      state: 'empty',
      meta: competenceMeta(phase, 'Sem despesas previstas', 'Sem saldo na competência'),
      emptyMessage: competenceMeta(phase, 'Sem despesas previstas', 'Sem saldo na competência'),
    };
  }
  return {
    id: 'payables-month',
    title: 'A pagar',
    state: 'ready',
    value: formatMoneyBrl(data.payables.outstanding),
    meta: competenceMeta(phase, 'Já lançado na competência', 'Saldo da competência'),
  };
}

export function toMonthlyExpenseTotalKpi(
  data: DashboardMonthlyExpenseResponse,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  if (isMonthlyExpenseEmpty(data)) {
    return {
      id: 'expenses-month',
      title: 'Despesas',
      state: 'empty',
      meta: competenceMeta(phase, 'Sem despesas previstas', 'Sem despesas na competência'),
      emptyMessage: competenceMeta(phase, 'Sem despesas previstas', 'Sem despesas na competência'),
    };
  }
  return {
    id: 'expenses-month',
    title: 'Despesas',
    state: 'ready',
    value: formatMoneyBrl(data.payables.total),
    meta: competenceMeta(phase, 'Já lançado na competência', 'Gerado na competência'),
  };
}

/**
 * Resultado gerencial = total de receitas − total de despesas, ambos por competência.
 * Diferença de competência; não é caixa nem saldo bancário.
 */
export function toManagerialResultKpi(
  revenue: DashboardMonthlyRevenueResponse,
  expense: DashboardMonthlyExpenseResponse,
): MonthlyContextKpiView {
  if (isMonthlyRevenueEmpty(revenue) && isMonthlyExpenseEmpty(expense)) {
    return {
      id: 'managerial-result-month',
      title: 'Resultado gerencial',
      state: 'empty',
      meta: 'Sem receitas ou despesas na competência',
      emptyMessage: 'Sem receitas ou despesas na competência',
    };
  }
  return {
    id: 'managerial-result-month',
    title: 'Resultado gerencial',
    state: 'ready',
    value: formatMoneyBrl(
      subtractDecimalStrings(revenue.receivables.total, expense.payables.total),
    ),
    meta: 'Competência (receitas − despesas)',
  };
}

export function toMonthlyOverdueKpi(
  data: DashboardMonthlyRevenueResponse,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  if (isMonthlyRevenueEmpty(data)) {
    return {
      id: 'receivables-overdue-month',
      title: 'Recebíveis vencidos',
      state: 'empty',
      meta: 'Sem títulos na competência',
      emptyMessage: 'Sem títulos na competência',
    };
  }
  return {
    id: 'receivables-overdue-month',
    title: 'Recebíveis vencidos',
    state: 'ready',
    value: formatMoneyBrl(data.receivables.overdue),
    meta:
      phase === 'future'
        ? 'Títulos da competência ainda não venceram'
        : 'Vencidos desta competência',
  };
}

export function toMonthlyDelinquencyKpi(
  data: DashboardMonthlyRevenueResponse,
): MonthlyContextKpiView {
  if (isMonthlyRevenueEmpty(data)) {
    return {
      id: 'delinquency-month',
      title: 'Inadimplência',
      state: 'empty',
      meta: 'Sem títulos na competência',
      emptyMessage: 'Sem títulos na competência',
    };
  }
  if (isDecimalZero(data.receivables.outstanding)) {
    return {
      id: 'delinquency-month',
      title: 'Inadimplência',
      state: 'empty',
      meta: 'Sem valores em aberto na competência.',
      emptyMessage: 'Sem valores em aberto na competência.',
    };
  }
  return {
    id: 'delinquency-month',
    title: 'Inadimplência',
    state: 'ready',
    value: formatDelinquencyRate(
      monthlyDelinquencyRate(data.receivables.overdue, data.receivables.outstanding),
    ),
    meta: `${formatMoneyBrl(data.receivables.overdue)} vencido de ${formatMoneyBrl(data.receivables.outstanding)} em aberto na competência`,
  };
}

/** Razão parte/total × 100 com 1 casa, mesmo contrato visual de formatDelinquencyRate. */
function ratePerHundred(part: string, total: string): string {
  const den = decimalAbsScaled(total);
  if (den === 0n) {
    return '0';
  }
  const tenths = (decimalAbsScaled(part) * 1000n) / den;
  return `${tenths / 10n}.${(tenths % 10n).toString()}`;
}

/** Taxa × 100 com 1 casa, mesmo contrato visual de formatDelinquencyRate. */
export function monthlyDelinquencyRate(overdue: string, outstanding: string): string {
  return ratePerHundred(overdue, outstanding);
}

/** Participação da parte no total da competência; null quando não há total. */
export function competenceSharePercent(part: string, total: string): string | null {
  if (decimalAbsScaled(total) === 0n) {
    return null;
  }
  return ratePerHundred(part, total);
}
