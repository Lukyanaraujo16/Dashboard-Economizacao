import { describe, expect, it } from 'vitest';

import { reportsRevenuePath } from '../src/lib/api-config';
import {
  REPORT_TYPE_REVENUE,
  buildReportsSearchParams,
  parseReportsQuery,
  validateReportMonthRange,
} from '../src/lib/reports-query';

describe('reports-query', () => {
  it('lê from/to/costCenter/situation/category e ignora tenantId', () => {
    const params = new URLSearchParams(
      'type=revenue&from=2026-01&to=2026-08&costCenter=11111111-1111-4111-8111-111111111111&situation=open&category=22222222-2222-4222-8222-222222222222&tenantId=nope',
    );
    expect(parseReportsQuery(params)).toEqual({
      type: REPORT_TYPE_REVENUE,
      from: '2026-01',
      to: '2026-08',
      costCenterId: '11111111-1111-4111-8111-111111111111',
      situation: 'open',
      categoryId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('buildReportsSearchParams não escreve tenantId nem costCenterId', () => {
    const next = buildReportsSearchParams({
      from: '2026-01',
      to: '2026-08',
      costCenterId: null,
      situation: null,
      categoryId: null,
    });
    expect(next.get('type')).toBe('revenue');
    expect(next.get('from')).toBe('2026-01');
    expect(next.get('to')).toBe('2026-08');
    expect(next.get('tenantId')).toBeNull();
    expect(next.get('costCenterId')).toBeNull();
    expect(next.get('status')).toBeNull();
  });

  it('valida intervalo invertido e teto de 24 meses', () => {
    expect(validateReportMonthRange('2026-08', '2026-01')).toBe('inverted');
    expect(validateReportMonthRange('2025-01', '2027-01')).toBe('too_large');
    expect(validateReportMonthRange('2026-01', '2026-08')).toBeNull();
  });
});

describe('reportsRevenuePath', () => {
  it('monta GET /reports/revenue com from/to e filtros AND', () => {
    expect(
      reportsRevenuePath({
        from: '2026-01',
        to: '2026-08',
        costCenterId: '11111111-1111-4111-8111-111111111111',
        situation: 'overdue',
        categoryId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toBe(
      '/reports/revenue?from=2026-01&to=2026-08&costCenter=11111111-1111-4111-8111-111111111111&situation=overdue&category=22222222-2222-4222-8222-222222222222',
    );
  });
});
