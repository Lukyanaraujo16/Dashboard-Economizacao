import { parseAmount, toAreaPath } from './chart-math';

export const BALANCE_BAND_WIDTH = 320;
export const BALANCE_BAND_HEIGHT = 44;
export const BALANCE_BAND_PAD = 5;

export type DailyBalanceBandPoint = {
  readonly index: number;
  readonly value: number;
  readonly x: number;
  readonly y: number;
};

export type DailyBalanceBandGeometry = {
  readonly minDomain: number;
  readonly maxDomain: number;
  readonly zeroY: number;
  readonly points: readonly DailyBalanceBandPoint[];
  readonly segments: readonly string[];
  /** Áreas linha→zero, uma por segmento contínuo (não atravessa gap). */
  readonly areas: readonly string[];
};

/**
 * Escala da faixa de saldo diário: o zero financeiro sempre entra no domínio.
 * minDomain = min(0, minSaldo); maxDomain = max(0, maxSaldo).
 * y cresce para baixo (SVG). valor > 0 → y < zeroY.
 */
export function dailyBalanceDomain(values: readonly number[]): {
  readonly minDomain: number;
  readonly maxDomain: number;
} {
  if (values.length === 0) {
    return { minDomain: 0, maxDomain: 0 };
  }
  let minSaldo = values[0]!;
  let maxSaldo = values[0]!;
  for (const value of values) {
    if (value < minSaldo) {
      minSaldo = value;
    }
    if (value > maxSaldo) {
      maxSaldo = value;
    }
  }
  return {
    minDomain: Math.min(0, minSaldo),
    maxDomain: Math.max(0, maxSaldo),
  };
}

export function dailyBalanceValueToY(
  value: number,
  minDomain: number,
  maxDomain: number,
  height: number = BALANCE_BAND_HEIGHT,
  pad: number = BALANCE_BAND_PAD,
): number {
  const usable = Math.max(height - pad * 2, 1);
  const span = maxDomain - minDomain;
  if (span <= 0) {
    return pad + usable / 2;
  }
  return pad + ((maxDomain - value) / span) * usable;
}

function consecutiveRuns(
  points: readonly DailyBalanceBandPoint[],
): readonly (readonly DailyBalanceBandPoint[])[] {
  const runs: DailyBalanceBandPoint[][] = [];
  let run: DailyBalanceBandPoint[] = [];
  const flush = () => {
    if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  };
  for (const point of points) {
    const prev = run[run.length - 1];
    if (prev && point.index !== prev.index + 1) {
      flush();
    }
    run.push(point);
  }
  flush();
  return runs;
}

function polylineSegments(points: readonly DailyBalanceBandPoint[]): readonly string[] {
  return consecutiveRuns(points)
    .filter((run) => run.length >= 2)
    .map((run) => run.map((point) => `${point.x},${point.y}`).join(' '));
}

function areaPaths(points: readonly DailyBalanceBandPoint[], zeroY: number): readonly string[] {
  return consecutiveRuns(points)
    .filter((run) => run.length >= 2)
    .map((run) => toAreaPath(run, zeroY));
}

/** Geometria da faixa de saldo alinhada ao mesmo `dates`/`slot` das barras. */
export function dailyBalanceBandGeometry(
  dates: readonly string[],
  balanceByDate: ReadonlyMap<string, string>,
  slot: number,
  options?: {
    readonly width?: number;
    readonly height?: number;
    readonly pad?: number;
  },
): DailyBalanceBandGeometry | null {
  const height = options?.height ?? BALANCE_BAND_HEIGHT;
  const pad = options?.pad ?? BALANCE_BAND_PAD;
  const values = dates.map((date) => {
    const raw = balanceByDate.get(date);
    return raw === undefined ? null : parseAmount(raw);
  });
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  const { minDomain, maxDomain } = dailyBalanceDomain(present);
  const zeroY = dailyBalanceValueToY(0, minDomain, maxDomain, height, pad);
  const points: DailyBalanceBandPoint[] = [];
  for (let index = 0; index < dates.length; index += 1) {
    const value = values[index];
    if (value === null || value === undefined) {
      continue;
    }
    points.push({
      index,
      value,
      x: index * slot + slot / 2,
      y: dailyBalanceValueToY(value, minDomain, maxDomain, height, pad),
    });
  }
  return {
    minDomain,
    maxDomain,
    zeroY,
    points,
    segments: polylineSegments(points),
    areas: areaPaths(points, zeroY),
  };
}
