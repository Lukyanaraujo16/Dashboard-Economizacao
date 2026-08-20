import { Prisma } from '../../../generated/prisma/client.js';
import type { UpcomingWindowSummary } from './upcoming.js';

export type MonthEndCashPressureResult = {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly summary: UpcomingWindowSummary;
};

export function buildMonthEndCashPressureResult(input: {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly summary: UpcomingWindowSummary;
}): MonthEndCashPressureResult {
  return input;
}

export function monthEndDifference(summary: UpcomingWindowSummary): Prisma.Decimal {
  const net = summary.net;
  return net.lessThan(new Prisma.Decimal(0)) ? net.negated() : net;
}
