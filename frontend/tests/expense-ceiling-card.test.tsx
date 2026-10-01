import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpenseCeilingCard } from '../src/components/dashboard/v2/expense-ceiling-card';
import type { ExpenseCeilingSnapshot } from '../src/services/dashboard/expense-ceiling.types';

function snapshot(overrides: Partial<ExpenseCeilingSnapshot>): ExpenseCeilingSnapshot {
  return {
    monthKey: '2026-09',
    ceiling: '100000',
    monthlyExpenses: '80000',
    consumedRate: '80',
    available: '20000',
    exceeded: '0',
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ExpenseCeilingCard', () => {
  it('sem teto oferece definir', () => {
    render(
      <ExpenseCeilingCard
        monthLabel="setembro de 2026"
        snapshot={snapshot({
          ceiling: null,
          status: 'NO_TARGET',
          consumedRate: null,
          available: null,
          exceeded: null,
        })}
        onEdit={() => undefined}
      />,
    );
    expect(screen.getByText('Teto ainda não definido')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Definir teto' })).toBeTruthy();
  });

  it('dentro do teto mostra percentual e disponível', () => {
    render(<ExpenseCeilingCard monthLabel="setembro de 2026" snapshot={snapshot({})} />);
    expect(screen.getByText('Dentro do teto')).toBeTruthy();
    expect(screen.getByText('80,0%')).toBeTruthy();
    expect(screen.getByText(/20\.000,00/)).toBeTruthy();
  });

  it('ultrapassado mostra o excedente', () => {
    render(
      <ExpenseCeilingCard
        monthLabel="setembro de 2026"
        snapshot={snapshot({
          monthlyExpenses: '115000',
          consumedRate: '115',
          available: '0',
          exceeded: '15000',
          status: 'EXCEEDED',
        })}
      />,
    );
    expect(screen.getByText('Teto ultrapassado')).toBeTruthy();
    expect(screen.getByText(/Excedido em/)).toBeTruthy();
    expect(screen.getAllByText(/15\.000,00/).length).toBeGreaterThan(0);
  });

  it('despesa indisponível não vira zero', () => {
    render(
      <ExpenseCeilingCard
        monthLabel="setembro de 2026"
        snapshot={snapshot({
          monthlyExpenses: null,
          consumedRate: null,
          available: null,
          exceeded: null,
          status: 'UNAVAILABLE',
        })}
      />,
    );
    expect(screen.getByText('Despesas indisponíveis')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/0,00%/)).toBeNull();
  });
});
