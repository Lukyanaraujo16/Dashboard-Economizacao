import { describe, expect, it } from 'vitest';

import { listInclusiveMonthKeysFromKeys } from '../src/modules/analytics/domain/civil-calendar.js';
import { ValidationError } from '../src/shared/errors/application-error.js';
import { parseReportMonthRange } from '../src/modules/reports/http/parse-report-month-range.js';

describe('parseReportMonthRange', () => {
  it('aceita intervalo inclusivo YYYY-MM', () => {
    expect(parseReportMonthRange({ from: '2026-01', to: '2026-08' })).toEqual({
      from: '2026-01',
      to: '2026-08',
      monthKeys: listInclusiveMonthKeysFromKeys('2026-01', '2026-08'),
    });
    expect(parseReportMonthRange({ from: '2026-01', to: '2026-08' }).monthKeys).toHaveLength(8);
  });

  it('aceita um único mês', () => {
    expect(parseReportMonthRange({ from: '2026-08', to: '2026-08' }).monthKeys).toEqual(['2026-08']);
  });

  it('rejeita from/to ausentes ou inválidos', () => {
    expect(() => parseReportMonthRange({})).toThrow(ValidationError);
    expect(() => parseReportMonthRange({ from: '2026-01' })).toThrow(/to deve estar/);
    expect(() => parseReportMonthRange({ from: '2026-1', to: '2026-08' })).toThrow(/YYYY-MM/);
    expect(() => parseReportMonthRange({ from: '2026-13', to: '2026-08' })).toThrow(/YYYY-MM/);
  });

  it('rejeita from posterior a to', () => {
    expect(() => parseReportMonthRange({ from: '2026-08', to: '2026-01' })).toThrow(
      /from não pode ser posterior/,
    );
  });

  it('rejeita amplitude acima de 24 meses civis', () => {
    expect(() => parseReportMonthRange({ from: '2025-01', to: '2027-01' })).toThrow(/24 meses/);
    expect(parseReportMonthRange({ from: '2025-01', to: '2026-12' }).monthKeys).toHaveLength(24);
  });
});
