import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  reportsExpensesDetailsPath,
  reportsRevenueDetailsPath,
} from '../src/lib/api-config';
import {
  getReportsExpensesDetails,
  getReportsRevenueDetails,
} from '../src/services/reports/details';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  today: '2026-09-24',
  from: '2026-09',
  to: '2026-09',
  situation: 'REALIZED',
  available: true,
  unavailableReason: null,
  totalAmount: '231733.56',
  itemCount: 47,
  limit: 25,
  offset: 0,
  items: [
    {
      date: '2026-09-15',
      description: 'Honorários',
      partyName: 'Cliente Alpha',
      categoryNames: ['Serviços'],
      costCenterNames: ['Operações'],
      situation: 'REALIZED',
      amount: '1000.00',
      installmentKind: 'RECEIVABLE',
      installmentExternalId: 'inst-1',
      settlementExternalId: 'set-1',
    },
  ],
};

describe('reports cash details service', () => {
  it('busca GET /reports/revenue/details com situation, from, to, limit e offset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getReportsRevenueDetails({
      from: '2026-09',
      to: '2026-09',
      situation: 'REALIZED',
      limit: 25,
      offset: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      reportsRevenueDetailsPath({
        from: '2026-09',
        to: '2026-09',
        situation: 'REALIZED',
        limit: 25,
        offset: 0,
      }),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    expect(result.totalAmount).toBe('231733.56');
    expect(result.itemCount).toBe(47);
    expect(result.items[0]?.settlementExternalId).toBe('set-1');
  });

  it('busca GET /reports/expenses/details com category, costCenter e EXPECTED', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ...body,
          situation: 'EXPECTED',
          items: [
            {
              ...body.items[0],
              situation: 'EXPECTED',
              installmentKind: 'PAYABLE',
              settlementExternalId: undefined,
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getReportsExpensesDetails({
      from: '2026-01',
      to: '2026-02',
      situation: 'EXPECTED',
      costCenterId: '11111111-1111-4111-8111-111111111111',
      categoryId: '22222222-2222-4222-8222-222222222222',
      limit: 25,
      offset: 25,
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      reportsExpensesDetailsPath({
        from: '2026-01',
        to: '2026-02',
        situation: 'EXPECTED',
        costCenterId: '11111111-1111-4111-8111-111111111111',
        categoryId: '22222222-2222-4222-8222-222222222222',
        limit: 25,
        offset: 25,
      }),
    );
    expect(url).toContain('situation=EXPECTED');
    expect(url).toContain('from=2026-01');
    expect(url).toContain('to=2026-02');
    expect(url).toContain('category=22222222-2222-4222-8222-222222222222');
    expect(url).toContain('costCenter=11111111-1111-4111-8111-111111111111');
    expect(url).toContain('limit=25');
    expect(url).toContain('offset=25');
    expect(url).not.toContain('tenantId');
  });

  it('faz parse de OVERDUE, split unavailable e rejeita payload inválido', async () => {
    const unavailable = {
      ...body,
      situation: 'OVERDUE',
      available: false,
      unavailableReason: 'COST_CENTER_SPLIT',
      totalAmount: null,
      itemCount: 0,
      items: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(unavailable),
    });
    vi.stubGlobal('fetch', fetchMock);
    const parsed = await getReportsRevenueDetails({
      from: '2026-09',
      to: '2026-09',
      situation: 'OVERDUE',
    });
    expect(parsed.available).toBe(false);
    expect(parsed.unavailableReason).toBe('COST_CENTER_SPLIT');
    expect(parsed.totalAmount).toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...body, items: 'nope' }),
    });
    await expect(
      getReportsRevenueDetails({ from: '2026-09', to: '2026-09', situation: 'REALIZED' }),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('mapeia erro HTTP 403 e 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 'FORBIDDEN' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getReportsExpensesDetails({ from: '2026-01', to: '2026-01', situation: 'REALIZED' }),
    ).rejects.toMatchObject({
      kind: 'forbidden',
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }),
    });
    await expect(
      getReportsRevenueDetails({ from: '2026-01', to: '2026-01', situation: 'REALIZED' }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível carregar os lançamentos de receita.',
    });
  });
});
