/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  accumulate,
  CashMonthlyGroupedBars,
  CompetenceComparisonChart,
  CompetenceDailyBars,
  Sparkline,
  WidgetExpandDialog,
} from '../src/components/dashboard/v2';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function applyRect(element: Element, width: number, height: number, left = 0) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  element.getBoundingClientRect = () =>
    ({
      left,
      top: 0,
      right: left + width,
      bottom: height,
      width,
      height,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function mockPlotRect(element: Element, width: number, height = 108) {
  applyRect(element, width, height);
  const barsPlot = element.querySelector('[data-daily-bars-plot]');
  if (barsPlot) {
    applyRect(barsPlot, width, height);
  }
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

  it('CompetenceDailyBars posiciona tooltip flutuante no primeiro ponto', () => {
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
    const tooltip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tooltip).toBeTruthy();
    expect(tooltip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tooltip.getAttribute('data-vertical-placement')).toBe('above');
    expect(tooltip.style.transform).not.toBe('translateX(-50%)');
    expect(tooltip.style.bottom).toMatch(/calc\(100%/);
    expect(tooltip.style.top).toBe('auto');
    const left = Number.parseFloat(tooltip.style.left);
    expect(Number.isFinite(left)).toBe(true);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('CompetenceDailyBars no expand: floating-top e conteúdo preservados', () => {
    render(
      <ThemeProvider>
        <WidgetExpandDialog open title="Movimentação financeira" onClose={vi.fn()}>
          <CompetenceDailyBars
            revenueDaily={dailySeries(10)}
            expenseDaily={dailySeries(10)}
            monthKey="2026-08"
            revenueLabel="Entradas"
            expenseLabel="Saídas"
          />
        </WidgetExpandDialog>
      </ThemeProvider>,
    );
    const plot = screen.getByRole('img', {
      name: /Receitas e despesas por dia de competência em ago\/2026/,
    });
    mockPlotRect(plot, 640, 108);
    fireEvent.mouseMove(plot, { clientX: 620, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.textContent).toMatch(/Saídas/);
    expect(tip.textContent).toMatch(/R\$/);
    expect(tip.style.bottom).toMatch(/calc\(100%/);
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

  it('CashMonthlyGroupedBars: tooltip flutuante com mês, Entradas, Saídas, Resultado e BRL', () => {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7 - 11 + index, 1));
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const isLast = index === 11;
      return {
        monthKey,
        inflows: isLast ? '888888.88' : '1000.00',
        outflows: isLast ? '111111.11' : '500.00',
        result: isLast ? '777777.77' : '500.00',
      };
    });
    render(
      <CashMonthlyGroupedBars buckets={buckets} ariaLabel="Histórico mensal de caixa" />,
    );
    const plot = screen.getByRole('img', { name: 'Histórico mensal de caixa' });
    expect(plot.getAttribute('data-tooltip-lane')).toBeNull();
    mockPlotRect(plot, 480, 120);

    fireEvent.mouseMove(plot, { clientX: 470, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.getAttribute('data-vertical-placement')).toBe('above');
    expect(tip.textContent).toMatch(/AGO\/26/);
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.textContent).toMatch(/Saídas/);
    expect(tip.textContent).toMatch(/Resultado/);
    expect(tip.textContent).toMatch(/R\$\s*888\.888,88/);
    expect(tip.textContent).toMatch(/R\$\s*111\.111,11/);
    expect(tip.textContent).toMatch(/R\$\s*777\.777,77/);
    expect(tip.style.transform).not.toBe('translateX(-50%)');
    expect(tip.style.bottom).toMatch(/calc\(100%/);
    expect(tip.style.top).toBe('auto');
    const lastLeft = Number.parseFloat(tip.style.left);
    expect(Number.isFinite(lastLeft)).toBe(true);
    expect(lastLeft).toBeGreaterThanOrEqual(0);
    expect(lastLeft + 8).toBeLessThanOrEqual(480);

    fireEvent.mouseMove(plot, { clientX: 4, clientY: 40 });
    const firstTip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(firstTip.textContent).toMatch(/SET\/25/);
    const firstLeft = Number.parseFloat(firstTip.style.left);
    expect(firstLeft).toBeGreaterThanOrEqual(0);
    expect(firstLeft).toBeLessThan(120);

    fireEvent.mouseMove(plot, { clientX: 240, clientY: 40 });
    const midTip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(midTip.textContent).toMatch(/FEV\/26|MAR\/26/);
    const midLeft = Number.parseFloat(midTip.style.left);
    expect(midLeft).toBeGreaterThan(firstLeft);
    expect(midLeft).toBeLessThan(lastLeft);
  });

  it('CashMonthlyGroupedBars: primeiro mês e null → —', () => {
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Mensal null"
        buckets={[
          {
            monthKey: '2025-09',
            inflows: null,
            outflows: null,
            result: null,
          },
          {
            monthKey: '2025-10',
            inflows: '10.00',
            outflows: '5.00',
            result: '5.00',
          },
        ]}
      />,
    );
    const plot = screen.getByRole('img', { name: 'Mensal null' });
    expect(plot.getAttribute('data-tooltip-lane')).toBeNull();
    mockPlotRect(plot, 320, 120);
    fireEvent.mouseMove(plot, { clientX: 4, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.textContent).toMatch(/SET\/25/);
    expect(tip.textContent).toMatch(/—/);
    expect(tip.textContent).not.toMatch(/R\$\s*0,00/);
    expect(tip.style.transform).not.toBe('translateX(-50%)');
    expect(tip.style.bottom).toMatch(/calc\(100%/);
    expect(tip.style.top).toBe('auto');
    const left = Number.parseFloat(tip.style.left);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('CompetenceDailyBars + saldo: tooltip floating-top com Saldo bancário; dia sem saldo → —', () => {
    const balanceByDate = new Map<string, string>([['2026-08-01', '1500.25']]);
    render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
        balanceByDate={balanceByDate}
      />,
    );
    expect(within(screen.getByRole('list')).queryByText('Saldo bancário')).toBeNull();
    expect(screen.getByText('Saldo bancário')).toBeTruthy();
    const plot = screen.getByRole('img');
    mockPlotRect(plot, 400, 108);
    fireEvent.mouseMove(plot, { clientX: 4, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.textContent).toMatch(/Saldo bancário/);
    expect(tip.textContent).toMatch(/R\$\s*1\.500,25/);
    fireEvent.mouseMove(plot, { clientX: 390, clientY: 40 });
    const tipGap = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tipGap.textContent).toMatch(/Saldo bancário/);
    expect(tipGap.textContent).toMatch(/—/);
    expect(tipGap.textContent).not.toMatch(/R\$\s*0,00/);
  });

  it('CashMonthlyGroupedBars + saldo: tooltip inclui Saldo final', () => {
    const balanceByMonthKey = new Map<string, string>([['2026-02', '2500.00']]);
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Mensal saldo"
        buckets={[
          { monthKey: '2026-01', inflows: '10', outflows: '5', result: '5' },
          { monthKey: '2026-02', inflows: '20', outflows: '8', result: '12' },
        ]}
        balanceByMonthKey={balanceByMonthKey}
      />,
    );
    expect(screen.getByText('Saldo bancário')).toBeTruthy();
    const plot = screen.getByRole('img', { name: 'Mensal saldo' });
    mockPlotRect(plot, 400, 120);
    fireEvent.mouseMove(plot, { clientX: 300, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.textContent).toMatch(/Saldo final/);
    expect(tip.textContent).toMatch(/R\$\s*2\.500,00/);
    expect(tip.textContent).toMatch(/Resultado/);
  });

  it('36/37 — linha projetada assinada: tooltip reconcilia e saldo negativo permanece visível', () => {
    const balanceByMonthKey = new Map<string, string>([
      ['2026-09', '110000'],
      ['2026-10', '-20000'],
      ['2026-11', '5000'],
    ]);
    render(
      <CashMonthlyGroupedBars
        ariaLabel="Projeção assinada"
        inflowLabel="A receber"
        outflowLabel="A pagar"
        resultLabel="Resultado previsto"
        balanceLabel="Saldo bancário projetado"
        balanceTooltipLabel="Saldo projetado"
        balanceScale="signed"
        balanceBaseNote="Projeção a partir do saldo oficial em 23/09/2026."
        buckets={[
          { monthKey: '2026-09', inflows: '20000', outflows: '10000', result: '10000' },
          { monthKey: '2026-10', inflows: '10000', outflows: '140000', result: '-130000' },
          { monthKey: '2026-11', inflows: '30000', outflows: '5000', result: '25000' },
        ]}
        balanceByMonthKey={balanceByMonthKey}
      />,
    );
    expect(screen.getByText('Saldo bancário projetado')).toBeTruthy();
    const plot = screen.getByRole('img', { name: 'Projeção assinada' });
    const dots = plot.querySelectorAll('circle');
    expect(dots).toHaveLength(3);
    const octY = Number(dots[1]?.getAttribute('cy'));
    const sepY = Number(dots[0]?.getAttribute('cy'));
    expect(octY).toBeGreaterThan(sepY);
    expect(octY).toBeLessThan(100);
    expect(octY).toBeGreaterThan(0);
    expect(octY).not.toBe(0);

    mockPlotRect(plot, 420, 120);
    fireEvent.mouseMove(plot, { clientX: 210, clientY: 40 });
    const tip = screen.getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.textContent).toMatch(/OUT\/26/);
    expect(tip.textContent).toMatch(/A receber/);
    expect(tip.textContent).toMatch(/A pagar/);
    expect(tip.textContent).toMatch(/Resultado previsto/);
    expect(tip.textContent).toMatch(/Saldo projetado/);
    expect(tip.textContent).toMatch(/-R\$\s*20\.000,00|-R\$\s*20.000,00|R\$\s*-20\.000,00/);
    expect(tip.textContent).toMatch(/Projeção a partir do saldo oficial em 23\/09\/2026/);
    expect(tip.querySelector('[class*="tooltipValueNegative"]')).toBeTruthy();
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
