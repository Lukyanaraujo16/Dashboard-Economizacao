import { describe, expect, it, vi } from 'vitest';

import { dashboardExpectedReceivableDetailsPath } from '../src/lib/api-config';
import { getDashboardExpectedReceivableDetails } from '../src/services/dashboard/expected-receivable-details';

describe('getDashboardExpectedReceivableDetails', () => {
  it('valida resposta e monta path com filtros', async () => {
    const payload = {
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      available: true,
      total: '978',
      items: [
        {
          id: 'id-1',
          externalId: 'ext-1',
          dueDate: '2026-08-31',
          amount: '978',
          description: 'Consulta',
          customerName: 'Maria',
          categoryNames: ['Consultas'],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      }),
    );

    const result = await getDashboardExpectedReceivableDetails('2026-08', 'cc-1', 'cat-1');
    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      dashboardExpectedReceivableDetailsPath('2026-08', 'cc-1', 'cat-1'),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    vi.unstubAllGlobals();
  });
});
