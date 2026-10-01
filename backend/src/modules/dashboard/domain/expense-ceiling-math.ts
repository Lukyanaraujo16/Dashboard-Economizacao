import { Prisma } from '../../../generated/prisma/client.js';
import {
  parseRevenueGoalTargetAmount,
  revenueGoalMonthPhase,
  type RevenueGoalMonthPhase,
} from './revenue-goal-math.js';

/**
 * Estados do teto mensal de gastos.
 *
 * - atual + abaixo → IN_PROGRESS
 * - passado + abaixo → CONTAINED (não é fracasso; o teto segurou)
 * - igual → ACHIEVED
 * - acima → EXCEEDED (mês atual ou passado)
 * - futuro → PLANNED (não julga consumo)
 * - teto definido e despesas indisponíveis → UNAVAILABLE (não vira zero)
 */
export type ExpenseCeilingStatus =
  | 'NO_TARGET'
  | 'IN_PROGRESS'
  | 'CONTAINED'
  | 'ACHIEVED'
  | 'EXCEEDED'
  | 'PLANNED'
  | 'UNAVAILABLE';

export type ExpenseCeilingProgress = {
  readonly monthKey: string;
  readonly ceiling: Prisma.Decimal | null;
  readonly monthlyExpenses: Prisma.Decimal | null;
  /** Despesas ÷ teto × 100. null sem teto, sem despesas ou em mês futuro. */
  readonly consumedRate: Prisma.Decimal | null;
  readonly available: Prisma.Decimal | null;
  readonly exceeded: Prisma.Decimal | null;
  readonly status: ExpenseCeilingStatus;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Mesmo contrato positivo da meta de faturamento. */
export function parseExpenseCeilingAmount(raw: unknown): Prisma.Decimal | null {
  return parseRevenueGoalTargetAmount(raw);
}

/**
 * Teto × despesas oficiais do mês (`monthlyExpenses`). O teto não é persistido
 * junto do consumo. `referenceMonthKey` = mês civil corrente (America/Sao_Paulo).
 */
export function calculateExpenseCeilingProgress(input: {
  readonly monthKey: string;
  readonly ceiling: Prisma.Decimal | null;
  readonly monthlyExpenses: Prisma.Decimal | null;
  readonly referenceMonthKey: string;
}): ExpenseCeilingProgress {
  const { monthKey, ceiling, monthlyExpenses, referenceMonthKey } = input;

  if (ceiling === null) {
    return {
      monthKey,
      ceiling: null,
      monthlyExpenses,
      consumedRate: null,
      available: null,
      exceeded: null,
      status: 'NO_TARGET',
    };
  }

  if (monthlyExpenses === null) {
    return {
      monthKey,
      ceiling,
      monthlyExpenses: null,
      consumedRate: null,
      available: null,
      exceeded: null,
      status: 'UNAVAILABLE',
    };
  }

  const phase = revenueGoalMonthPhase(monthKey, referenceMonthKey);
  if (phase === 'future') {
    return {
      monthKey,
      ceiling,
      monthlyExpenses,
      consumedRate: null,
      available: null,
      exceeded: null,
      status: 'PLANNED',
    };
  }

  const difference = ceiling.minus(monthlyExpenses);
  const available = difference.greaterThan(ZERO) ? difference : ZERO;
  const surplus = monthlyExpenses.minus(ceiling);
  const exceeded = surplus.greaterThan(ZERO) ? surplus : ZERO;

  return {
    monthKey,
    ceiling,
    monthlyExpenses,
    consumedRate: monthlyExpenses.div(ceiling).times(HUNDRED),
    available,
    exceeded,
    status: resolveStatus(phase, difference),
  };
}

function resolveStatus(
  phase: RevenueGoalMonthPhase,
  difference: Prisma.Decimal,
): ExpenseCeilingStatus {
  if (difference.equals(ZERO)) {
    return 'ACHIEVED';
  }
  if (difference.lessThan(ZERO)) {
    return 'EXCEEDED';
  }
  return phase === 'past' ? 'CONTAINED' : 'IN_PROGRESS';
}
