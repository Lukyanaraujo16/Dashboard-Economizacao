import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardPayableStockDetailsPath } from '../src/lib/api-config';
import { getDashboardPayableStockDetails } from '../src/services/dashboard/payable-stock-details';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  today: '2026-09-23',
  available: true,
  total: '12',
  overdue: '3',
  dueToday: '1',
  upcoming: '8',
  items: [
    {
      id: '1',
      externalId: 'over',
      dueDate: '2026-09-22',
      amount: '3',
      description: null,
      supplierName: 'Fornecedor',
      categoryNames: [],
      situation: 'OVERDUE',
      overdueDays: 1,
    },
  ],
};

describe('payable stock details service', () => {
  it('não envia month na query do estoque', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getDashboardPayableStockDetails('cc-1', 'cat-1');
    expect(fetchMock).toHaveBeenCalledWith(dashboardPayableStockDetailsPath('cc-1', 'cat-1'), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(dashboardPayableStockDetailsPath('cc-1', 'cat-1')).not.toContain('month=');
    expect(result.total).toBe('12');
    expect(result.items[0]?.situation).toBe('OVERDUE');
  });
});
