import { describe, expect, it } from 'vitest';

import { executiveInsightRows } from '../src/components/dashboard/dashboard-executive-insights-view';

describe('dashboard-executive-insights-view', () => {
  it('repassa body e id do backend sem transformação', () => {
    const rows = executiveInsightRows([
      {
        id: 'revenue-expense-total',
        body: 'Agosto de 2026 gerou R$ 100,00 em receitas de competência e R$ 80,00 em despesas de competência.',
      },
      {
        id: 'top-expense-category',
        body: 'A categoria Salários representa 49,0% das despesas classificadas do mês.',
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('revenue-expense-total');
    expect(rows[0]?.body).toContain('R$ 100,00');
    expect(rows[1]?.body).toContain('Salários');
  });

  it('retorna lista vazia quando não há insights', () => {
    expect(executiveInsightRows([])).toEqual([]);
  });
});
