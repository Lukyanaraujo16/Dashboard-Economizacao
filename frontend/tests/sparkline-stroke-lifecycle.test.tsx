/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sparkline } from '../src/components/dashboard/v2';
import { resetDashboardPresentationForTests } from '../src/components/dashboard/v2/dashboard-presentation';

const SERIES_A = [
  { date: '2026-10-01', amount: '10.00' },
  { date: '2026-10-02', amount: '40.00' },
  { date: '2026-10-03', amount: '15.00' },
];

const SERIES_B = [
  { date: '2026-10-01', amount: '5.00' },
  { date: '2026-10-10', amount: '90.00' },
  { date: '2026-10-31', amount: '20.00' },
];

function polylinePrototype(): object {
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  return Object.getPrototypeOf(probe) as object;
}

function installLength(length: number) {
  Object.defineProperty(polylinePrototype(), 'getTotalLength', {
    configurable: true,
    value: () => length,
  });
}

function installMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

function lineOf(container: HTMLElement): SVGPolylineElement {
  const line = container.querySelector('polyline');
  if (!line) {
    throw new Error('polyline ausente');
  }
  return line;
}

beforeEach(() => {
  resetDashboardPresentationForTests();
  installLength(120);
  installMotion(false);
});

afterEach(() => {
  cleanup();
  resetDashboardPresentationForTests();
  Reflect.deleteProperty(polylinePrototype(), 'getTotalLength');
});

describe('ciclo do traço do Sparkline', () => {
  it('começa com dash e, no transitionend, deixa a linha sem dash', () => {
    const view = render(<Sparkline points={SERIES_A} ariaLabel="Série" />);
    const line = lineOf(view.container);
    expect(line.style.strokeDasharray).toBe('120');
    expect(line.style.transition).toContain('1100ms');

    fireEvent.transitionEnd(line, { propertyName: 'opacity' });
    expect(line.style.strokeDasharray).toBe('120');

    fireEvent.transitionEnd(line, { propertyName: 'stroke-dashoffset' });
    expect(line.style.getPropertyValue('stroke-dasharray')).toBe('');
    expect(line.style.getPropertyValue('stroke-dashoffset')).toBe('');
  });

  it('reduced motion mostra a linha inteira, sem dash', () => {
    installMotion(true);
    const view = render(<Sparkline points={SERIES_A} ariaLabel="Série" />);
    const line = lineOf(view.container);
    expect(line.style.getPropertyValue('stroke-dasharray')).toBe('');
    expect(line.style.getPropertyValue('stroke-dashoffset')).toBe('');
    expect(line.getAttribute('points')?.length).toBeGreaterThan(0);
  });

  it('troca de série não preserva dash depois do desenho', () => {
    const view = render(<Sparkline points={SERIES_A} ariaLabel="Série" />);
    const line = lineOf(view.container);
    const drawn = line.getAttribute('points');
    fireEvent.transitionEnd(line, { propertyName: 'stroke-dashoffset' });

    view.rerender(<Sparkline points={SERIES_B} ariaLabel="Série" />);
    const next = lineOf(view.container);
    expect(next.style.getPropertyValue('stroke-dasharray')).toBe('');
    expect(next.style.getPropertyValue('stroke-dashoffset')).toBe('');
    expect(next.getAttribute('points')).not.toBe(drawn);
  });

  it('unmount remove o listener antes de um transitionend tardio', () => {
    const view = render(<Sparkline points={SERIES_A} ariaLabel="Série" />);
    const line = lineOf(view.container);
    view.unmount();
    expect(() => {
      line.dispatchEvent(new Event('transitionend'));
    }).not.toThrow();
  });
});
