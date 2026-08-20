import { Prisma } from '../../../generated/prisma/client.js';
import type { PayableCompositionBucket } from './payable-category-composition.js';
import type { ForecastBucket } from './types.js';
import type { UpcomingWindowSummary } from './upcoming.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Janela fixa da leitura E3. Independente do seletor visual 7/15/30. */
export const EXECUTIVE_INSIGHT_PRESSURE_DAYS = 30;

export type ExecutivePressureDirection = 'payable_exceeds' | 'receivable_exceeds' | 'balanced';

export type ExecutivePressureInsight = {
  readonly nDays: typeof EXECUTIVE_INSIGHT_PRESSURE_DAYS;
  readonly receivable: Prisma.Decimal;
  readonly payable: Prisma.Decimal;
  readonly difference: Prisma.Decimal;
  readonly direction: ExecutivePressureDirection;
};

export type ExecutiveConcentrationInsight = {
  readonly name: string;
  readonly amount: Prisma.Decimal;
  readonly percentage: Prisma.Decimal;
};

export type ExecutivePeakOutflowInsight = {
  readonly monthKey: string;
  readonly amount: Prisma.Decimal;
};

/**
 * Agenda E1 em 30 dias. difference = |receivable − payable|.
 * Não é saldo, déficit nem resultado.
 */
export function buildPressureWindowInsight(
  summary: UpcomingWindowSummary,
): ExecutivePressureInsight {
  const net = summary.net;
  let direction: ExecutivePressureDirection = 'balanced';
  if (net.greaterThan(ZERO)) {
    direction = 'receivable_exceeds';
  } else if (net.lessThan(ZERO)) {
    direction = 'payable_exceeds';
  }
  return {
    nDays: EXECUTIVE_INSIGHT_PRESSURE_DAYS,
    receivable: summary.receivable,
    payable: summary.payable,
    difference: absDecimal(net),
    direction,
  };
}

/**
 * Maior categoria EXPENSE precisa (D8). Percentual sobre o total classificado.
 * Omite Sem categoria, Sem classificação precisa e Outras.
 */
export function buildConcentrationInsight(input: {
  readonly classified: Prisma.Decimal;
  readonly buckets: readonly Pick<PayableCompositionBucket, 'kind' | 'name' | 'amount'>[];
}): ExecutiveConcentrationInsight | null {
  if (!input.classified.greaterThan(ZERO)) {
    return null;
  }
  const named = input.buckets.filter((bucket) => bucket.kind === 'category');
  const top = named[0];
  if (!top || !top.amount.greaterThan(ZERO)) {
    return null;
  }
  return {
    name: top.name,
    amount: top.amount,
    percentage: top.amount.div(input.classified).times(HUNDRED),
  };
}

/**
 * Bucket mensal de maior outflow no horizonte 90d.
 * Empate: permanece o primeiro mês cronológico (chaves YYYY-MM ordenadas).
 * Omite quando não há saída prevista (> 0).
 */
export function buildPeakOutflowInsight(
  buckets: readonly Pick<ForecastBucket, 'key' | 'outflows'>[],
): ExecutivePeakOutflowInsight | null {
  let winner: Pick<ForecastBucket, 'key' | 'outflows'> | null = null;
  for (const bucket of buckets) {
    if (winner === null || bucket.outflows.greaterThan(winner.outflows)) {
      winner = bucket;
    }
  }
  if (winner === null || !winner.outflows.greaterThan(ZERO)) {
    return null;
  }
  return {
    monthKey: winner.key,
    amount: winner.outflows,
  };
}

function absDecimal(value: Prisma.Decimal): Prisma.Decimal {
  return value.lessThan(ZERO) ? ZERO.minus(value) : value;
}
