import { describe, expect, it } from 'vitest';

import { sanitizeSpreadsheetText } from '../src/modules/reports/exporters/sanitize-spreadsheet-text.js';
import {
  buildRevenueExportFilename,
  revenueExportContentDisposition,
} from '../src/modules/reports/exporters/build-revenue-export-filename.js';

describe('sanitizeSpreadsheetText', () => {
  it('neutraliza prefixos de fórmula', () => {
    expect(sanitizeSpreadsheetText('=1+1')).toBe("'=1+1");
    expect(sanitizeSpreadsheetText('+cmd')).toBe("'+cmd");
    expect(sanitizeSpreadsheetText('-1+1')).toBe("'-1+1");
    expect(sanitizeSpreadsheetText('@SUM(1)')).toBe("'@SUM(1)");
    expect(sanitizeSpreadsheetText("'=1+1")).toBe("''=1+1");
  });

  it('preserva texto comum', () => {
    expect(sanitizeSpreadsheetText('Serviços')).toBe('Serviços');
    expect(sanitizeSpreadsheetText('  Centro A  ')).toBe('Centro A');
  });
});

describe('buildRevenueExportFilename', () => {
  it('gera nome previsível ASCII', () => {
    expect(buildRevenueExportFilename('2026-01', '2026-06', 'pdf')).toBe(
      'relatorio-receita-2026-01-a-2026-06.pdf',
    );
    expect(buildRevenueExportFilename('2026-01', '2026-06', 'xlsx')).toBe(
      'relatorio-receita-2026-01-a-2026-06.xlsx',
    );
  });

  it('recusa from/to que não sejam YYYY-MM', () => {
    expect(() => buildRevenueExportFilename('2026-1', '2026-06', 'pdf')).toThrow(/YYYY-MM/);
    expect(() => buildRevenueExportFilename('../etc', '2026-06', 'pdf')).toThrow(/YYYY-MM/);
    expect(() =>
      revenueExportContentDisposition('relatorio-receita-2026-01-a-2026-06.pdf"; filename="x'),
    ).toThrow(/inseguro/);
  });
});
