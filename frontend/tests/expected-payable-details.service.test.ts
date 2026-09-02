import { describe, expect, it, vi } from 'vitest';

import { dashboardExpectedPayableDetailsPath } from '../src/lib/api-config';
import { getDashboardExpectedPayableDetails } from '../src/services/dashboard/expected-payable-details';

describe('getDashboardExpectedPayableDetails', () => {
  it('valida resposta e monta path com filtros', async () => {
    const payload = {
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      available: true,
      total: '1250',
      items: [
        {
          id: 'id-1',
          externalId: 'ext-1',
          dueDate: '2026-08-31',
          amount: '1250',
          description: 'Honorários',
          supplierName: 'Fornecedor XYZ',
          categoryNames: ['Contabilidade'],
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

    const result = await getDashboardExpectedPayableDetails('2026-08', 'cc-1', 'cat-1');
    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      dashboardExpectedPayableDetailsPath('2026-08', 'cc-1', 'cat-1'),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    vi.unstubAllGlobals();
  });
});
