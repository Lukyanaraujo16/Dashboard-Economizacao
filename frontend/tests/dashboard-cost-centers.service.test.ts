import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardCostCentersPath } from '../src/lib/api-config';
import {
  getDashboardCostCenters,
  isDashboardCostCentersResponse,
} from '../src/services/dashboard/cost-centers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Operações',
      code: 'OP',
      active: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Administrativo',
      code: null,
      active: false,
    },
  ],
};

describe('dashboard cost-centers service', () => {
  it('parseia o contrato de listagem', () => {
    expect(isDashboardCostCentersResponse(body)).toBe(true);
    expect(isDashboardCostCentersResponse({ items: [{ id: 'x' }] })).toBe(false);
    expect(isDashboardCostCentersResponse({ items: 'nope' })).toBe(false);
  });

  it('busca com credentials e path canônico com month', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardCostCenters({ monthKey: '2026-08' });
    expect(fetchMock).toHaveBeenCalledWith(dashboardCostCentersPath({ monthKey: '2026-08' }), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(dashboardCostCentersPath({ monthKey: '2026-08' })).toBe(
      '/dashboard/cost-centers?month=2026-08',
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe('Operações');
  });

  it('rejeita payload inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [{ id: 1 }] }),
      }),
    );
    await expect(getDashboardCostCenters()).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
