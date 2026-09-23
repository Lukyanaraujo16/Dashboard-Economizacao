import { toAreaPath } from './chart-math';
import type { DailyBalanceBandGeometry } from './daily-balance-band-geometry';

/** Fração do slot mensal ocupada pelo trecho horizontal de um único ponto conhecido. */
export const SINGLE_KNOWN_BALANCE_SLOT_RATIO = 0.32;

/**
 * Extensão gráfica do primeiro (e único) saldo mensal conhecido.
 * Não cria monthKey, não inventa valor e não preenche meses anteriores.
 * Com 2+ pontos reais a geometria original é preservada.
 */
export function expandSingleKnownBalanceMark(
  geometry: DailyBalanceBandGeometry,
  slot: number,
): DailyBalanceBandGeometry {
  if (geometry.points.length !== 1) {
    return geometry;
  }
  const point = geometry.points[0]!;
  const half = Math.max(slot * SINGLE_KNOWN_BALANCE_SLOT_RATIO, 1);
  const left = { index: point.index, x: point.x - half, y: point.y };
  const right = { index: point.index, x: point.x + half, y: point.y };
  return {
    ...geometry,
    segments: [`${left.x},${left.y} ${right.x},${right.y}`],
    areas: [toAreaPath([left, right], geometry.zeroY)],
  };
}
