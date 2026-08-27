import { describe, expect, it } from 'vitest';

import type { PlatformBrandingRecord, StoredFileRecord, TenantBrandingRecord } from '../src/modules/branding/domain/types.js';
import { resolveReportPdfBranding } from '../src/modules/reports/exporters/report-pdf-branding.js';
import {
  EMPTY_REVENUE_PDF_NOTICE,
  formatReportPdfPeriod,
} from '../src/modules/reports/exporters/report-pdf-presentation.js';
import { renderExpensesReportPdf } from '../src/modules/reports/exporters/expenses-pdf.exporter.js';
import { renderRevenueReportPdf } from '../src/modules/reports/exporters/revenue-pdf.exporter.js';
import type { ExpensesExportContext } from '../src/modules/reports/exporters/expenses-export-presentation.js';
import type { RevenueExportContext } from '../src/modules/reports/exporters/revenue-export-presentation.js';
import type { ExpensesReportResponse, RevenueReportResponse } from '../src/modules/reports/domain/types.js';
import { PNG_1X1 } from './helpers/image-fixtures.js';
import { decodedPdfStrings } from './helpers/readable-pdf.js';

const generatedAt = new Date('2026-08-25T19:45:00.000Z');

function storedFile(overrides: Partial<StoredFileRecord> = {}): StoredFileRecord {
  return {
    id: 'file-logo',
    tenantId: 'tenant-alfa',
    fileType: 'TENANT_LOGO',
    storageKey: 'tenants/tenant-alfa/branding/uuid.png',
    mimeType: 'image/png',
    size: PNG_1X1.length,
    checksum: 'checksum',
    createdAt: generatedAt,
    ...overrides,
  };
}

function tenantBranding(overrides: Partial<TenantBrandingRecord> = {}): TenantBrandingRecord {
  return {
    id: 'branding-1',
    tenantId: 'tenant-alfa',
    logoFileId: 'file-logo',
    iconFileId: 'file-icon',
    logoFile: storedFile(),
    iconFile: storedFile({
      id: 'file-icon',
      fileType: 'TENANT_ICON',
      storageKey: 'tenants/tenant-alfa/branding/icon.png',
    }),
    lightColors: null,
    darkColors: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...overrides,
  };
}

function platformBranding(overrides: Partial<PlatformBrandingRecord> = {}): PlatformBrandingRecord {
  return {
    id: 'platform-1',
    name: 'Economização',
    logoFileId: 'platform-logo',
    iconFileId: 'platform-icon',
    faviconFileId: null,
    logoFile: storedFile({
      id: 'platform-logo',
      tenantId: null,
      fileType: 'PLATFORM_LOGO',
      storageKey: 'platform/branding/logo/uuid.png',
    }),
    iconFile: storedFile({
      id: 'platform-icon',
      tenantId: null,
      fileType: 'PLATFORM_ICON',
      storageKey: 'platform/branding/icon/uuid.png',
    }),
    faviconFile: null,
    lightColors: null,
    darkColors: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...overrides,
  };
}

function emptyReceivables() {
  return {
    total: '0',
    received: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null as string | null,
    items: [] as RevenueReportResponse['receivables']['items'],
  };
}

function revenueMonth(monthKey: string, total = '0'): RevenueReportResponse['months'][number] {
  return {
    monthKey,
    receivables: {
      total,
      received: '0',
      outstanding: total,
      overdue: '0',
      classified: total,
      uncategorized: '0',
      imprecise: '0',
      coverageRate: total === '0' ? null : '100',
      items: [],
      daily: [],
    },
  };
}

function monthKeys(from: string, count: number): string[] {
  const [year, month] = from.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year ?? 2025, (month ?? 1) - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function revenueReport(overrides: Partial<RevenueReportResponse> = {}): RevenueReportResponse {
  return {
    today: '2026-08-25',
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
    months: [revenueMonth('2026-01', '10000'), revenueMonth('2026-02', '5000')],
    ...overrides,
  };
}

function expensesReport(overrides: Partial<ExpensesReportResponse> = {}): ExpensesReportResponse {
  const base = revenueReport();
  return {
    today: base.today,
    from: base.from,
    to: base.to,
    payables: {
      total: base.receivables.total,
      paid: base.receivables.received,
      outstanding: base.receivables.outstanding,
      overdue: base.receivables.overdue,
      classified: base.receivables.classified,
      uncategorized: base.receivables.uncategorized,
      imprecise: base.receivables.imprecise,
      coverageRate: base.receivables.coverageRate,
      items: base.receivables.items.map((item) => ({
        kind: item.kind,
        name: item.name === 'Serviços' ? 'Aluguel' : item.name,
        amount: item.amount,
        paid: item.received,
        outstanding: item.outstanding,
        percentage: item.percentage,
      })),
    },
    months: base.months.map((month) => ({
      monthKey: month.monthKey,
      payables: {
        total: month.receivables.total,
        paid: month.receivables.received,
        outstanding: month.receivables.outstanding,
        overdue: month.receivables.overdue,
        classified: month.receivables.classified,
        uncategorized: month.receivables.uncategorized,
        imprecise: month.receivables.imprecise,
        coverageRate: month.receivables.coverageRate,
        items: [],
        daily: [],
      },
    })),
    ...overrides,
  };
}

function revenueContext(
  reportBody: RevenueReportResponse = revenueReport(),
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

function expensesContext(
  reportBody: ExpensesReportResponse = expensesReport(),
  extras: Partial<ExpensesExportContext> = {},
): ExpensesExportContext {
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

describe('PRE-IA-4D apresentação PDF compartilhada', () => {
  it('formata período longo e intervalo em pt-BR', () => {
    expect(formatReportPdfPeriod('2026-08', '2026-08')).toBe('Agosto de 2026');
    expect(formatReportPdfPeriod('2026-01', '2026-08')).toBe('Jan/2026 a Ago/2026');
  });

  it('Receita e Despesas compartilham header, footer, filtros e paginação', async () => {
    const filters = {
      costCenter: 'Operações',
      situation: 'Em aberto',
      category: 'Materiais de consumo',
    };
    const revenueText = decodedPdfStrings(
      await renderRevenueReportPdf(revenueContext(revenueReport(), { filters })),
    );
    const expensesText = decodedPdfStrings(
      await renderExpensesReportPdf(expensesContext(expensesReport(), { filters })),
    );

    for (const text of [revenueText, expensesText]) {
      expect(text).toContain('Dashboard Economiza');
      expect(text).toContain('Empresa Alfa');
      expect(text).toContain('Jan/2026 a Fev/2026');
      expect(text).toContain('Relatório gerado em');
      expect(text).toContain('Página 1 de');
      expect(text).toContain('Centro de custo: Operações');
      expect(text).not.toContain('Situação:');
      expect(text).toContain('Categoria: Materiais de consumo');
      expect(text).not.toContain('settled');
      expect(text).not.toContain('open');
      expect(text).not.toContain('overdue');
      expect(text).not.toContain('tenant-');
      expect(text).not.toContain('tenants/');
      expect(text).not.toContain('localhost');
    }
    expect(revenueText).toContain('RELAT');
    expect(expensesText).toContain('RELAT');
    expect(revenueText).toContain('REGIME DE CAIXA');
    expect(expensesText).toContain('REGIME DE CAIXA');
    expect(revenueText).toContain('Faturamento');
    expect(revenueText).toContain('Entradas');
    expect(expensesText).toContain('Despesas');
    expect(expensesText).toContain('Sa');
  });

  it('CASH-6-CLOSE — chip Categoria: Todas permanece íntegro no PDF', async () => {
    const filters = {
      costCenter: 'Todos',
      situation: '—',
      category: 'Todas',
    };
    for (const text of [
      decodedPdfStrings(await renderRevenueReportPdf(revenueContext(revenueReport(), { filters }))),
      decodedPdfStrings(await renderExpensesReportPdf(expensesContext(expensesReport(), { filters }))),
    ]) {
      expect(text).toContain('Categoria: Todas');
      expect(text).toContain('Centro de custo: Todos');
      expect(text).toContain('REGIME DE CAIXA');
      expect(text).not.toMatch(/Categoria:\s*\n\s*Todas/);
    }
  });

  it('PDF de 1 mês usa rótulo longo e valores oficiais do DTO', async () => {
    const report = revenueReport({
      from: '2026-08',
      to: '2026-08',
      months: [revenueMonth('2026-08', '15000')],
    });
    const text = decodedPdfStrings(await renderRevenueReportPdf(revenueContext(report)));
    expect(text).toContain('Agosto de 2026');
    expect(text).toContain('15.000,00');
    expect(text).toContain('8.000,00');
    expect(text).toContain('7.000,00');
  });

  it('PDF empty mantém contexto, cobertura nula e não inventa 0%', async () => {
    const empty = revenueReport({
      from: '2024-01',
      to: '2024-01',
      receivables: emptyReceivables(),
      months: [revenueMonth('2024-01', '0')],
    });
    const pdf = await renderRevenueReportPdf(revenueContext(empty));
    const text = decodedPdfStrings(pdf);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(text).toContain(EMPTY_REVENUE_PDF_NOTICE);
    expect(text).toContain('Empresa Alfa');
    expect(text).toContain('Janeiro de 2024');
    expect(text).toContain('Página 1');
    expect(text).not.toContain('0%');
  });

  it('24 meses e várias categorias geram multipágina com footer', async () => {
    const keys = monthKeys('2024-01', 24);
    const items = Array.from({ length: 12 }, (_, index) => ({
      kind: 'category' as const,
      name: `Categoria ${index + 1}`,
      amount: '1000',
      received: '400',
      outstanding: '600',
      percentage: '8.3',
    }));
    const report = revenueReport({
      from: '2024-01',
      to: '2025-12',
      receivables: {
        ...revenueReport().receivables,
        total: '12000',
        items,
      },
      months: keys.map((key) => revenueMonth(key, '500')),
    });
    const pdf = await renderRevenueReportPdf(revenueContext(report));
    const text = decodedPdfStrings(pdf);
    expect(text).toContain('Página 1 de');
    expect(text).toContain('Página 2');
    expect(text).toContain('Categoria 1');
    expect(text).toContain('Categoria 12');
    expect(text).toContain('jan/2024');
    expect(text).toContain('dez/2025');
    expect(text).toContain('Relatório gerado em');
  });

  it('logo principal entra no PDF; logo ausente usa wordmark; corrompida não derruba o documento', async () => {
    const withLogo = await renderRevenueReportPdf(
      revenueContext(revenueReport(), { pdfBranding: { logo: PNG_1X1 } }),
    );
    expect(withLogo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(withLogo.toString('latin1')).toMatch(/\/Image/);
    expect(decodedPdfStrings(withLogo)).not.toContain('tenants/tenant-alfa/branding/uuid.png');

    const withoutLogo = await renderRevenueReportPdf(
      revenueContext(revenueReport(), { pdfBranding: { logo: null } }),
    );
    expect(withoutLogo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(decodedPdfStrings(withoutLogo)).toContain('Dashboard Economiza');

    const corrupted = await renderRevenueReportPdf(
      revenueContext(revenueReport(), { pdfBranding: { logo: Buffer.from('not-an-image') } }),
    );
    expect(corrupted.subarray(0, 5).toString()).toBe('%PDF-');
    expect(decodedPdfStrings(corrupted)).toContain('Dashboard Economiza');
    expect(decodedPdfStrings(corrupted)).toContain('15.000,00');
  });
});

describe('resolveReportPdfBranding', () => {
  it('usa logo principal do tenant e nunca o ícone compacto', async () => {
    const requested: string[] = [];
    const resolved = await resolveReportPdfBranding({
      tenantId: 'tenant-alfa',
      tenantBranding: {
        findByTenantId: async () => tenantBranding(),
      },
      platformBranding: {
        get: async () => platformBranding(),
      },
      storage: {
        get: async (key) => {
          requested.push(key);
          return PNG_1X1;
        },
      },
    });
    expect(requested).toEqual(['tenants/tenant-alfa/branding/uuid.png']);
    expect(resolved.logo?.equals(PNG_1X1)).toBe(true);
  });

  it('cai para logo principal da plataforma quando o tenant só tem ícone', async () => {
    const requested: string[] = [];
    const resolved = await resolveReportPdfBranding({
      tenantId: 'tenant-alfa',
      tenantBranding: {
        findByTenantId: async () =>
          tenantBranding({
            logoFileId: null,
            logoFile: null,
          }),
      },
      platformBranding: {
        get: async () => platformBranding(),
      },
      storage: {
        get: async (key) => {
          requested.push(key);
          return PNG_1X1;
        },
      },
    });
    expect(requested).toEqual(['platform/branding/logo/uuid.png']);
    expect(resolved.logo?.equals(PNG_1X1)).toBe(true);
  });

  it('retorna null quando branding e storage falham', async () => {
    await expect(
      resolveReportPdfBranding({
        tenantId: 'tenant-alfa',
        tenantBranding: {
          findByTenantId: async () => {
            throw new Error('db down');
          },
        },
        platformBranding: {
          get: async () => null,
        },
        storage: {
          get: async () => {
            throw new Error('missing');
          },
        },
      }),
    ).resolves.toEqual({ logo: null });

    await expect(
      resolveReportPdfBranding({
        tenantId: null,
        tenantBranding: {
          findByTenantId: async () => null,
        },
        platformBranding: {
          get: async () => platformBranding(),
        },
        storage: {
          get: async () => {
            throw new Error('corrupt');
          },
        },
      }),
    ).resolves.toEqual({ logo: null });
  });
});
