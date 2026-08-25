import { describe, expect, it } from 'vitest';

import { ValidationError } from '../src/shared/errors/application-error.js';
import { parseReportExportFormat } from '../src/modules/reports/http/parse-report-export-format.js';

describe('parseReportExportFormat', () => {
  it('omite format como JSON', () => {
    expect(parseReportExportFormat({})).toBe('json');
    expect(parseReportExportFormat({ from: '2026-01' })).toBe('json');
    expect(parseReportExportFormat({ format: '' })).toBe('json');
  });

  it('aceita pdf e xlsx', () => {
    expect(parseReportExportFormat({ format: 'pdf' })).toBe('pdf');
    expect(parseReportExportFormat({ format: 'XLSX' })).toBe('xlsx');
    expect(parseReportExportFormat({ format: 'json' })).toBe('json');
  });

  it('rejeita format inválido', () => {
    expect(() => parseReportExportFormat({ format: 'csv' })).toThrow(ValidationError);
    expect(() => parseReportExportFormat({ format: 'pdf ' })).not.toThrow();
    expect(() => parseReportExportFormat({ format: 1 })).toThrow(/format deve ser pdf ou xlsx/);
  });
});
