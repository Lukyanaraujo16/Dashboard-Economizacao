import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardRevenueGoalPath } from '../src/lib/api-config';
import {
  getDashboardRevenueGoal,
  putDashboardRevenueGoal,
} from '../src/services/dashboard/revenue-goal';
import { DashboardRevenueGoalRequestError } from '../src/services/dashboard/revenue-goal.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  monthKey: '2026-08',
  target: '180000',
  actual: '136800',
  achievementRate: '76',
  remaining: '43200',
  exceeded: '0',
  status: 'IN_PROGRESS',
  history: [
    {
      monthKey: '2026-07',
      target: null,
      actual: '90000',
      achievementRate: null,
      status: 'NO_TARGET',
    },
    {
      monthKey: '2026-08',
      target: '180000',
      actual: '136800',
      achievementRate: '76',
      status: 'IN_PROGRESS',
    },
  ],
};

function okResponse(payload: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
}

describe('dashboard revenue goal service', () => {
  it('lê a meta da competência corrente sem query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDashboardRevenueGoal();

    expect(fetchMock).toHaveBeenCalledWith(dashboardRevenueGoalPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.achievementRate).toBe('76');
    expect(result.history).toHaveLength(2);
  });

  it('envia month= quando informado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await getDashboardRevenueGoal('2026-07');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/dashboard/revenue-goal?month=2026-07');
  });

  it('grava a meta com decimal-string no corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await putDashboardRevenueGoal({ month: '2026-08', target: '180000.00' });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe(dashboardRevenueGoalPath());
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ month: '2026-08', target: '180000.00' });
  });

  it('403 vira erro de contexto de empresa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: { code: 'FORBIDDEN' } }),
      }),
    );

    await expect(getDashboardRevenueGoal()).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('400 na gravação vira erro de meta inválida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { code: 'VALIDATION_ERROR' } }),
      }),
    );

    await expect(
      putDashboardRevenueGoal({ month: '2026-08', target: '0' }),
    ).rejects.toBeInstanceOf(DashboardRevenueGoalRequestError);
  });

  it('payload fora do contrato não vira snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ ...body, status: 'ALMOST_THERE' })),
    );

    await expect(getDashboardRevenueGoal()).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
