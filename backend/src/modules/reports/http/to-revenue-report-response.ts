import { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlow } from '../../analytics/domain/types.js';
import { serializeCivilDate, serializeDecimal } from '../../dashboard/http/to-dashboard-overview-response.js';
import { aggregateCashRevenueReport } from '../domain/aggregate-cash-revenue-report.js';
import type { RevenueReportResponse } from '../domain/types.js';

const ZERO = new Prisma.Decimal(0);

/**
 * Serializa relatório de entradas a partir do MonthlyCashFlow (CASH-6).
 * Shape HTTP preservado; semântica = caixa (não competência).
 *
 * receivables.total = faturamento (realized + expected)
 * receivables.received = entradas realizadas
 * receivables.outstanding = a receber no prazo
 * receivables.overdue = vencido ofMonth
 * items = composição D8 do realizado
 */
export function toRevenueReportResponse(
  fromKey: string,
  toKey: string,
  months: readonly MonthlyCashFlow[],
): RevenueReportResponse {
  const first = months[0];
  if (first === undefined) {
    throw new Error('relatório de receita exige ao menos um mês.');
  }
  const aggregated = aggregateCashRevenueReport(months);
  return {
    today: serializeCivilDate(first.today),
    from: fromKey,
    to: toKey,
    ...(aggregated.costCenterCashSplit ? {} : { costCenterCashSplit: false as const }),
    receivables: {
      total: serializeNullableDecimal(aggregated.total),
      received: serializeNullableDecimal(aggregated.received),
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
        received: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
    },
    months: months.map((month) => ({
      monthKey: month.monthKey,
      receivables: serializeMonthReceivables(month),
    })),
  };
}

function serializeMonthReceivables(
  month: MonthlyCashFlow,
): RevenueReportResponse['months'][number]['receivables'] {
  const billing = monthlyBilling(month);
  const composition = month.realizedByCategory.inflows;
  const split = month.costCenterCashSplit;
  const expectedByDay = new Map(
    month.daily.expected.map((point) => [point.date.getTime(), point.receivables] as const),
  );
  return {
    total: serializeNullableDecimal(billing),
    received: serializeNullableDecimal(month.realized.inflows),
    outstanding: serializeNullableDecimal(month.expected.receivables),
    overdue: serializeNullableDecimal(month.overdue.ofMonth.receivables),
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
      received: split ? serializeDecimal(item.amount) : null,
      outstanding: split ? serializeDecimal(ZERO) : null,
      percentage: serializeDecimal(item.percentage),
    })),
    daily: month.daily.realized.map((point) => ({
      date: serializeCivilDate(point.date),
      amount: serializeNullableDecimal(point.inflows) ?? '0',
      received: serializeNullableDecimal(point.inflows),
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
