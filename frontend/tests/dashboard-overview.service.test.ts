import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardOverviewPath } from '../src/lib/api-config';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import { DashboardOverviewRequestError } from '../src/services/dashboard/overview.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const validBody = {
  today: '2026-08-19',
  receivables: { open: '8', overdue: '8', upcoming: '0' },
  payables: { open: '0', overdue: '0', upcoming: '0' },
  delinquency: { overdueUnpaid: '8', openUnpaid: '8', rate: '100' },
  integration: {
    status: 'DISCONNECTED' as const,
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

describe('getDashboardOverview (10B)', () => {
  it('busca /dashboard/overview com credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(validBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardOverview();

    expect(fetchMock).toHaveBeenCalledWith(dashboardOverviewPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.receivables.open).toBe('8');
    expect(typeof result.receivables.open).toBe('string');
    expect(result.delinquency.rate).toBe('100');
  });

  it('403 vira forbidden sem copiar payload financeiro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: { code: 'FORBIDDEN' } }),
      }),
    );

    await expect(getDashboardOverview()).rejects.toMatchObject({
      name: 'DashboardOverviewRequestError',
      kind: 'forbidden',
    } satisfies Partial<DashboardOverviewRequestError>);
  });

  it('rejeita resposta com number no lugar de decimal-string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...validBody,
            receivables: { open: 8, overdue: '8', upcoming: '0' },
          }),
      }),
    );

    await expect(getDashboardOverview()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});
