import {
  formatDelinquencyRate,
  formatMoneyBrl,
  isDecimalZero,
} from '../../../lib/format-money-brl';
import type {
  RevenueGoalSnapshot,
  RevenueGoalStatus,
} from '../../../services/dashboard/revenue-goal.types';
import { parseAmount, signedSharePercent, subtractDecimalStrings } from './chart-math';

/**
 * Estado visual do widget — espelha os status da API em vocabulário de apresentação.
 * `behind` = mês atual abaixo; `missed` = mês passado abaixo; `planned` = futuro.
 */
export type GoalProgressStatus =
  | 'unconfigured'
  | 'behind'
  | 'missed'
  | 'planned'
  | 'met'
  | 'exceeded';

export type GoalProgressView = {
  readonly status: GoalProgressStatus;
  /** Copy humana do status (ex.: "Em andamento"). */
  readonly statusLabel: string | null;
  readonly achievementPercentLabel: string | null;
  readonly remainingLabel: string | null;
  readonly exceededLabel: string | null;
  /** 0–100+ para barra; null quando sem meta. Não inventa valor. */
  readonly progressPct: number | null;
};

const UNCONFIGURED: GoalProgressView = {
  status: 'unconfigured',
  statusLabel: null,
  achievementPercentLabel: null,
  remainingLabel: null,
  exceededLabel: null,
  progressPct: null,
};

const STATUS_BY_API: Record<RevenueGoalStatus, GoalProgressStatus> = {
  NO_TARGET: 'unconfigured',
  IN_PROGRESS: 'behind',
  NOT_ACHIEVED: 'missed',
  ACHIEVED: 'met',
  EXCEEDED: 'exceeded',
  PLANNED: 'planned',
};

const STATUS_LABEL_BY_API: Record<RevenueGoalStatus, string | null> = {
  NO_TARGET: null,
  IN_PROGRESS: 'Em andamento',
  NOT_ACHIEVED: 'Meta não atingida',
  ACHIEVED: 'Meta atingida',
  EXCEEDED: 'Meta superada',
  PLANNED: 'Meta planejada',
};

/** Caption compacta do histórico por competência. */
const HISTORY_CAPTION_BY_API: Record<RevenueGoalStatus, string> = {
  NO_TARGET: '—',
  IN_PROGRESS: 'progresso atual',
  NOT_ACHIEVED: 'abaixo da meta',
  ACHIEVED: '✓ atingida',
  EXCEEDED: 'superada',
  PLANNED: 'planejada',
};

export function goalProgressStatusFromApi(status: RevenueGoalStatus): GoalProgressStatus {
  return STATUS_BY_API[status];
}

export function revenueGoalStatusLabel(status: RevenueGoalStatus): string | null {
  return STATUS_LABEL_BY_API[status];
}

export function revenueGoalHistoryCaption(status: RevenueGoalStatus): string {
  return HISTORY_CAPTION_BY_API[status];
}

/**
 * Derivados de meta × realizado (Decimal-safe via chart-math).
 * Sem fase temporal — só para preview local; a API é a fonte do status.
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
      statusLabel: 'Meta superada',
      achievementPercentLabel,
      remainingLabel: null,
      exceededLabel: formatMoneyBrl(subtractDecimalStrings(realizedAmount, targetAmount)),
      progressPct,
    };
  }

  if (isDecimalZero(delta)) {
    return {
      status: 'met',
      statusLabel: 'Meta atingida',
      achievementPercentLabel,
      remainingLabel: formatMoneyBrl('0'),
      exceededLabel: null,
      progressPct: 100,
    };
  }

  return {
    status: 'behind',
    statusLabel: 'Em andamento',
    achievementPercentLabel,
    remainingLabel: formatMoneyBrl(delta),
    exceededLabel: null,
    progressPct,
  };
}

/**
 * Apresentação a partir do snapshot da API: status, taxa, restante e excedente
 * vêm prontos do backend — o widget só formata, sem recalcular dinheiro.
 * Futuro (PLANNED) não exibe julgamento de "faltam"/"superou".
 */
export function presentApiGoalProgress(snapshot: RevenueGoalSnapshot): GoalProgressView {
  if (snapshot.status === 'NO_TARGET' || snapshot.target === null) {
    return UNCONFIGURED;
  }

  const rate = snapshot.achievementRate;
  const status = goalProgressStatusFromApi(snapshot.status);
  const planned = snapshot.status === 'PLANNED';

  return {
    status,
    statusLabel: revenueGoalStatusLabel(snapshot.status),
    achievementPercentLabel: rate === null ? null : formatDelinquencyRate(rate),
    remainingLabel:
      planned || snapshot.remaining === null || isDecimalZero(snapshot.remaining)
        ? null
        : formatMoneyBrl(snapshot.remaining),
    exceededLabel:
      planned || snapshot.exceeded === null || isDecimalZero(snapshot.exceeded)
        ? null
        : formatMoneyBrl(snapshot.exceeded),
    progressPct: rate === null ? null : Math.min(999, Math.max(0, parseAmount(rate))),
  };
}

const CURRENCY_INPUT_PATTERN = /[^\d.,]/g;
const TARGET_DECIMAL_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/**
 * Entrada monetária digitada → decimal-string aceito pela API.
 * Aceita "180.000,00" e "180000.00"; `null` quando não é uma meta válida (> 0).
 * O valor de domínio permanece string: nenhum `parseFloat` vira fonte da verdade.
 */
export function toRevenueGoalTargetDecimal(raw: string): string | null {
  if (raw.includes('-')) {
    return null;
  }
  const cleaned = raw.replace(CURRENCY_INPUT_PATTERN, '');
  if (cleaned === '') {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let separatorIndex = -1;

  if (lastComma >= 0) {
    separatorIndex = lastComma > lastDot ? lastComma : -1;
  } else if (lastDot >= 0 && cleaned.indexOf('.') === lastDot) {
    const fraction = cleaned.length - lastDot - 1;
    separatorIndex = fraction >= 1 && fraction <= 2 ? lastDot : -1;
  }

  const whole = (separatorIndex >= 0 ? cleaned.slice(0, separatorIndex) : cleaned).replace(
    /[.,]/g,
    '',
  );
  const fraction =
    separatorIndex >= 0 ? cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '') : '';
  const normalized = fraction === '' ? whole : `${whole}.${fraction}`;

  if (!TARGET_DECIMAL_PATTERN.test(normalized) || isDecimalZero(normalized)) {
    return null;
  }
  return normalized;
}
