import { Prisma } from '../../../generated/prisma/client.js';

const ZERO = new Prisma.Decimal(0);
/** Alinhado a Decimal(19,4) / CC1.1 — sem Float. */
const MONEY_EPS = new Prisma.Decimal('0.0001');

export type CostCenterCashSplitKind = 'EXACT' | 'UNAVAILABLE';

export type CostCenterCashSplitAmounts = {
  readonly kind: 'EXACT';
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
};

export type CostCenterCashSplitUnavailable = {
  readonly kind: 'UNAVAILABLE';
};

export type CostCenterCashSplitResult = CostCenterCashSplitAmounts | CostCenterCashSplitUnavailable;

/**
 * Snapshot de competência (paid/unpaid do título), NÃO caixa do mês.
 *
 * Seguro sem rateio na baixa:
 * - allocation ≈ total do título → 100% do centro → received=paid, outstanding=unpaid
 * - multi (amount < total) e paid ≈ total → received=amount, outstanding=0
 * - multi e paid ≈ 0 → received=0, outstanding=amount
 * - multi parcial → UNAVAILABLE (não proporcializar)
 *
 * Ledger L1 não é usado.
 */
export function deriveInstallmentCostCenterCashSplit(input: {
  readonly allocationAmount: Prisma.Decimal;
  readonly installmentTotal: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly dueDate: Date;
  readonly today: Date;
}): CostCenterCashSplitResult {
  const { allocationAmount, installmentTotal, paid, unpaid, dueDate, today } = input;
  const eps = MONEY_EPS;

  if (allocationAmount.isNegative() || installmentTotal.isNegative()) {
    return { kind: 'UNAVAILABLE' };
  }
  if (allocationAmount.isZero()) {
    return { kind: 'EXACT', received: ZERO, outstanding: ZERO, overdue: ZERO };
  }

  const coversFullTitle =
    allocationAmount.minus(installmentTotal).abs().lessThanOrEqualTo(eps);

  if (coversFullTitle) {
    const overdue =
      unpaid.greaterThan(ZERO) && dueDate.getTime() < today.getTime() ? unpaid : ZERO;
    return {
      kind: 'EXACT',
      received: paid,
      outstanding: unpaid,
      overdue,
    };
  }

  if (allocationAmount.greaterThan(installmentTotal.plus(eps))) {
    return { kind: 'UNAVAILABLE' };
  }

  const fullyPaid = unpaid.abs().lessThanOrEqualTo(eps) || paid.minus(installmentTotal).abs().lessThanOrEqualTo(eps);
  const fullyOpen = paid.abs().lessThanOrEqualTo(eps);

  if (fullyPaid) {
    return {
      kind: 'EXACT',
      received: allocationAmount,
      outstanding: ZERO,
      overdue: ZERO,
    };
  }

  if (fullyOpen) {
    const overdue =
      dueDate.getTime() < today.getTime() ? allocationAmount : ZERO;
    return {
      kind: 'EXACT',
      received: ZERO,
      outstanding: allocationAmount,
      overdue,
    };
  }

  return { kind: 'UNAVAILABLE' };
}

export function aggregateCostCenterCashSplits(
  rows: readonly CostCenterCashSplitResult[],
): {
  readonly costCenterCashSplit: boolean;
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly overdue: Prisma.Decimal | null;
} {
  if (rows.length === 0) {
    return {
      costCenterCashSplit: true,
      received: ZERO,
      outstanding: ZERO,
      overdue: ZERO,
    };
  }
  if (rows.some((row) => row.kind === 'UNAVAILABLE')) {
    return {
      costCenterCashSplit: false,
      received: null,
      outstanding: null,
      overdue: null,
    };
  }
  let received = ZERO;
  let outstanding = ZERO;
  let overdue = ZERO;
  for (const row of rows) {
    if (row.kind !== 'EXACT') {
      continue;
    }
    received = received.plus(row.received);
    outstanding = outstanding.plus(row.outstanding);
    overdue = overdue.plus(row.overdue);
  }
  return {
    costCenterCashSplit: true,
    received,
    outstanding,
    overdue,
  };
}
