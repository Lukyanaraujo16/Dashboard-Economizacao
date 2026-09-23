import type { Prisma } from '../../../generated/prisma/client.js';
import type { CashExpectedHorizon } from '../../analytics/domain/cash-expected-horizon.js';
import type { ProjectedBankBalance } from '../../analytics/domain/projected-bank-balance.js';
import type { DashboardCashExpectedHorizonResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

function serializeExpectedMoney(money: {
  readonly receivables: Prisma.Decimal | null;
  readonly payables: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
}) {
  return {
    receivables: serializeNullableDecimal(money.receivables),
    payables: serializeNullableDecimal(money.payables),
    result: serializeNullableDecimal(money.result),
  };
}

function serializeProjection(
  projection: ProjectedBankBalance | undefined,
): DashboardCashExpectedHorizonResponse['projection'] {
  if (!projection) {
    return {
      available: false,
      unavailableReason: 'NO_BASE',
      base: null,
      months: [],
    };
  }
  return {
    available: projection.available,
    unavailableReason: projection.unavailableReason,
    base: projection.base
      ? {
          date: serializeCivilDate(projection.base.date),
          balance: serializeDecimal(projection.base.balance),
          coverage: projection.base.coverage,
        }
      : null,
    months: projection.months.map((month) => ({
      monthKey: month.monthKey,
      overdueAdjustment: serializeNullableDecimal(month.overdueAdjustment),
      expectedReceivables: serializeNullableDecimal(month.expectedReceivables),
      expectedPayables: serializeNullableDecimal(month.expectedPayables),
      projectedBalance: serializeNullableDecimal(month.projectedBalance),
    })),
  };
}

export function toDashboardCashExpectedHorizonResponse(
  horizon: CashExpectedHorizon,
): DashboardCashExpectedHorizonResponse {
  return {
    today: serializeCivilDate(horizon.today),
    startMonth: horizon.startMonth,
    endMonth: horizon.endMonth,
    horizon: horizon.horizon,
    costCenterCashSplit: horizon.costCenterCashSplit,
    totals: serializeExpectedMoney(horizon.totals),
    months: horizon.months.map((month) => ({
      monthKey: month.monthKey,
      expected: serializeExpectedMoney(month.expected),
    })),
    projection: serializeProjection(horizon.projection),
  };
}
