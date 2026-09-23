import { Prisma } from '../../../generated/prisma/client.js';
import type { CashExpectedHorizon, CashExpectedHorizonMonthBucket } from './cash-expected-horizon.js';

const ZERO = new Prisma.Decimal(0);

/**
 * Quatro conceitos distintos — não misturar:
 *
 * 1. SALDO REAL OFICIAL — snapshot Conta Azul consolidado (não ledger).
 * 2. EXPECTED — em aberto e ainda no prazo (`dueDate >= today`). Sem vencidos.
 * 3. OVERDUE PENDING — ACTIVE + unpaid > 0 + dueDate < today. Só nesta projeção.
 * 4. PROJECTED BANK BALANCE — oficial + overdue do 1º mês + expected de cada bucket.
 */
export type OfficialBankBalanceBase = {
  readonly date: Date;
  readonly balance: Prisma.Decimal;
  readonly coverage: 'none' | 'partial' | 'available';
};

export type ProjectedBankBalanceUnavailableReason =
  | 'FILTERED'
  | 'NOT_CURRENT_MONTH'
  | 'NO_BASE'
  | 'EXPECTED_UNAVAILABLE';

export type ProjectedBankBalanceMonth = {
  readonly monthKey: string;
  readonly overdueAdjustment: Prisma.Decimal | null;
  readonly expectedReceivables: Prisma.Decimal | null;
  readonly expectedPayables: Prisma.Decimal | null;
  readonly projectedBalance: Prisma.Decimal | null;
};

export type ProjectedBankBalance = {
  readonly available: boolean;
  readonly unavailableReason: ProjectedBankBalanceUnavailableReason | null;
  readonly base: OfficialBankBalanceBase | null;
  readonly months: readonly ProjectedBankBalanceMonth[];
};

export type CalculateProjectedBankBalanceInput = {
  readonly horizon: CashExpectedHorizon;
  /** Vencidos AR ainda unpaid. Não é `expected`. */
  readonly overdueReceivables: Prisma.Decimal;
  /** Vencidos AP ainda unpaid. Não é `expected`. */
  readonly overduePayables: Prisma.Decimal;
  readonly base: OfficialBankBalanceBase | null;
  readonly filtered: boolean;
  readonly anchorIsCurrentMonth: boolean;
};

function unavailable(
  reason: ProjectedBankBalanceUnavailableReason,
  base: OfficialBankBalanceBase | null = null,
): ProjectedBankBalance {
  return {
    available: false,
    unavailableReason: reason,
    base,
    months: [],
  };
}

function emptyBucketMoney(bucket: CashExpectedHorizonMonthBucket): boolean {
  return (
    bucket.expected.receivables === null ||
    bucket.expected.payables === null ||
    bucket.expected.result === null
  );
}

/**
 * Projeção bancária. Não altera `expected`.
 *
 * P[0] = base + overdueAR − overdueAP + expectedRec[0] − expectedPay[0]
 * P[n] = P[n-1] + expectedRec[n] − expectedPay[n]
 *
 * Vencidos entram só no primeiro bucket (ajuste explícito).
 */
export function calculateProjectedBankBalance(
  input: CalculateProjectedBankBalanceInput,
): ProjectedBankBalance {
  if (input.filtered) {
    return unavailable('FILTERED');
  }
  if (!input.anchorIsCurrentMonth) {
    return unavailable('NOT_CURRENT_MONTH');
  }
  if (!input.horizon.costCenterCashSplit || input.horizon.months.some(emptyBucketMoney)) {
    return unavailable('EXPECTED_UNAVAILABLE');
  }
  if (
    input.base === null ||
    input.base.coverage === 'none' ||
    !input.base.balance.isFinite()
  ) {
    return unavailable('NO_BASE');
  }

  const firstOverdueAdjustment = input.overdueReceivables.minus(input.overduePayables);
  let running = input.base.balance;
  const months: ProjectedBankBalanceMonth[] = [];

  for (const [index, bucket] of input.horizon.months.entries()) {
    const expectedReceivables = bucket.expected.receivables ?? ZERO;
    const expectedPayables = bucket.expected.payables ?? ZERO;
    const overdueAdjustment = index === 0 ? firstOverdueAdjustment : ZERO;
    running = running.plus(overdueAdjustment).plus(expectedReceivables).minus(expectedPayables);
    months.push({
      monthKey: bucket.monthKey,
      overdueAdjustment,
      expectedReceivables,
      expectedPayables,
      projectedBalance: running,
    });
  }

  return {
    available: true,
    unavailableReason: null,
    base: input.base,
    months,
  };
}
