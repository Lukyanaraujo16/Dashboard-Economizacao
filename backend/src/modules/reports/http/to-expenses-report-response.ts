import { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCashFlow } from '../../analytics/domain/types.js';
import { serializeCivilDate, serializeDecimal } from '../../dashboard/http/to-dashboard-overview-response.js';
import {
  aggregateCashExpensesReport,
  monthlyCashExpenses,
} from '../domain/aggregate-cash-expenses-report.js';
import type { ExpensesReportResponse } from '../domain/types.js';

const ZERO = new Prisma.Decimal(0);

/**
 * Serializa relatório de saídas a partir do MonthlyCashFlow (CASH-6).
 *
 * payables.total = despesas (outflows + a pagar)
 * payables.paid = saídas realizadas
 * payables.outstanding = a pagar no prazo
 * payables.overdue = vencido ofMonth
 * items = composição D8 do realizado
 */
export function toExpensesReportResponse(
  fromKey: string,
  toKey: string,
  months: readonly MonthlyCashFlow[],
): ExpensesReportResponse {
  const first = months[0];
  if (first === undefined) {
    throw new Error('relatório de despesas exige ao menos um mês.');
  }
  const aggregated = aggregateCashExpensesReport(months);
  return {
    today: serializeCivilDate(first.today),
    from: fromKey,
    to: toKey,
    ...(aggregated.costCenterCashSplit ? {} : { costCenterCashSplit: false as const }),
    payables: {
      total: serializeNullableDecimal(aggregated.total),
      paid: serializeNullableDecimal(aggregated.received),
      outstanding: serializeNullableDecimal(aggregated.outstanding),
      overdue: serializeNullableDecimal(aggregated.overdue),
      classified: serializeDecimal(aggregated.classified),
      uncategorized: serializeDecimal(aggregated.uncategorized),
      imprecise: serializeDecimal(aggregated.imprecise),
      coverageRate:
        aggregated.coverageRate === null ? null : serializeDecimal(aggregated.coverageRate),
      items: aggregated.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        paid: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
    },
    months: months.map((month) => ({
      monthKey: month.monthKey,
      payables: serializeMonthPayables(month),
    })),
  };
}

function serializeMonthPayables(
  month: MonthlyCashFlow,
): ExpensesReportResponse['months'][number]['payables'] {
  const expenses = monthlyCashExpenses(month);
  const composition = month.realizedByCategory.outflows;
  const split = month.costCenterCashSplit;
  const expectedByDay = new Map(
    month.daily.expected.map((point) => [point.date.getTime(), point.payables] as const),
  );
  return {
    total: serializeNullableDecimal(expenses),
    paid: serializeNullableDecimal(month.realized.outflows),
    outstanding: serializeNullableDecimal(month.expected.payables),
    overdue: serializeNullableDecimal(month.overdue.ofMonth.payables),
    classified: serializeDecimal(composition?.classified ?? ZERO),
    uncategorized: serializeDecimal(composition?.uncategorized ?? ZERO),
    imprecise: serializeDecimal(composition?.imprecise ?? ZERO),
    coverageRate:
      composition == null || composition.coverageRate === null
        ? null
        : serializeDecimal(composition.coverageRate),
    items: (composition?.items ?? []).map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: serializeDecimal(item.amount),
      paid: split ? serializeDecimal(item.amount) : null,
      outstanding: split ? serializeDecimal(ZERO) : null,
      percentage: serializeDecimal(item.percentage),
    })),
    daily: month.daily.realized.map((point) => ({
      date: serializeCivilDate(point.date),
      amount: serializeNullableDecimal(point.outflows) ?? '0',
      received: serializeNullableDecimal(point.outflows),
      outstanding: serializeNullableDecimal(
        expectedByDay.has(point.date.getTime())
          ? (expectedByDay.get(point.date.getTime()) ?? null)
          : split
            ? ZERO
            : null,
      ),
    })),
  };
}

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}
