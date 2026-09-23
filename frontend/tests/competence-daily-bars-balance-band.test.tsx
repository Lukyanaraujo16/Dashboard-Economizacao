/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompetenceDailyBars, WidgetExpandDialog } from '../src/components/dashboard/v2';
import { ThemeProvider } from '../src/theme';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function mockPlotRect(element: Element, width: number, height = 180) {
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

describe('CompetenceDailyBars — faixa de saldo bancário', () => {
  it('G) tooltip único: Entradas, Saídas e Saldo; gap → —', () => {
    render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
        balanceByDate={new Map([['2026-08-01', '46925.20']])}
      />,
    );
    const plot = screen.getByRole('img');
    mockPlotRect(plot, 400, 180);
    fireEvent.mouseMove(plot, { clientX: 4, clientY: 20 });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.textContent).toMatch(/01\/08/);
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.textContent).toMatch(/Saídas/);
    expect(tip.textContent).toMatch(/Saldo bancário/);
    expect(tip.textContent).toMatch(/R\$\s*46\.925,20/);
    expect(screen.getAllByRole('tooltip', { hidden: true })).toHaveLength(1);

    fireEvent.mouseMove(plot, { clientX: 390, clientY: 160 });
    const tipGap = screen.getByRole('tooltip', { hidden: true });
    expect(tipGap.textContent).toMatch(/03\/08/);
    expect(tipGap.textContent).toMatch(/Saldo bancário/);
    expect(tipGap.textContent).toMatch(/—/);
    expect(tipGap.textContent).not.toMatch(/R\$\s*0,00/);
    expect(screen.getAllByRole('tooltip', { hidden: true })).toHaveLength(1);
  });

  it('H) sem série de saldo: faixa ausente e movimentação permanece', () => {
    const { container } = render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
      />,
    );
    expect(screen.queryByText('Saldo bancário')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByText('Entradas')).toBeTruthy();
    expect(screen.getByText('Saídas')).toBeTruthy();
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  it('H) mapa vazio ou sem sobreposição não reserva faixa', () => {
    const { rerender, container } = render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
        balanceByDate={new Map()}
      />,
    );
    expect(screen.queryByText('Saldo bancário')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);

    rerender(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
        balanceByDate={new Map([['2026-07-31', '1000']])}
      />,
    );
    expect(screen.getByText('Saldo bancário')).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('J) expand reutiliza a mesma faixa e o mesmo tooltip', () => {
    render(
      <ThemeProvider>
        <WidgetExpandDialog open title="Movimentação financeira" onClose={() => undefined}>
          <CompetenceDailyBars
            revenueDaily={dailySeries(3)}
            expenseDaily={dailySeries(3)}
            monthKey="2026-08"
            revenueLabel="Entradas"
            expenseLabel="Saídas"
            balanceByDate={
              new Map([
                ['2026-08-01', '50000'],
                ['2026-08-03', '-5000'],
              ])
            }
          />
        </WidgetExpandDialog>
      </ThemeProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Movimentação financeira' });
    expect(within(dialog).getAllByText('Saldo bancário').length).toBeGreaterThan(0);
    const plot = within(dialog).getByRole('img');
    expect(plot.querySelectorAll('svg')).toHaveLength(2);
    mockPlotRect(plot, 640, 200);
    fireEvent.mouseMove(plot, { clientX: 8, clientY: 20 });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.textContent).toMatch(/Saídas/);
    expect(tip.textContent).toMatch(/Saldo bancário/);
    expect(tip.textContent).toMatch(/R\$\s*50\.000,00/);
  });

  it('faixa própria: linha roxa só no segundo SVG; barras só no primeiro', () => {
    const { container } = render(
      <CompetenceDailyBars
        revenueDaily={dailySeries(3)}
        expenseDaily={dailySeries(3)}
        monthKey="2026-08"
        revenueLabel="Entradas"
        expenseLabel="Saídas"
        balanceByDate={
          new Map([
            ['2026-08-01', '46925.20'],
            ['2026-08-02', '100000'],
            ['2026-08-03', '200000'],
          ])
        }
      />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    expect(svgs[0]!.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(svgs[0]!.querySelectorAll('polyline')).toHaveLength(0);
    expect(svgs[1]!.querySelectorAll('rect')).toHaveLength(0);
    expect(svgs[1]!.querySelectorAll('polyline').length).toBeGreaterThan(0);
    expect(svgs[1]!.querySelectorAll('circle').length).toBe(3);
  });
});
