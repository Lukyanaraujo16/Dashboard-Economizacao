import { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import {
  civilMonthKey,
  isCivilDateInInclusiveRange,
  listInclusiveCivilMonthKeys,
} from './civil-calendar.js';
import type { CashFlowForecast, ForecastBucket } from './types.js';

export const CASH_FLOW_FORECAST_HORIZON_DAYS = 90;

const ZERO = new Prisma.Decimal(0);

type MutableBucket = {
  inflows: Prisma.Decimal;
  outflows: Prisma.Decimal;
};

/**
 * Agrega unpaid de AR/AP já filtrados pelo read model.
 * Só soma dueDate em [from, to] (inclusivo). net é do bucket, não acumulado.
 */
export function calculateCashFlowForecast(
  receivables: readonly Pick<FinancialInstallmentReadRecord, 'dueDate' | 'unpaid'>[],
  payables: readonly Pick<FinancialInstallmentReadRecord, 'dueDate' | 'unpaid'>[],
  from: Date,
  to: Date,
): Omit<CashFlowForecast, 'tenantId' | 'today'> {
  const keys = listInclusiveCivilMonthKeys(from, to);
  const buckets = new Map<string, MutableBucket>(
    keys.map((key) => [key, { inflows: ZERO, outflows: ZERO }]),
  );
  for (const record of receivables) {
    addToBucket(buckets, record, from, to, 'inflows');
  }
  for (const record of payables) {
    addToBucket(buckets, record, from, to, 'outflows');
  }
  return {
    horizonDays: CASH_FLOW_FORECAST_HORIZON_DAYS,
    from,
    to,
    buckets: keys.map((key) => toBucket(key, buckets.get(key)!)),
  };
}

function addToBucket(
  buckets: Map<string, MutableBucket>,
  record: Pick<FinancialInstallmentReadRecord, 'dueDate' | 'unpaid'>,
  from: Date,
  to: Date,
  field: 'inflows' | 'outflows',
): void {
  if (!isCivilDateInInclusiveRange(record.dueDate, from, to)) {
    return;
  }
  const bucket = buckets.get(civilMonthKey(record.dueDate));
  if (!bucket) {
    return;
  }
  bucket[field] = bucket[field].plus(record.unpaid);
}

function toBucket(key: string, bucket: MutableBucket): ForecastBucket {
  return {
    key,
    inflows: bucket.inflows,
    outflows: bucket.outflows,
    net: bucket.inflows.minus(bucket.outflows),
  };
}
