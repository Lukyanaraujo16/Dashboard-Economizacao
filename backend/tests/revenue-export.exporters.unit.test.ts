import { ValueType, Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';

import { renderRevenueReportPdf } from '../src/modules/reports/exporters/revenue-pdf.exporter.js';
import { renderRevenueReportXlsx } from '../src/modules/reports/exporters/revenue-xlsx.exporter.js';
import type { RevenueExportContext } from '../src/modules/reports/exporters/revenue-export-presentation.js';
import type { RevenueReportResponse } from '../src/modules/reports/domain/types.js';
import { decodedPdfStrings } from './helpers/readable-pdf.js';

const generatedAt = new Date('2026-08-25T12:00:00.000Z');

function report(overrides: Partial<RevenueReportResponse> = {}): RevenueReportResponse {
  return {
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
          amount: '8000',
          received: '4000',
          outstanding: '4000',
          percentage: '53.3',
        },
        {
          kind: 'category',
          name: 'Serviços',
          amount: '7000',
          received: '5000',
          outstanding: '2000',
          percentage: '46.7',
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
          items: [],
          daily: [],
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
          items: [],
          daily: [],
        },
      },
    ],
    ...overrides,
  };
}

function context(
  reportBody: RevenueReportResponse = report(),
  extras: Partial<RevenueExportContext> = {},
): RevenueExportContext {
  return {
    report: reportBody,
    companyName: 'Empresa Alfa',
    generatedAt,
    filters: {
      costCenter: 'Todos',
      situation: 'Todas',
      category: 'Todas',
    },
    ...extras,
  };
}

describe('exporters de receita', () => {
  it('PDF formata o DTO oficial sem recalcular totais e preserva homônimos', async () => {
    const pdf = await renderRevenueReportPdf(context());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = decodedPdfStrings(pdf);
    expect(text).toContain('Dashboard Economiza');
    expect(text).toContain('Relat');
    expect(text).toContain('Empresa Alfa');
    expect(text).toContain('8.000,00');
    expect(text).toContain('7.000,00');
    expect(text).toContain('15.000,00');
    expect(text).not.toContain('tenant-');
    expect(text).not.toContain('descricao-secreta-nao-vazar');
  });

  it('PDF vazio informa ausência e não inventa cobertura 0%', async () => {
    const empty = report({
      from: '2024-01',
      to: '2024-01',
      receivables: {
        total: '0',
        received: '0',
        outstanding: '0',
        overdue: '0',
        classified: '0',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: null,
        items: [],
      },
      months: [
        {
          monthKey: '2024-01',
          receivables: {
            total: '0',
            received: '0',
            outstanding: '0',
            overdue: '0',
            classified: '0',
            uncategorized: '0',
            imprecise: '0',
            coverageRate: null,
            items: [],
            daily: [],
          },
        },
      ],
    });
    const pdf = await renderRevenueReportPdf(context(empty));
    const text = decodedPdfStrings(pdf);
    expect(text).toContain('intervalo selecionado');
    expect(text).not.toContain('0%');
  });

  it('XLSX gera abas, células numéricas, homônimos e bloqueia fórmula', async () => {
    const formulaContext = context(
      report({
        receivables: {
          ...report().receivables,
          items: [
            {
              kind: 'category',
              name: '=1+1',
              amount: '15000',
              received: '9000',
              outstanding: '6000',
              percentage: '100',
            },
          ],
        },
      }),
      { companyName: '+Empresa' },
    );
    const xlsx = await renderRevenueReportXlsx(formulaContext);
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    const workbook = new Workbook();
    await workbook.xlsx.load(xlsx);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumo', 'Mensal', 'Categorias']);

    const summary = workbook.getWorksheet('Resumo');
    expect(summary?.getCell('B8').value).toBe(15000);
    expect(typeof summary?.getCell('B8').value).toBe('number');
    expect(summary?.getCell('B2').value).toBe("'+Empresa");

    const monthly = workbook.getWorksheet('Mensal');
    expect(monthly?.getCell('B2').value).toBe(10000);
    expect(typeof monthly?.getCell('B2').value).toBe('number');

    const categories = workbook.getWorksheet('Categorias');
    expect(categories?.getCell('A2').value).toBe("'=1+1");
    expect(categories?.getCell('A2').type).not.toBe(ValueType.Formula);
    expect(typeof categories?.getCell('C2').value).toBe('number');
  });

  it('XLSX vazio mantém cobertura nula e aviso', async () => {
    const empty = report({
      receivables: {
        total: '0',
        received: '0',
        outstanding: '0',
        overdue: '0',
        classified: '0',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: null,
        items: [],
      },
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(await renderRevenueReportXlsx(context(empty)));
    const summary = workbook.getWorksheet('Resumo');
    expect(summary?.getCell('B13').value).toBeNull();
    expect(String(summary?.getCell('A14').value)).toMatch(/Não há receita/);
  });
});
