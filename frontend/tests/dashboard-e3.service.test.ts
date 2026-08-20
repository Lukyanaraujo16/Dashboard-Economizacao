import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardExecutiveInsightsPath } from '../src/lib/api-config';
import { getDashboardExecutiveInsights } from '../src/services/dashboard/executive-insights';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const insightsBody = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  insights: [
    {
      id: 'revenue-expense-total',
      body: 'Agosto de 2026 gerou R$ 100,00 em receitas de competência e R$ 150,00 em despesas de competência.',
    },
    {
      id: 'revenue-expense-balance',
      body: 'As despesas da competência superam as receitas em R$ 50,00.',
    },
  ],
};

describe('dashboard E3 service', () => {
  it('busca insights mensais sem query e preserva contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(insightsBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardExecutiveInsights();

    expect(fetchMock).toHaveBeenCalledWith(dashboardExecutiveInsightsPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.monthKey).toBe('2026-08');
    expect(result.insights).toHaveLength(2);
  });

  it('aceita month opcional na query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(insightsBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getDashboardExecutiveInsights('2026-07');

    expect(fetchMock).toHaveBeenCalledWith(dashboardExecutiveInsightsPath('2026-07'), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('rejeita payload inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...insightsBody,
            insights: [{ id: 'pressure', body: 'x' }],
          }),
      }),
    );

    await expect(getDashboardExecutiveInsights()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});
