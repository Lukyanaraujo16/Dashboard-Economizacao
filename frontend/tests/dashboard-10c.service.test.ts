import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardUpcomingPath } from '../src/lib/api-config';
import { getDashboardUpcoming } from '../src/services/dashboard/upcoming';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const upcomingBody = {
  today: '2026-08-19',
  nDays: 15,
  from: '2026-08-19',
  to: '2026-09-03',
  summary: { receivable: '0', payable: '0', net: '0' },
  receivables: { items: [] },
  payables: { items: [] },
};

describe('dashboard 10C services', () => {
  it('upcoming envia days explícito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(upcomingBody),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardUpcoming(15);

    expect(fetchMock).toHaveBeenCalledWith(dashboardUpcomingPath(15), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.nDays).toBe(15);
    expect(result.summary).toEqual({ receivable: '0', payable: '0', net: '0' });
  });

  it('rejeita upcoming sem summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            today: '2026-08-19',
            nDays: 15,
            from: '2026-08-19',
            to: '2026-09-03',
            receivables: { items: [] },
            payables: { items: [] },
          }),
      }),
    );

    await expect(getDashboardUpcoming(15)).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('rejeita unpaid numérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ...upcomingBody,
            receivables: {
              items: [{ id: '1', dueDate: '2026-08-20', unpaid: 8, status: 'OPEN' }],
            },
          }),
      }),
    );

    await expect(getDashboardUpcoming(15)).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
