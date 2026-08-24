import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardCategoriesPath } from '../src/lib/api-config';
import {
  getDashboardCategories,
  isDashboardCategoriesResponse,
} from '../src/services/dashboard/categories';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  items: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Serviços',
      type: 'REVENUE',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Folha',
      type: 'EXPENSE',
    },
  ],
};

describe('dashboard categories service', () => {
  it('parseia o contrato de listagem', () => {
    expect(isDashboardCategoriesResponse(body)).toBe(true);
    expect(isDashboardCategoriesResponse({ items: [{ id: 'x' }] })).toBe(false);
    expect(isDashboardCategoriesResponse({ items: 'nope' })).toBe(false);
  });

  it('busca com credentials e path canônico', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardCategories();
    expect(fetchMock).toHaveBeenCalledWith(dashboardCategoriesPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(dashboardCategoriesPath()).toBe('/dashboard/categories');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe('Serviços');
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
    await expect(getDashboardCategories()).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
