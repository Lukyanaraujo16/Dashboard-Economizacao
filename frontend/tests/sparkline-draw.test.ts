/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';

import {
  SPARKLINE_DRAW_DURATION_MS,
  applySparklineDrawPlay,
  applySparklineDrawStart,
  clearSparklineDraw,
  isSparklineStrokeTransitionEnd,
  readSparklinePathLength,
  sparklineDrawDelayMs,
} from '../src/components/dashboard/v2/sparkline-draw';

function polyline(): SVGPolylineElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
}

describe('desenho do traço do Sparkline', () => {
  it('inicia com dash igual ao comprimento e offset ocultando a linha', () => {
    const line = polyline();
    applySparklineDrawStart(line, 120);
    expect(line.style.strokeDasharray).toBe('120');
    expect(line.style.strokeDashoffset).toBe('120');
  });

  it('dispara a transição de 1,1 s sem apagar o dash', () => {
    const line = polyline();
    applySparklineDrawStart(line, 80);
    applySparklineDrawPlay(line, sparklineDrawDelayMs(2));
    expect(line.style.strokeDasharray).toBe('80');
    expect(line.style.strokeDashoffset).toBe('0');
    expect(line.style.transition).toContain(`${SPARKLINE_DRAW_DURATION_MS}ms`);
    expect(line.style.transition).toContain('80ms');
  });

  it('limpa stroke-dasharray e stroke-dashoffset no estado permanente', () => {
    const line = polyline();
    applySparklineDrawStart(line, 80);
    applySparklineDrawPlay(line, 0);
    clearSparklineDraw(line);
    expect(line.style.strokeDasharray).toBe('');
    expect(line.style.strokeDashoffset).toBe('');
    expect(line.style.getPropertyValue('stroke-dasharray')).toBe('');
    expect(line.style.getPropertyValue('stroke-dashoffset')).toBe('');
  });

  it('só encerra o desenho no transitionend do próprio traço', () => {
    const line = polyline();
    const other = polyline();
    expect(
      isSparklineStrokeTransitionEnd({ propertyName: 'stroke-dashoffset', target: line }, line),
    ).toBe(true);
    expect(isSparklineStrokeTransitionEnd({ propertyName: 'opacity', target: line }, line)).toBe(
      false,
    );
    expect(
      isSparklineStrokeTransitionEnd({ propertyName: 'stroke-dashoffset', target: other }, line),
    ).toBe(false);
  });

  it('ignora comprimento ausente ou inválido', () => {
    const line = polyline();
    expect(readSparklinePathLength(line)).toBeNull();
    Object.defineProperty(line, 'getTotalLength', {
      configurable: true,
      value: () => 0,
    });
    expect(readSparklinePathLength(line)).toBeNull();
    Object.defineProperty(line, 'getTotalLength', {
      configurable: true,
      value: () => {
        throw new Error('geometria indisponível');
      },
    });
    expect(readSparklinePathLength(line)).toBeNull();
  });
});
