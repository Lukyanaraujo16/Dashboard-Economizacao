/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  accumulate,
  CompetenceComparisonChart,
  CompetenceDailyBars,
  MonthlyCompare,
  Sparkline,
  WidgetExpandDialog,
} from '../src/components/dashboard/v2';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function mockPlotRect(element: Element, width: number, height = 108) {
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

function dailySeries(count: number, prefix = '2026-08') {
  return Array.from({ length: count }, (_, index) => ({
    date: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    amount: String((index + 1) * 100),
  }));
}

describe('ChartTooltip nos componentes V2', () => {
  it('CompetenceComparisonChart posiciona tooltip no último ponto sem translateX(-50%)', () => {
    const revenue = dailySeries(31);
    const expense = dailySeries(31);
    render(
      <CompetenceComparisonChart
        revenueDaily={revenue}
        expenseDaily={expense}
        monthKey="2026-08"
      />,
    );
    const plot = screen.getByRole('img', {
      name: /Receitas e despesas acumuladas por competência em ago\/2026/,
    });
    mockPlotRect(plot, 672, 144);
    fireEvent.mouseMove(plot, { clientX: 660, clientY: 40 });
    const tooltip = document.querySelector('[class*="tooltip"]');
    expect(tooltip).toBeTruthy();
    expect((tooltip as HTMLElement).style.transform).not.toBe('translateX(-50%)');
    expect(Number.parseFloat((tooltip as HTMLElement).style.left)).toBeGreaterThan(0);
  });

  it('CompetenceDailyBars posiciona tooltip no primeiro ponto', () => {
    render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(10)}
        expenseDaily={dailySeries(10)}
        monthKey="2026-08"
      />,
    );
    const plot = screen.getByRole('img', {
      name: /Receitas e despesas por dia de competência em ago\/2026/,
    });
    mockPlotRect(plot, 400, 108);
    fireEvent.mouseMove(plot, { clientX: 4, clientY: 40 });
    const tooltip = document.querySelector('[class*="tooltip"]');
    expect(tooltip).toBeTruthy();
    expect((tooltip as HTMLElement).style.transform).not.toBe('translateX(-50%)');
    const left = Number.parseFloat((tooltip as HTMLElement).style.left);
    expect(Number.isFinite(left)).toBe(true);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('Sparkline exibe tooltip visível com data e valor após medição', async () => {
    render(
      <Sparkline
        points={dailySeries(15)}
        interactive
        ariaLabel="Série teste"
        valueCaption="realizado no dia"
      />,
    );
    const plot = screen.getByRole('img', { name: 'Série teste' });
    mockPlotRect(plot, 320, 40);
    await act(async () => {
      fireEvent.mouseMove(plot, { clientX: 160, clientY: 20 });
    });

    await waitFor(() => {
      const tooltip = document.querySelector('[class*="tooltip"]') as HTMLElement | null;
      expect(tooltip).toBeTruthy();
      expect(tooltip!.style.visibility).toBe('visible');
      expect(tooltip!.textContent).toMatch(/08\/08/);
      expect(tooltip!.textContent).toMatch(/R\$/);
      expect(tooltip!.textContent).toMatch(/realizado no dia/);
      expect(tooltip!.style.transform).toBe('none');
    });
  });

  it('Sparkline mantém tooltip visível no extremo direito', async () => {
    render(
      <Sparkline points={dailySeries(31)} interactive ariaLabel="Série teste" />,
    );
    const plot = screen.getByRole('img', { name: 'Série teste' });
    mockPlotRect(plot, 320, 40);
    await act(async () => {
      fireEvent.mouseMove(plot, { clientX: 319, clientY: 20 });
    });

    await waitFor(() => {
      const tooltip = document.querySelector('[class*="tooltip"]') as HTMLElement | null;
      expect(tooltip).toBeTruthy();
      expect(tooltip!.style.visibility).toBe('visible');
      expect(tooltip!.textContent).toMatch(/31\/08/);
      const left = Number.parseFloat(tooltip!.style.left);
      expect(Number.isFinite(left)).toBe(true);
    });
  });

  it('Sparkline acumulado de saídas usa ChartTooltip e não clipa no último ponto', async () => {
    const daily = [
      { date: '2026-08-01', amount: '500' },
      { date: '2026-08-02', amount: '0' },
      { date: '2026-08-03', amount: '1000' },
      { date: '2026-08-04', amount: '200' },
    ];
    const cumulative = accumulate(daily);
    expect(cumulative.at(-1)?.amount).toBe('1700.00');

    render(
      <Sparkline
        points={cumulative}
        interactive
        ariaLabel="Saídas realizadas acumuladas por dia de baixa"
        valueCaption="acumulado de caixa"
      />,
    );
    const plot = screen.getByRole('img', {
      name: 'Saídas realizadas acumuladas por dia de baixa',
    });
    mockPlotRect(plot, 320, 40);
    await act(async () => {
      fireEvent.mouseMove(plot, { clientX: 319, clientY: 20 });
    });

    await waitFor(() => {
      const tooltip = document.querySelector('[class*="tooltip"]') as HTMLElement | null;
      expect(tooltip).toBeTruthy();
      expect(tooltip!.style.visibility).toBe('visible');
      expect(tooltip!.textContent).toMatch(/04\/08/);
      expect(tooltip!.textContent).toMatch(/1\.700,00/);
      expect(tooltip!.textContent).toMatch(/acumulado de caixa/);
      expect(tooltip!.style.transform).toBe('none');
      const left = Number.parseFloat(tooltip!.style.left);
      expect(Number.isFinite(left)).toBe(true);
      expect(left).toBeGreaterThanOrEqual(0);
    });
  });

  it('MonthlyCompare mantém tooltip com nova infraestrutura', () => {
    render(
      <MonthlyCompare
        periods={[
          { id: '2026-07', label: 'JUL' },
          { id: '2026-08', label: 'AGO' },
        ]}
        rows={[
          { id: 'billing', label: 'Faturamento', tone: 'revenue', amounts: ['8000', '10000'] },
        ]}
      />,
    );
    const plot = screen.getByRole('img', { name: /Faturamento/ });
    mockPlotRect(plot, 240, 68);
    Object.defineProperty(plot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 240, top: 0, height: 68, right: 240, bottom: 68 }),
    });
    fireEvent.mouseMove(plot, { clientX: 220, clientY: 20 });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).toBeTruthy();
    expect((tip as HTMLElement).style.transform).not.toBe('translateX(-50%)');
  });
});

describe('WidgetExpandDialog + CompetenceComparisonChart', () => {
  it('monta gráfico expandido com tooltip collision-aware', () => {
    render(
      <ThemeProvider>
        <WidgetExpandDialog open title="Entradas × Saídas" onClose={vi.fn()}>
          <CompetenceComparisonChart
            revenueDaily={dailySeries(31)}
            expenseDaily={dailySeries(31)}
            monthKey="2026-08"
            revenueLabel="Entradas"
            expenseLabel="Saídas"
          />
        </WidgetExpandDialog>
      </ThemeProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'Entradas × Saídas' })).toBeTruthy();
    const plot = screen.getByRole('img', {
      name: /Receitas e despesas acumuladas por competência em ago\/2026/,
    });
    mockPlotRect(plot, 640, 144);
    fireEvent.mouseMove(plot, { clientX: 630, clientY: 50 });
    const tooltip = document.querySelector('[class*="tooltip"]');
    expect(tooltip).toBeTruthy();
  });
});
