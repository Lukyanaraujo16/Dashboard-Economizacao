import { describe, expect, it } from 'vitest';

import { signalTone } from '../src/components/dashboard/v2/executive-signals';

describe('signalTone', () => {
  it('mapeia sinais para tons semânticos de série', () => {
    expect(signalTone({ id: 'top-revenue-category', body: 'Receita concentrada.' })).toBe(
      'receivable',
    );
    expect(signalTone({ id: 'top-expense-category', body: 'Despesa concentrada.' })).toBe(
      'expense',
    );
    expect(signalTone({ id: 'revenue-expense-total', body: 'Totais da competência.' })).toBe(
      'result',
    );
    expect(signalTone({ id: 'expense-classification-gap', body: 'Falta classificar.' })).toBe(
      'warning',
    );
  });

  it('interpreta o saldo só nas formulações conhecidas do backend', () => {
    expect(
      signalTone({
        id: 'revenue-expense-balance',
        body: 'As despesas da competência superam as receitas em R$ 10,00.',
      }),
    ).toBe('negative');
    expect(
      signalTone({
        id: 'revenue-expense-balance',
        body: 'As receitas da competência superam as despesas em R$ 10,00.',
      }),
    ).toBe('positive');
    expect(
      signalTone({
        id: 'revenue-expense-balance',
        body: 'Receitas e despesas da competência estão equilibradas.',
      }),
    ).toBe('muted');
  });
});
