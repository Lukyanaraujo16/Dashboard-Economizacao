import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../../lib/format-money-brl';
import type { RevenueGoalStatus } from '../../../services/dashboard/revenue-goal.types';
import { parseAmount, signedSharePercent, subtractDecimalStrings } from './chart-math';

export type GoalProgressView = {
  readonly status: RevenueGoalStatus;
  readonly achievementPercentLabel: string | null;
  readonly remainingLabel: string | null;
  readonly exceededLabel: string | null;
  /** 0–100+ para barra; null quando sem meta. Não inventa valor. */
  readonly progressPct: number | null;
};

const UNCONFIGURED: GoalProgressView = {
  status: 'unconfigured',
  achievementPercentLabel: null,
  remainingLabel: null,
  exceededLabel: null,
  progressPct: null,
};

/**
 * Derivados de meta × realizado (Decimal-safe via chart-math).
 * `targetAmount === null` ou ≤ 0 ⇒ unconfigured — sem NaN/Infinity.
 */
export function presentGoalProgress(
  realizedAmount: string,
  targetAmount: string | null,
): GoalProgressView {
  if (targetAmount === null || isDecimalZero(targetAmount) || parseAmount(targetAmount) <= 0) {
    return UNCONFIGURED;
  }

  const share = signedSharePercent(realizedAmount, targetAmount);
  if (share === null) {
    return UNCONFIGURED;
  }

  const achievementPercentLabel = formatDelinquencyRate(share);
  const progressPct = Math.min(999, Math.max(0, parseAmount(share)));
  const delta = subtractDecimalStrings(targetAmount, realizedAmount);
  const deltaValue = parseAmount(delta);

  if (deltaValue < 0) {
    return {
      status: 'exceeded',
      achievementPercentLabel,
      remainingLabel: null,
      exceededLabel: formatMoneyBrl(subtractDecimalStrings(realizedAmount, targetAmount)),
      progressPct,
    };
  }

  if (isDecimalZero(delta)) {
    return {
      status: 'met',
      achievementPercentLabel,
      remainingLabel: formatMoneyBrl('0'),
      exceededLabel: null,
      progressPct: 100,
    };
  }

  return {
    status: 'behind',
    achievementPercentLabel,
    remainingLabel: formatMoneyBrl(delta),
    exceededLabel: null,
    progressPct,
  };
}
