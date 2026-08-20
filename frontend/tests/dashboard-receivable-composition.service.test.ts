import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardReceivableCompositionPath } from '../src/lib/api-config';
import { getDashboardReceivableComposition } from '../src/services/dashboard/receivable-composition';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const compositionBody = {
  today: '2026-08-19',
  receivables: {
    total: '100',
    classified: '80',
    uncategorized: '20',
    imprecise: '0',
    coverageRate: '80',
    items: [{ kind: 'category', name: 'Serviços', amount: '80', percentage: '80' }],
  },
};

describe('dashboard receivable composition service', () => {
  it('busca composição sem query e preserva percentuais string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(compositionBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardReceivableComposition();

    expect(fetchMock).toHaveBeenCalledWith(dashboardReceivableCompositionPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(typeof result.receivables.items[0]?.percentage).toBe('string');
    expect(result.receivables.coverageRate).toBe('80');
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
            receivables: {
              ...compositionBody.receivables,
              items: [{ kind: 'category', name: 'Serviços', amount: 80, percentage: '80' }],
            },
          }),
      }),
    );

    await expect(getDashboardReceivableComposition()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});
