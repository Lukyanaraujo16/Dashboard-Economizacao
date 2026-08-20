import { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceExpenseResult, MonthlyCompetenceRevenueResult } from './types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export type MonthlyExecutiveInsightId =
  | 'revenue-expense-total'
  | 'revenue-expense-balance'
  | 'top-revenue-category'
  | 'top-expense-category'
  | 'expense-classification-gap';

export type MonthlyExecutiveInsight = {
  readonly id: MonthlyExecutiveInsightId;
  readonly body: string;
};

export type MonthlyExecutiveInsightsResult = {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly insights: readonly MonthlyExecutiveInsight[];
};

type CategoryItem = {
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly name: string;
  readonly amount: Prisma.Decimal;
};

export function buildMonthlyExecutiveInsights(input: {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly revenue: MonthlyCompetenceRevenueResult;
  readonly expense: MonthlyCompetenceExpenseResult;
}): MonthlyExecutiveInsightsResult {
  const insights: MonthlyExecutiveInsight[] = [];
  const monthLabel = formatMonthKeyPtBr(input.monthKey);
  const revenueTotal = input.revenue.total;
  const expenseTotal = input.expense.total;

  if (revenueTotal.greaterThan(ZERO) || expenseTotal.greaterThan(ZERO)) {
    insights.push({
      id: 'revenue-expense-total',
      body: `${monthLabel} gerou ${formatMoneyPtBr(revenueTotal)} em receitas de competência e ${formatMoneyPtBr(expenseTotal)} em despesas de competência.`,
    });

    if (expenseTotal.greaterThan(revenueTotal)) {
      insights.push({
        id: 'revenue-expense-balance',
        body: `As despesas da competência superam as receitas em ${formatMoneyPtBr(expenseTotal.minus(revenueTotal))}.`,
      });
    } else if (revenueTotal.greaterThan(expenseTotal)) {
      insights.push({
        id: 'revenue-expense-balance',
        body: `As receitas da competência superam as despesas em ${formatMoneyPtBr(revenueTotal.minus(expenseTotal))}.`,
      });
    } else {
      insights.push({
        id: 'revenue-expense-balance',
        body: 'Receitas e despesas da competência estão equilibradas.',
      });
    }
  }

  const topRevenue = topNamedCategory(input.revenue.items);
  if (topRevenue !== null && input.revenue.classified.greaterThan(ZERO)) {
    const percentage = topRevenue.amount.div(input.revenue.classified).times(HUNDRED);
    insights.push({
      id: 'top-revenue-category',
      body: `A categoria ${topRevenue.name} representa ${formatPercentPtBr(percentage)} das receitas classificadas do mês.`,
    });
  }

  const topExpense = topNamedCategory(input.expense.items);
  if (topExpense !== null && input.expense.classified.greaterThan(ZERO)) {
    const percentage = topExpense.amount.div(input.expense.classified).times(HUNDRED);
    insights.push({
      id: 'top-expense-category',
      body: `A categoria ${topExpense.name} representa ${formatPercentPtBr(percentage)} das despesas classificadas do mês.`,
    });
  }

  const gapAmount = input.expense.uncategorized.plus(input.expense.imprecise);
  if (gapAmount.greaterThan(ZERO) && expenseTotal.greaterThan(ZERO)) {
    const gapRate = gapAmount.div(expenseTotal).times(HUNDRED);
    insights.push({
      id: 'expense-classification-gap',
      body: `${formatPercentPtBr(gapRate)} das despesas do mês ainda estão sem classificação precisa.`,
    });
  }

  return {
    tenantId: input.tenantId,
    today: input.today,
    monthKey: input.monthKey,
    from: input.from,
    to: input.to,
    insights: insights.slice(0, 4),
  };
}

function topNamedCategory(items: readonly CategoryItem[]): CategoryItem | null {
  const categories = items.filter(
    (item) => item.kind === 'category' && item.amount.greaterThan(ZERO),
  );
  if (categories.length === 0) {
    return null;
  }
  return categories.reduce((best, item) => (item.amount.greaterThan(best.amount) ? item : best));
}

function formatMonthKeyPtBr(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMoneyPtBr(value: Prisma.Decimal): string {
  const negative = value.lessThan(ZERO);
  const abs = negative ? value.negated() : value;
  const fixed = abs.toFixed(2);
  const [wholePart = '0', frac = '00'] = fixed.split('.');
  const grouped = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `R$ ${grouped},${frac}`;
  return negative ? `-${formatted}` : formatted;
}

function formatPercentPtBr(value: Prisma.Decimal): string {
  const tenths = value.times(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const abs = tenths.abs();
  const whole = abs.div(10).toFixed(0);
  const frac = abs.mod(10).toFixed(0);
  const sign = tenths.lessThan(ZERO) ? '-' : '';
  return `${sign}${whole},${frac}%`;
}
