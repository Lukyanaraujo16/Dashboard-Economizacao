import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardMonthlyRevenuePath } from '../src/lib/api-config';
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  receivables: {
    total: '10000',
    received: '4000',
    outstanding: '6000',
    overdue: '0',
    classified: '10000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Serviços',
        amount: '10000',
        received: '4000',
        outstanding: '6000',
        percentage: '100',
      },
    ],
    daily: [
      { date: '2026-08-01', amount: '4000', received: '4000', outstanding: '0' },
      { date: '2026-08-15', amount: '6000', received: '0', outstanding: '6000' },
    ],
  },
};

describe('dashboard monthly revenue service', () => {
  it('busca o contrato mensal sem query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getDashboardMonthlyRevenue();
    expect(fetchMock).toHaveBeenCalledWith(dashboardMonthlyRevenuePath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.receivables.received).toBe('4000');
    expect(result.receivables.daily).toEqual([
      { date: '2026-08-01', amount: '4000', received: '4000', outstanding: '0' },
      { date: '2026-08-15', amount: '6000', received: '0', outstanding: '6000' },
    ]);
  });

  it('envia month= quando informado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getDashboardMonthlyRevenue('2026-07');
    expect(fetchMock).toHaveBeenCalledWith(
      dashboardMonthlyRevenuePath('2026-07'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejeita received numérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...body,
            receivables: {
              ...body.receivables,
              received: 4000,
            },
          }),
      }),
    );
    await expect(getDashboardMonthlyRevenue()).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('rejeita payload sem série diária de competência', async () => {
    const receivables: Record<string, unknown> = { ...body.receivables };
    delete receivables.daily;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ...body, receivables }),
      }),
    );
    await expect(getDashboardMonthlyRevenue()).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('rejeita ponto diário com amount numérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...body,
            receivables: {
              ...body.receivables,
              daily: [{ date: '2026-08-01', amount: 4000, received: '0', outstanding: '0' }],
            },
          }),
      }),
    );
    await expect(getDashboardMonthlyRevenue()).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('rejeita ponto diário sem os snapshots received/outstanding', async () => {
    for (const daily of [
      [{ date: '2026-08-01', amount: '4000', outstanding: '0' }],
      [{ date: '2026-08-01', amount: '4000', received: '0' }],
      [{ date: '2026-08-01', amount: '4000', received: 0, outstanding: '0' }],
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ ...body, receivables: { ...body.receivables, daily } }),
        }),
      );
      await expect(getDashboardMonthlyRevenue()).rejects.toMatchObject({
        kind: 'invalid_response',
      });
    }
  });
});
