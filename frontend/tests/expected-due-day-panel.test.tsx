/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { nextScopedDaySelection, visibleScopedDay } from '../src/components/dashboard/cash-realized-day-selection';
import { ExpectedDueDayPanel } from '../src/components/dashboard/expected-due-day-panel';
import { expectedDueDayChartAmount } from '../src/components/dashboard/expected-due-day-drilldown';
import { ExpectedPayableDetailsPanel } from '../src/components/dashboard/expected-payable-details-panel';
import { ExpectedReceivableDetailsPanel } from '../src/components/dashboard/expected-receivable-details-panel';
import { CompetenceDailyBars } from '../src/components/dashboard/v2';
import type { DashboardPayableStockDetailItem } from '../src/services/dashboard/payable-stock-details.types';
import type { DashboardReceivableStockDetailItem } from '../src/services/dashboard/receivable-stock-details.types';

afterEach(() => {
  cleanup();
});

const receivablePoints = [
  { date: '2026-10-10', amount: '150.00' },
  { date: '2026-10-11', amount: '10.00' },
  { date: '2026-10-12', amount: '0.00' },
];

const receivableItems: readonly DashboardReceivableStockDetailItem[] = [
  {
    id: 'a1',
    externalId: 'a1',
    dueDate: '2026-10-10',
    amount: '100.50',
    description: 'Consulta',
    customerName: 'Cliente A',
    categoryNames: ['Consultas'],
    situation: 'UPCOMING',
    overdueDays: null,
  },
  {
    id: 'a2',
    externalId: 'a2',
    dueDate: '2026-10-10',
    amount: '49.50',
    description: 'Retorno',
    customerName: 'Cliente B',
    categoryNames: ['Consultas'],
    situation: 'UPCOMING',
    overdueDays: null,
  },
  {
    id: 'a3',
    externalId: 'a3',
    dueDate: '2026-10-11',
    amount: '10.00',
    description: 'Outro dia',
    customerName: 'Cliente C',
    categoryNames: [],
    situation: 'UPCOMING',
    overdueDays: null,
  },
  {
    id: 'overdue',
    externalId: 'overdue',
    dueDate: '2026-10-01',
    amount: '80.00',
    description: 'Vencido',
    customerName: 'Cliente Vencido',
    categoryNames: [],
    situation: 'OVERDUE',
    overdueDays: 1,
  },
];

const payablePoints = [
  { date: '2026-10-10', amount: '100.00' },
  { date: '2026-10-11', amount: '8.00' },
  { date: '2026-10-12', amount: '0.00' },
];

const payableItems: readonly DashboardPayableStockDetailItem[] = [
  {
    id: 'p1',
    externalId: 'p1',
    dueDate: '2026-10-10',
    amount: '70.25',
    description: 'Aluguel',
    supplierName: 'Fornecedor A',
    categoryNames: ['Ocupação'],
    situation: 'UPCOMING',
    overdueDays: null,
  },
  {
    id: 'p2',
    externalId: 'p2',
    dueDate: '2026-10-10',
    amount: '29.75',
    description: 'Energia',
    supplierName: 'Fornecedor B',
    categoryNames: ['Utilidades'],
    situation: 'UPCOMING',
    overdueDays: null,
  },
  {
    id: 'p3',
    externalId: 'p3',
    dueDate: '2026-10-11',
    amount: '8.00',
    description: 'Outro dia',
    supplierName: 'Fornecedor C',
    categoryNames: [],
    situation: 'UPCOMING',
    overdueDays: null,
  },
];

function ReceivableHarness() {
  const scope = '2026-10||';
  const [selection, setSelection] = useState<Parameters<typeof visibleScopedDay>[0]>(null);
  const date = visibleScopedDay(selection, scope);
  return (
    <>
      <CompetenceDailyBars
        revenueDaily={receivablePoints}
        expenseDaily={receivablePoints.map((point) => ({ date: point.date, amount: '0' }))}
        monthKey="2026-10"
        revenueLabel="A receber"
        expenseLabel="—"
        selectedDate={date}
        onPointSelect={(next) =>
          setSelection((current) => nextScopedDaySelection(current, scope, next))
        }
      />
      {date ? (
        <ExpectedDueDayPanel
          date={date}
          direction="receivable"
          chartAmount={expectedDueDayChartAmount(receivablePoints, date)}
          details={{ kind: 'ready', data: { available: true, items: receivableItems } }}
          renderItems={(items) => (
            <ExpectedReceivableDetailsPanel
              items={items}
              ariaLabel={`Títulos a receber em ${date}`}
            />
          )}
        />
      ) : null}
      <h3>Títulos em aberto</h3>
      <ExpectedReceivableDetailsPanel
        items={receivableItems}
        ariaLabel="Títulos a receber em aberto"
      />
    </>
  );
}

function PayableHarness() {
  const scope = '2026-10||';
  const [selection, setSelection] = useState<Parameters<typeof visibleScopedDay>[0]>(null);
  const date = visibleScopedDay(selection, scope);
  return (
    <>
      <CompetenceDailyBars
        revenueDaily={payablePoints.map((point) => ({ date: point.date, amount: '0' }))}
        expenseDaily={payablePoints}
        monthKey="2026-10"
        revenueLabel="—"
        expenseLabel="A pagar"
        selectedDate={date}
        onPointSelect={(next) =>
          setSelection((current) => nextScopedDaySelection(current, scope, next))
        }
      />
      {date ? (
        <ExpectedDueDayPanel
          date={date}
          direction="payable"
          chartAmount={expectedDueDayChartAmount(payablePoints, date)}
          details={{ kind: 'ready', data: { available: true, items: payableItems } }}
          renderItems={(items) => (
            <ExpectedPayableDetailsPanel items={items} ariaLabel={`Títulos a pagar em ${date}`} />
          )}
        />
      ) : null}
      <h3>Títulos em aberto</h3>
      <ExpectedPayableDetailsPanel items={payableItems} ariaLabel="Títulos a pagar em aberto" />
    </>
  );
}

function chart(): HTMLElement {
  return screen.getByRole('img');
}

function selectOffset(fromEnd: number) {
  fireEvent.focus(chart());
  for (let step = 0; step < fromEnd; step += 1) {
    fireEvent.keyDown(chart(), { key: 'ArrowLeft' });
  }
  fireEvent.keyDown(chart(), { key: 'Enter' });
}

describe('interação do drill-down de A receber', () => {
  it('seleciona o dia, troca, esvazia e limpa sem remover a listagem geral', () => {
    render(<ReceivableHarness />);
    expect(screen.getByText('Selecione um dia para ver os títulos')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Títulos a receber em aberto' }).textContent).toMatch(
      /Cliente Vencido/,
    );

    selectOffset(2);
    const day = screen.getByRole('region', { name: /A receber em 10 OUT 2026/ });
    expect(day.textContent).toMatch(/Cliente A/);
    expect(day.textContent).toMatch(/Cliente B/);
    expect(day.textContent).not.toMatch(/Cliente C/);
    expect(day.textContent).not.toMatch(/Cliente Vencido/);
    expect(day.textContent).toMatch(/R\$\s*150,00/);
    expect(day.textContent).toMatch(/10\/10\/2026/);
    expect(screen.getByRole('list', { name: 'Títulos a receber em aberto' }).textContent).toMatch(
      /Cliente C/,
    );

    selectOffset(1);
    const next = screen.getByRole('region', { name: /A receber em 11 OUT 2026/ });
    expect(next.textContent).toMatch(/Cliente C/);
    expect(next.textContent).not.toMatch(/Cliente A/);

    selectOffset(0);
    const empty = screen.getByRole('region', { name: /A receber em 12 OUT 2026/ });
    expect(empty.querySelector('[data-expected-due-day-empty="true"]')?.textContent).toMatch(
      /Nenhum título a receber no prazo neste dia/,
    );
    expect(empty.textContent).toMatch(/R\$\s*0,00/);

    selectOffset(0);
    expect(screen.queryByRole('region', { name: /A receber em/ })).toBeNull();
    expect(screen.getByText('Selecione um dia para ver os títulos')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Títulos em aberto' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Títulos a receber em aberto' })).toBeTruthy();
  });
});

describe('interação do drill-down de Contas a pagar', () => {
  it('seleciona o dia, troca, esvazia e limpa sem remover a listagem geral', () => {
    render(<PayableHarness />);
    selectOffset(2);
    const day = screen.getByRole('region', { name: /A pagar em 10 OUT 2026/ });
    expect(within(day).getByText('Fornecedor A')).toBeTruthy();
    expect(within(day).getByText('Fornecedor B')).toBeTruthy();
    expect(day.textContent).not.toMatch(/Fornecedor C/);
    expect(day.textContent).toMatch(/R\$\s*100,00/);
    expect(day.textContent).toMatch(/10\/10\/2026/);
    expect(screen.getByRole('list', { name: 'Títulos a pagar em aberto' }).textContent).toMatch(
      /Fornecedor C/,
    );

    selectOffset(1);
    expect(screen.getByRole('region', { name: /A pagar em 11 OUT 2026/ }).textContent).toMatch(
      /Fornecedor C/,
    );

    selectOffset(0);
    expect(
      screen
        .getByRole('region', { name: /A pagar em 12 OUT 2026/ })
        .querySelector('[data-expected-due-day-empty="true"]')?.textContent,
    ).toMatch(/Nenhum título a pagar no prazo neste dia/);

    selectOffset(0);
    expect(screen.queryByRole('region', { name: /A pagar em/ })).toBeNull();
    expect(screen.getByRole('list', { name: 'Títulos a pagar em aberto' })).toBeTruthy();
  });
});
