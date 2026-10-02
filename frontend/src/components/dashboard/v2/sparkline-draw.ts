/** Duração do desenho do traço. Só apresentação; não entra no dado. */
export const SPARKLINE_DRAW_DURATION_MS = 1100;

const DRAW_EASING = 'cubic-bezier(0.16, 0.84, 0.28, 1)';

export function sparklineDrawDelayMs(presentIndex: number): number {
  return Math.min(presentIndex, 8) * 40;
}

/** Comprimento no viewBox. Null quando a geometria ainda não existe. */
export function readSparklinePathLength(line: SVGGeometryElement): number | null {
  if (typeof line.getTotalLength !== 'function') {
    return null;
  }
  try {
    const length = line.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) {
      return null;
    }
    return length;
  } catch {
    return null;
  }
}

/** Estado inicial do desenho: traço oculto, pronto para correr. */
export function applySparklineDrawStart(line: SVGElement, length: number): void {
  line.style.transition = 'none';
  line.style.strokeDasharray = `${length}`;
  line.style.strokeDashoffset = `${length}`;
}

/** Dispara a transição de entrada. O dash continua até o término. */
export function applySparklineDrawPlay(line: SVGElement, delayMs: number): void {
  line.style.transition = `stroke-dashoffset ${SPARKLINE_DRAW_DURATION_MS}ms ${DRAW_EASING} ${delayMs}ms`;
  line.style.strokeDashoffset = '0';
}

/**
 * Estado permanente: linha inteira, sem dash residual.
 * O traço volta a ser o stroke normal do CSS.
 */
export function clearSparklineDraw(line: SVGElement): void {
  line.style.transition = 'none';
  line.style.removeProperty('stroke-dasharray');
  line.style.removeProperty('stroke-dashoffset');
}

export function isSparklineStrokeTransitionEnd(
  event: Pick<TransitionEvent, 'propertyName' | 'target'>,
  line: EventTarget,
): boolean {
  return event.target === line && event.propertyName === 'stroke-dashoffset';
}
