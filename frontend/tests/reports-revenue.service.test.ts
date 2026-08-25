import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportsRevenuePath } from '../src/lib/api-config';
import { downloadReportsRevenueExport, getReportsRevenue } from '../src/services/reports/revenue';
import { ReportsRevenueRequestError } from '../src/services/reports/revenue.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = {
  today: '2026-08-19',
  from: '2026-01',
  to: '2026-02',
  receivables: {
    total: '15000',
    received: '9000',
    outstanding: '6000',
    overdue: '0',
    classified: '15000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Serviços',
        amount: '15000',
        received: '9000',
        outstanding: '6000',
        percentage: '100',
      },
    ],
  },
  months: [
    {
      monthKey: '2026-01',
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
        daily: [{ date: '2026-01-01', amount: '10000', received: '4000', outstanding: '6000' }],
      },
    },
    {
      monthKey: '2026-02',
      receivables: {
        total: '5000',
        received: '5000',
        outstanding: '0',
        overdue: '0',
        classified: '5000',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [
          {
            kind: 'category',
            name: 'Serviços',
            amount: '5000',
            received: '5000',
            outstanding: '0',
            percentage: '100',
          },
        ],
        daily: [{ date: '2026-02-01', amount: '5000', received: '5000', outstanding: '0' }],
      },
    },
  ],
};

describe('reports revenue service', () => {
  it('busca GET /reports/revenue com credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getReportsRevenue({ from: '2026-01', to: '2026-02' });
    expect(fetchMock).toHaveBeenCalledWith(
      reportsRevenuePath({ from: '2026-01', to: '2026-02' }),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    expect(result.receivables.total).toBe('15000');
    expect(result.months).toHaveLength(2);
  });

  it('propaga filtros AND', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getReportsRevenue({
      from: '2026-01',
      to: '2026-02',
      costCenterId: '11111111-1111-4111-8111-111111111111',
      situation: 'settled',
      categoryId: '22222222-2222-4222-8222-222222222222',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('situation=settled');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('costCenter=11111111-1111-4111-8111-111111111111');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('tenantId');
  });

  it('rejeita intervalo sem months[] ou com daily no agregado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ...body,
          receivables: { ...body.receivables, daily: [] },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getReportsRevenue({ from: '2026-01', to: '2026-02' })).rejects.toBeInstanceOf(
      ReportsRevenueRequestError,
    );
  });

  it('mapeia 403 de plataforma sem suporte', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 'FORBIDDEN' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getReportsRevenue({ from: '2026-01', to: '2026-01' })).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('baixa PDF/XLSX com format e credentials include', async () => {
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="relatorio-receita-2026-01-a-2026-02.pdf"'
            : null,
      },
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await downloadReportsRevenueExport({ from: '2026-01', to: '2026-02', format: 'pdf' });
    expect(fetchMock).toHaveBeenCalledWith(
      reportsRevenuePath({ from: '2026-01', to: '2026-02', format: 'pdf' }),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/pdf' },
      },
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }),
    });
    await expect(
      downloadReportsRevenueExport({ from: '2026-01', to: '2026-02', format: 'xlsx' }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível exportar o relatório de receita.',
    });
  });
});
