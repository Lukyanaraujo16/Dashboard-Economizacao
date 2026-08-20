import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardExpenseCompositionPath } from '../src/lib/api-config';
import { getDashboardExpenseComposition } from '../src/services/dashboard/expense-composition';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const compositionBody = {
  today: '2026-08-19',
  payables: {
    total: '100',
    classified: '80',
    uncategorized: '20',
    imprecise: '0',
    coverageRate: '80',
    items: [{ kind: 'category', name: 'Aluguel', amount: '80', percentage: '80' }],
  },
};

describe('dashboard E2 service', () => {
  it('busca composição sem query e preserva percentuais string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(compositionBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardExpenseComposition();

    expect(fetchMock).toHaveBeenCalledWith(dashboardExpenseCompositionPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(typeof result.payables.items[0]?.percentage).toBe('string');
    expect(result.payables.coverageRate).toBe('80');
  });

  it('rejeita amount numérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...compositionBody,
            payables: {
              ...compositionBody.payables,
              items: [{ kind: 'category', name: 'Aluguel', amount: 80, percentage: '80' }],
            },
          }),
      }),
    );

    await expect(getDashboardExpenseComposition()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});
