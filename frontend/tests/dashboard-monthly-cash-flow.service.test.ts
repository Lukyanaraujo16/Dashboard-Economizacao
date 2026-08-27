import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardMonthlyCashFlowPath } from '../src/lib/api-config';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  today: '2026-08-26',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  costCenterCashSplit: true,
  billing: '100000',
  realized: { inflows: '80000', outflows: '0', result: '80000' },
  expected: { receivables: '20000', payables: '0', result: '20000' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
  coverage: '0.8',
  realizedByCategory: {
    inflows: { total: '80000', classified: '80000', uncategorized: '0', imprecise: '0', coverageRate: '100', items: [{ kind: 'category', name: 'Serviços', amount: '80000', percentage: '100' }] },
    outflows: { total: '0', classified: '0', uncategorized: '0', imprecise: '0', coverageRate: null, items: [] },
  },
  daily: {
    realized: [{ date: '2026-08-05', inflows: '80000', outflows: '0', result: '80000' }],
    expected: [{ date: '2026-08-31', receivables: '20000', payables: '0', result: '20000' }],
  },
};

describe('dashboard monthly cash flow service', () => {
  it('busca o contrato sem query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getDashboardMonthlyCashFlow();
    expect(fetchMock).toHaveBeenCalledWith(dashboardMonthlyCashFlowPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.billing).toBe('100000');
    expect(result.daily.realized).toHaveLength(1);
    expect(result.daily.expected).toHaveLength(1);
  });

  it('envia month= e costCenter= sem situation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const center = '11111111-1111-4111-8111-111111111111';
    await getDashboardMonthlyCashFlow('2026-08', center);
    expect(fetchMock).toHaveBeenCalledWith(
      dashboardMonthlyCashFlowPath('2026-08', center),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(dashboardMonthlyCashFlowPath('2026-08', center)).not.toContain('situation');
  });

  it('rejeita billing numérico (contrato é string)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...body, billing: 100000 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getDashboardMonthlyCashFlow()).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('propaga 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getDashboardMonthlyCashFlow()).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });
});
