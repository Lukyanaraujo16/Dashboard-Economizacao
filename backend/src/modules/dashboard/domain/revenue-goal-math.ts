import { Prisma } from '../../../generated/prisma/client.js';

/**
 * Estados da meta mensal de faturamento (F2.0.1 — semântica temporal).
 *
 * - atual + abaixo → IN_PROGRESS
 * - passado + abaixo → NOT_ACHIEVED
 * - futuro + com meta → PLANNED (não julga atingimento, mesmo com títulos lançados)
 */
export type RevenueGoalStatus =
  | 'NO_TARGET'
  | 'IN_PROGRESS'
  | 'NOT_ACHIEVED'
  | 'ACHIEVED'
  | 'EXCEEDED'
  | 'PLANNED';

export type RevenueGoalMonthPhase = 'past' | 'current' | 'future';

export type RevenueGoalProgress = {
  readonly monthKey: string;
  readonly target: Prisma.Decimal | null;
  readonly actual: Prisma.Decimal;
  /** Realizado ÷ meta × 100, sem arredondar (mesmo contrato das demais taxas). */
  readonly achievementRate: Prisma.Decimal | null;
  readonly remaining: Prisma.Decimal | null;
  readonly exceeded: Prisma.Decimal | null;
  readonly status: RevenueGoalStatus;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Decimal-string positivo com no máximo 4 casas — contrato de `revenue_goals.target_amount`. */
const TARGET_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

export function compareRevenueGoalMonthKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function revenueGoalMonthPhase(
  monthKey: string,
  referenceMonthKey: string,
): RevenueGoalMonthPhase {
  const cmp = compareRevenueGoalMonthKeys(monthKey, referenceMonthKey);
  if (cmp < 0) {
    return 'past';
  }
  if (cmp > 0) {
    return 'future';
  }
  return 'current';
}

/**
 * Meta × realizado da competência. `actual` nunca é persistido: vem da mesma
 * fórmula de `monthly-revenue` (competência), sem duplicar cálculo.
 * `referenceMonthKey` = competência civil corrente (America/Sao_Paulo).
 */
export function calculateRevenueGoalProgress(input: {
  readonly monthKey: string;
  readonly target: Prisma.Decimal | null;
  readonly actual: Prisma.Decimal;
  readonly referenceMonthKey: string;
}): RevenueGoalProgress {
  const { monthKey, target, actual, referenceMonthKey } = input;

  if (target === null) {
    return {
      monthKey,
      target: null,
      actual,
      achievementRate: null,
      remaining: null,
      exceeded: null,
      status: 'NO_TARGET',
    };
  }

  const difference = target.minus(actual);
  const remaining = difference.greaterThan(ZERO) ? difference : ZERO;
  const surplus = actual.minus(target);
  const exceeded = surplus.greaterThan(ZERO) ? surplus : ZERO;
  const phase = revenueGoalMonthPhase(monthKey, referenceMonthKey);

  return {
    monthKey,
    target,
    actual,
    achievementRate: actual.div(target).times(HUNDRED),
    remaining,
    exceeded,
    status: resolveStatus(phase, difference),
  };
}

function resolveStatus(
  phase: RevenueGoalMonthPhase,
  difference: Prisma.Decimal,
): RevenueGoalStatus {
  if (phase === 'future') {
    return 'PLANNED';
  }
  if (difference.equals(ZERO)) {
    return 'ACHIEVED';
  }
  if (difference.lessThan(ZERO)) {
    return 'EXCEEDED';
  }
  return phase === 'past' ? 'NOT_ACHIEVED' : 'IN_PROGRESS';
}

/**
 * Meta válida para gravação: decimal-string estritamente positivo.
 * `null` sinaliza recusa — a fronteira HTTP converte em 400 e nada é persistido.
 */
export function parseRevenueGoalTargetAmount(raw: unknown): Prisma.Decimal | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!TARGET_PATTERN.test(trimmed)) {
    return null;
  }
  const target = new Prisma.Decimal(trimmed);
  return target.greaterThan(ZERO) ? target : null;
}

/** Competência deslocada em meses no calendário civil (`-1` = mês anterior). */
export function shiftRevenueGoalMonthKey(monthKey: string, offset: number): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new Error('monthKey inválido.');
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}`;
}

/** Últimas `count` competências terminando na selecionada, da mais antiga para a mais recente. */
export function listRevenueGoalHistoryMonthKeys(
  monthKey: string,
  count: number,
): readonly string[] {
  const total = Math.max(1, Math.trunc(count));
  const keys: string[] = [];
  for (let offset = total - 1; offset >= 0; offset -= 1) {
    keys.push(shiftRevenueGoalMonthKey(monthKey, -offset));
  }
  return keys;
}
