/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompetenceDailyBars } from '../src/components/dashboard/v2';

afterEach(() => {
  cleanup();
});

function applyRect(element: Element, left: number, width: number, height = 180) {
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

function septemberSeries() {
  return Array.from({ length: 30 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    amount: String((index + 1) * 100),
  }));
}

function renderSeptember() {
  render(
    <CompetenceDailyBars
      revenueDaily={septemberSeries()}
      expenseDaily={septemberSeries()}
      monthKey="2026-09"
      revenueLabel="Entradas"
      expenseLabel="Saídas"
      balanceByDate={
        new Map([
          ['2026-09-09', '1000'],
          ['2026-09-10', '2000'],
        ])
      }
    />,
  );
  const hitArea = screen.getByRole('img');
  const plot = hitArea.querySelector('[data-daily-bars-plot]');
  if (!plot) {
    throw new Error('plot diário ausente');
  }
  return { hitArea, plot };
}

function mockSplitRects(hitArea: Element, plot: Element, plotWidth: number, axisWidth: number) {
  applyRect(hitArea, 0, axisWidth + plotWidth);
  applyRect(plot, axisWidth, plotWidth);
}

function slotClientX(plotLeft: number, plotWidth: number, count: number, index: number, offset = 0.5) {
  return plotLeft + ((index + offset) / count) * plotWidth;
}

describe('CompetenceDailyBars — hover por slot do plot', () => {
  it('centro do slot 09/09 e 10/09 com hitArea mais largo que o plot', () => {
    const { hitArea, plot } = renderSeptember();
    mockSplitRects(hitArea, plot, 320, 80);

    fireEvent.mouseMove(hitArea, { clientX: slotClientX(80, 320, 30, 8), clientY: 40 });
    const tip09 = screen.getByRole('tooltip', { hidden: true });
    expect(tip09.textContent).toMatch(/09\/09/);
    expect(tip09.textContent).not.toMatch(/10\/09/);
    expect(tip09.textContent).toMatch(/Saldo bancário/);
    expect(tip09.textContent).toMatch(/R\$\s*1\.000,00/);

    fireEvent.mouseMove(hitArea, { clientX: slotClientX(80, 320, 30, 9), clientY: 40 });
    const tip10 = screen.getByRole('tooltip', { hidden: true });
    expect(tip10.textContent).toMatch(/10\/09/);
    expect(tip10.textContent).not.toMatch(/09\/09/);
    expect(tip10.textContent).toMatch(/R\$\s*2\.000,00/);
  });

  it('lado direito do slot 09 continua 09/09; logo após a fronteira vira 10/09', () => {
    const { hitArea, plot } = renderSeptember();
    mockSplitRects(hitArea, plot, 320, 80);
    const boundary = slotClientX(80, 320, 30, 8, 1);

    fireEvent.mouseMove(hitArea, { clientX: boundary - 0.5, clientY: 40 });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/09\/09/);

    fireEvent.mouseMove(hitArea, { clientX: boundary + 0.5, clientY: 40 });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/10\/09/);
  });

  it('o mesmo ratio no plot seleciona o mesmo dia em 320px e 640px', () => {
    const { hitArea, plot } = renderSeptember();

    mockSplitRects(hitArea, plot, 320, 80);
    fireEvent.mouseMove(hitArea, { clientX: slotClientX(80, 320, 30, 8), clientY: 40 });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/09\/09/);

    mockSplitRects(hitArea, plot, 640, 80);
    fireEvent.mouseMove(hitArea, { clientX: slotClientX(80, 640, 30, 8), clientY: 40 });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/09\/09/);

    fireEvent.mouseMove(hitArea, { clientX: slotClientX(80, 640, 30, 9), clientY: 40 });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/10\/09/);
  });

  it('ponteiro sobre o eixo, à esquerda do plot, não seleciona o dia 01', () => {
    const { hitArea, plot } = renderSeptember();
    mockSplitRects(hitArea, plot, 320, 80);

    fireEvent.mouseMove(hitArea, { clientX: 40, clientY: 40 });
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });
});
