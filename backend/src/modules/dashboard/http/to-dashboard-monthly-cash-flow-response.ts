import type { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';
import type {
  DashboardCashRealizedCategoryComposition,
  DashboardMonthlyCashFlowResponse,
} from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

function serializeCategoryComposition(
  composition: MonthlyCashFlowRealizedCategoryComposition | null,
): DashboardCashRealizedCategoryComposition | null {
  if (composition === null) {
    return null;
  }
  return {
    total: serializeDecimal(composition.total),
    classified: serializeDecimal(composition.classified),
    uncategorized: serializeDecimal(composition.uncategorized),
    imprecise: serializeDecimal(composition.imprecise),
    coverageRate: serializeNullableDecimal(composition.coverageRate),
    items: composition.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: serializeDecimal(item.amount),
      percentage: serializeDecimal(item.percentage),
    })),
  };
}

export function toDashboardMonthlyCashFlowResponse(
  flow: MonthlyCashFlow,
): DashboardMonthlyCashFlowResponse {
  return {
    today: serializeCivilDate(flow.today),
    monthKey: flow.monthKey,
    from: serializeCivilDate(flow.from),
    to: serializeCivilDate(flow.to),
    costCenterCashSplit: flow.costCenterCashSplit,
    billing: serializeNullableDecimal(monthlyBilling(flow)),
    realized: {
      inflows: serializeNullableDecimal(flow.realized.inflows),
      outflows: serializeNullableDecimal(flow.realized.outflows),
      result: serializeNullableDecimal(flow.realized.result),
    },
    realizedByCategory: {
      inflows: serializeCategoryComposition(flow.realizedByCategory.inflows),
      outflows: serializeCategoryComposition(flow.realizedByCategory.outflows),
    },
    expected: {
      receivables: serializeNullableDecimal(flow.expected.receivables),
      payables: serializeNullableDecimal(flow.expected.payables),
      result: serializeNullableDecimal(flow.expected.result),
    },
    overdue: {
      receivables: serializeNullableDecimal(flow.overdue.receivables),
      payables: serializeNullableDecimal(flow.overdue.payables),
      ofMonth: {
        receivables: serializeNullableDecimal(flow.overdue.ofMonth.receivables),
        payables: serializeNullableDecimal(flow.overdue.ofMonth.payables),
      },
    },
    coverage: serializeNullableDecimal(flow.coverage),
    daily: {
      realized: flow.daily.realized.map((point) => ({
        date: serializeCivilDate(point.date),
        inflows: serializeNullableDecimal(point.inflows),
        outflows: serializeNullableDecimal(point.outflows),
        result: serializeNullableDecimal(point.result),
      })),
      expected: flow.daily.expected.map((point) => ({
        date: serializeCivilDate(point.date),
        receivables: serializeNullableDecimal(point.receivables),
        payables: serializeNullableDecimal(point.payables),
        result: serializeNullableDecimal(point.result),
      })),
    },
  };
}
