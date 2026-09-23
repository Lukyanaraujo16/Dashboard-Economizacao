/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CashMonthlyGroupedBars } from '../src/components/dashboard/v2';

afterEach(() => {
  cleanup();
});

function bucketsFor(horizon: 3 | 6 | 12) {
  return Array.from({ length: horizon }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8 + index, 1));
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      monthKey,
      inflows: index === 0 ? '100' : '10',
      outflows: index === 0 ? '40' : '5',
      result: index === 0 ? '60' : '5',
    };
  });
}

function balancesFor(
  horizon: 3 | 6 | 12,
  values: readonly string[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  bucketsFor(horizon).forEach((bucket, index) => {
    map.set(bucket.monthKey, values[index] ?? values[values.length - 1] ?? '0');
  });
  return map;
}

function mockWidth(element: Element, width: number, height = 52) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('Mensal → Previsto — faixa de saldo separada', () => {
  it('1/2/3/4/5 — barras em cima, linha só na faixa inferior, mesmos meses', () => {
    const buckets = bucketsFor(3);
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Previsto 3"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        resultLabel="Resultado previsto"
        balanceLabel="Saldo bancário projetado"
        balanceLayout="band"
        buckets={buckets}
        balanceByMonthKey={balancesFor(3, ['110000', '80000', '50000'])}
      />,
    );
    const legend = screen.getAllByRole('list')[0];
    expect(legend?.textContent).toMatch(/A receber/);
    expect(legend?.textContent).toMatch(/A pagar/);
    expect(legend?.textContent).not.toMatch(/Saldo bancário projetado/);
    expect(screen.getByText('A receber')).toBeTruthy();
    expect(screen.getByText('A pagar')).toBeTruthy();
    expect(screen.getByText('SET/26')).toBeTruthy();
    expect(screen.getByText('OUT/26')).toBeTruthy();
    expect(screen.getByText('NOV/26')).toBeTruthy();

    const plot = screen.getByRole('img', { name: 'Previsto 3' });
    expect(plot.querySelector('[data-monthly-bars-plot] polyline')).toBeNull();
    expect(plot.querySelector('[data-monthly-bars-plot] circle')).toBeNull();
    const band = plot.querySelector('[data-projected-balance-band]');
    expect(band).toBeTruthy();
    expect(band?.textContent).toMatch(/Saldo bancário projetado/);
    const dots = [...(band?.querySelectorAll('circle') ?? [])];
    expect(dots).toHaveLength(3);
    expect(dots.map((dot) => dot.getAttribute('data-month-key'))).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('6/7 — 6 e 12 meses alinham um ponto por bucket', () => {
    const { rerender } = render(
      <CashMonthlyGroupedBars
        ariaLabel="Previsto 6"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        balanceLabel="Saldo bancário projetado"
        balanceLayout="band"
        buckets={bucketsFor(6)}
        balanceByMonthKey={balancesFor(6, ['10', '20', '30', '40', '50', '60'])}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Previsto 6' }).querySelectorAll('[data-projected-balance-band] circle')
        .length,
    ).toBe(6);

    rerender(
      <CashMonthlyGroupedBars
        ariaLabel="Previsto 12"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        balanceLabel="Saldo bancário projetado"
        balanceLayout="band"
        buckets={bucketsFor(12)}
        balanceByMonthKey={balancesFor(12, ['1'])}
      />,
    );
    const plot12 = screen.getByRole('img', { name: 'Previsto 12' });
    expect(plot12.querySelectorAll('[data-projected-balance-band] circle').length).toBe(12);
    expect(plot12.querySelectorAll('[data-monthly-bars-plot] .month, [class*="month"]').length).toBeGreaterThanOrEqual(
      12,
    );
  });

  it('8/9/10 — positivo, zero e negativo permanecem na faixa', () => {
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Sinais"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        balanceLabel="Saldo bancário projetado"
        balanceLayout="band"
        buckets={bucketsFor(3)}
        balanceByMonthKey={balancesFor(3, ['80', '0', '-40'])}
      />,
    );
    const band = screen.getByRole('img', { name: 'Sinais' }).querySelector('[data-projected-balance-band]');
    const dots = [...(band?.querySelectorAll('circle') ?? [])];
    const zeroY = Number(band?.querySelector('line')?.getAttribute('y1'));
    expect(Number(dots[0]?.getAttribute('cy'))).toBeLessThan(zeroY);
    expect(Number(dots[1]?.getAttribute('cy'))).toBeCloseTo(zeroY, 5);
    expect(Number(dots[2]?.getAttribute('cy'))).toBeGreaterThan(zeroY);
  });

  it('11 — tooltip das barras não mistura saldo; tooltip da faixa mostra saldo', () => {
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Tooltips"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        resultLabel="Resultado previsto"
        balanceLabel="Saldo bancário projetado"
        balanceTooltipLabel="Saldo projetado"
        balanceLayout="band"
        balanceBaseNote="Projeção a partir do saldo oficial em 23/09/2026."
        buckets={bucketsFor(3)}
        balanceByMonthKey={balancesFor(3, ['110000', '80000', '50000'])}
      />,
    );
    const plot = screen.getByRole('img', { name: 'Tooltips' });
    const bars = plot.querySelector('[data-monthly-bars-plot]') as HTMLElement;
    const balancePlot = plot.querySelector('[data-projected-balance-band] [class*="balancePlot"]') as HTMLElement;
    mockWidth(plot, 420, 180);
    mockWidth(bars, 420, 100);
    fireEvent.mouseMove(bars, { clientX: 10, clientY: 20 });
    const barsTip = screen.getByRole('tooltip', { hidden: true });
    expect(barsTip.textContent).toMatch(/A receber/);
    expect(barsTip.textContent).toMatch(/Resultado previsto/);
    expect(barsTip.textContent).not.toMatch(/Saldo projetado/);

    mockWidth(balancePlot, 420, 52);
    fireEvent.mouseMove(balancePlot, { clientX: 10, clientY: 10 });
    const balanceTip = screen.getByRole('tooltip', { hidden: true });
    expect(balanceTip.textContent).toMatch(/Saldo projetado/);
    expect(balanceTip.textContent).toMatch(/Projeção a partir do saldo oficial em 23\/09\/2026/);
    expect(balanceTip.textContent).not.toMatch(/A receber/);
  });

  it('12 — sem projection/mapa não cria faixa', () => {
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Sem base"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        resultLabel="Resultado previsto"
        balanceLayout="band"
        buckets={bucketsFor(3)}
      />,
    );
    const plot = screen.getByRole('img', { name: 'Sem base' });
    expect(plot.querySelector('[data-projected-balance-band]')).toBeNull();
    expect(screen.getByText('A receber')).toBeTruthy();
    expect(screen.getByText('SET/26')).toBeTruthy();
  });

  it('1-6 — Mensal Realizado usa faixa "Saldo bancário" alinhada aos 12 meses', () => {
    const realized = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 9 + index, 1));
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        monthKey,
        inflows: '10',
        outflows: '5',
        result: '5',
      };
    });
    const balances = new Map(realized.map((bucket, index) => [bucket.monthKey, String(100 + index)]));
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Realizado 12"
        buckets={realized}
        balanceByMonthKey={balances}
        balanceLayout="band"
        balanceTooltipLabel="Saldo bancário"
        includeResultInTooltip={false}
      />,
    );
    expect(screen.getByText('Entradas')).toBeTruthy();
    expect(screen.getByText('Saídas')).toBeTruthy();
    const legend = screen.getAllByRole('list')[0];
    expect(legend?.textContent).not.toContain('Saldo bancário');

    const plot = screen.getByRole('img', { name: 'Realizado 12' });
    expect(plot.closest('[data-balance-layout="band"]')).toBeTruthy();
    expect(plot.querySelector('[data-monthly-bars-plot] circle')).toBeNull();
    expect(plot.querySelector('[data-monthly-bars-plot] polyline')).toBeNull();
    const band = plot.querySelector('[data-projected-balance-band]');
    expect(band?.textContent).toMatch(/Saldo bancário/);
    expect(band?.textContent).not.toMatch(/projetado/);
    const dots = [...(band?.querySelectorAll('circle') ?? [])];
    expect(dots).toHaveLength(12);
    expect(dots.map((dot) => dot.getAttribute('data-month-key'))).toEqual(
      realized.map((bucket) => bucket.monthKey),
    );

    const balancePlot = band?.querySelector('[class*="balancePlot"]') as HTMLElement;
    mockWidth(plot, 480, 180);
    mockWidth(balancePlot, 480, 52);
    fireEvent.mouseMove(balancePlot, { clientX: 20, clientY: 10 });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.textContent).toMatch(/Saldo bancário/);
    expect(tip.textContent).not.toMatch(/Entradas/);
  });
});
