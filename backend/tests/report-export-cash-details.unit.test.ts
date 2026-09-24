import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  type CalculateMonthlyCashFlowInput,
  type CashCostCenterAllocationSource,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../src/modules/finance/domain/types.js';
import { collectReportCashDetailUniverse } from '../src/modules/reports/domain/report-cash-details.js';
import {
  buildExportLancamentosRows,
  COST_CENTER_SPLIT_EXPORT_NOTICE,
  exportBlockTitle,
  exportSituationLabel,
  formatExportCivilDate,
  formatJoinedExportNames,
} from '../src/modules/reports/exporters/report-export-cash-details.js';
import { renderRevenueReportPdf } from '../src/modules/reports/exporters/revenue-pdf.exporter.js';
import { renderRevenueReportXlsx } from '../src/modules/reports/exporters/revenue-xlsx.exporter.js';
import type { RevenueExportContext } from '../src/modules/reports/exporters/revenue-export-presentation.js';
import type { RevenueReportResponse } from '../src/modules/reports/domain/types.js';
import { renderExpensesReportPdf } from '../src/modules/reports/exporters/expenses-pdf.exporter.js';
import { renderExpensesReportXlsx } from '../src/modules/reports/exporters/expenses-xlsx.exporter.js';
import type { ExpensesExportContext } from '../src/modules/reports/exporters/expenses-export-presentation.js';
import type { ExpensesReportResponse } from '../src/modules/reports/domain/types.js';
import { decodedPdfStrings } from './helpers/readable-pdf.js';
import { Workbook } from 'exceljs';

const TODAY = new Date('2026-09-15T00:00:00.000Z');
const SEP = civilMonthBoundsFromKey('2026-09');
const JAN = civilMonthBoundsFromKey('2026-01');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function civil(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function installment(input: {
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly status?: FinancialInstallmentReadRecord['status'];
  readonly categoryExternalIds?: readonly string[];
  readonly description?: string | null;
  readonly partyId?: string | null;
}): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  const total = dec(input.total ?? unpaid.plus(paid).toString());
  return {
    id: input.externalId,
    tenantId: 't1',
    integrationId: 'i1',
    externalId: input.externalId,
    description: input.description ?? null,
    dueDate: civil(input.dueDate),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: null,
    total,
    paid,
    unpaid,
    partyId: input.partyId ?? null,
    categoryExternalIds: input.categoryExternalIds ?? [],
    syncedAt: TODAY,
  };
}

function settlement(input: {
  readonly settlementExternalId: string;
  readonly installmentExternalId: string;
  readonly occurredOn: string;
  readonly netAmount: string;
  readonly type?: 'RECEIPT' | 'DISBURSEMENT';
  readonly kind?: 'RECEIVABLE' | 'PAYABLE';
}): CashSettlementSource {
  const type = input.type ?? 'RECEIPT';
  return {
    settlementExternalId: input.settlementExternalId,
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.kind ?? (type === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE'),
    transactionType: type,
    occurredOn: civil(input.occurredOn),
    netAmount: dec(input.netAmount),
  };
}

function category(
  externalId: string,
  name: string,
  type: FinancialCategoryReadRecord['type'],
): Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'> {
  return { externalId, name, type };
}

function allocation(
  amount: string,
  row: FinancialInstallmentReadRecord,
): CashCostCenterAllocationSource {
  return { amount: dec(amount), installment: row };
}

function cashInput(
  partial: Partial<CalculateMonthlyCashFlowInput> &
    Pick<CalculateMonthlyCashFlowInput, 'settlements' | 'receivables' | 'payables'>,
): CalculateMonthlyCashFlowInput {
  const realized = new Map<string, FinancialInstallmentReadRecord>();
  for (const row of partial.receivables) {
    realized.set(`RECEIVABLE:${row.externalId}`, row);
  }
  for (const row of partial.payables) {
    realized.set(`PAYABLE:${row.externalId}`, row);
  }
  return {
    tenantId: 't1',
    today: TODAY,
    from: SEP.from,
    to: SEP.to,
    realizedInstallments: realized,
    categories: [
      category('serv', 'Serviços', 'REVENUE'),
      category('alug', 'Aluguel', 'EXPENSE'),
    ],
    categoryFilter: null,
    ...partial,
  };
}

function universeOf(
  cashFlowInput: CalculateMonthlyCashFlowInput,
  direction: 'revenue' | 'expenses',
  situation: 'REALIZED' | 'EXPECTED' | 'OVERDUE',
  extras?: {
    readonly partyNames?: ReadonlyMap<string, string>;
    readonly costCenterNamesByInstallment?: ReadonlyMap<string, readonly string[]>;
    readonly filteredCostCenterName?: string | null;
  },
) {
  return collectReportCashDetailUniverse({
    cashFlowInput,
    direction,
    situation,
    partyNames: extras?.partyNames ?? new Map(),
    costCenterNamesByInstallment: extras?.costCenterNamesByInstallment ?? new Map(),
    filteredCostCenterName: extras?.filteredCostCenterName ?? null,
  });
}

function revenueReport(overrides: Partial<RevenueReportResponse> = {}): RevenueReportResponse {
  return {
    today: '2026-09-15',
    from: '2026-09',
    to: '2026-09',
    receivables: {
      total: '1400',
      received: '1000',
      outstanding: '400',
      overdue: '150',
      classified: '1000',
      uncategorized: '0',
      imprecise: '0',
      coverageRate: '100',
      items: [],
    },
    months: [
      {
        monthKey: '2026-09',
        receivables: {
          total: '1400',
          received: '1000',
          outstanding: '400',
          overdue: '150',
          classified: '1000',
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

function expensesReport(overrides: Partial<ExpensesReportResponse> = {}): ExpensesReportResponse {
  return {
    today: '2026-09-15',
    from: '2026-09',
    to: '2026-09',
    payables: {
      total: '1080',
      paid: '1000',
      outstanding: '80',
      overdue: '25',
      classified: '1000',
      uncategorized: '0',
      imprecise: '0',
      coverageRate: '100',
      items: [],
    },
    months: [
      {
        monthKey: '2026-09',
        payables: {
          total: '1080',
          paid: '1000',
          outstanding: '80',
          overdue: '25',
          classified: '1000',
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

describe('exportação de lançamentos (fonte canônica)', () => {
  it('formata data civil sem deslocar fuso e une nomes', () => {
    expect(formatExportCivilDate(civil('2026-09-15'))).toBe('15/09/2026');
    expect(formatExportCivilDate(civil('2026-01-01'))).toBe('01/01/2026');
    expect(formatJoinedExportNames(['Centro A', 'Centro B'])).toBe('Centro A · Centro B');
    expect(exportSituationLabel('revenue', 'EXPECTED')).toBe('A receber');
    expect(exportSituationLabel('expenses', 'EXPECTED')).toBe('A pagar');
    expect(exportBlockTitle('revenue', 'REALIZED')).toBe('Entradas realizadas');
    expect(exportBlockTitle('expenses', 'REALIZED')).toBe('Saídas realizadas');
  });

  it('reconcilia SUM das situações com o MonthlyCashFlow de receita', () => {
    const open = installment({
      externalId: 'r-open',
      dueDate: '2026-09-20',
      unpaid: '400',
      categoryExternalIds: ['serv'],
      description: 'Aberto',
      partyId: 'p1',
    });
    const overdue = installment({
      externalId: 'r-od',
      dueDate: '2026-09-01',
      unpaid: '150',
      categoryExternalIds: ['serv'],
      description: 'Vencido',
    });
    const paid = installment({
      externalId: 'r-paid',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '1000',
      status: 'PAID',
      categoryExternalIds: ['serv'],
      description: 'Baixa',
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-1',
          installmentExternalId: 'r-paid',
          occurredOn: '2026-09-03',
          netAmount: '1000',
        }),
      ],
      receivables: [open, overdue, paid],
      payables: [],
    });
    const flow = calculateMonthlyCashFlow(input);
    const realized = universeOf(input, 'revenue', 'REALIZED', {
      partyNames: new Map([['p1', 'Cliente Alpha']]),
    });
    const expected = universeOf(input, 'revenue', 'EXPECTED', {
      partyNames: new Map([['p1', 'Cliente Alpha']]),
    });
    const overdueU = universeOf(input, 'revenue', 'OVERDUE');
    expect(realized.totalAmount?.toString()).toBe(flow.realized.inflows?.toString());
    expect(expected.totalAmount?.toString()).toBe(flow.expected.receivables?.toString());
    expect(overdueU.totalAmount?.toString()).toBe(flow.overdue.ofMonth.receivables?.toString());
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe(
      flow.realized.inflows!.plus(flow.expected.receivables!).toString(),
    );
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe('1400');
    expect(overdueU.totalAmount!.toString()).toBe('150');
  });

  it('reconcilia SUM das situações com o MonthlyCashFlow de despesa', () => {
    const open = installment({
      externalId: 'p-open',
      dueDate: '2026-09-22',
      unpaid: '80',
      categoryExternalIds: ['alug'],
      description: 'Aberto',
    });
    const overdue = installment({
      externalId: 'p-od',
      dueDate: '2026-09-01',
      unpaid: '25',
      categoryExternalIds: ['alug'],
      description: 'Vencido',
    });
    const paid = installment({
      externalId: 'p-paid',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '1000',
      status: 'PAID',
      categoryExternalIds: ['alug'],
      description: 'Baixa',
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-p',
          installmentExternalId: 'p-paid',
          occurredOn: '2026-09-03',
          netAmount: '1000',
          type: 'DISBURSEMENT',
          kind: 'PAYABLE',
        }),
      ],
      receivables: [],
      payables: [open, overdue, paid],
    });
    const flow = calculateMonthlyCashFlow(input);
    const realized = universeOf(input, 'expenses', 'REALIZED');
    const expected = universeOf(input, 'expenses', 'EXPECTED');
    const overdueU = universeOf(input, 'expenses', 'OVERDUE');
    expect(realized.totalAmount?.toString()).toBe(flow.realized.outflows?.toString());
    expect(expected.totalAmount?.toString()).toBe(flow.expected.payables?.toString());
    expect(overdueU.totalAmount?.toString()).toBe(flow.overdue.ofMonth.payables?.toString());
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe(
      flow.realized.outflows!.plus(flow.expected.payables!).toString(),
    );
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe('1080');
    expect(overdueU.totalAmount!.toString()).toBe('25');
  });

  it('rateio 1000/600/400 não duplica linha e respeita filtro', () => {
    const paid = installment({
      externalId: 'r-split',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '1000',
      status: 'PAID',
      categoryExternalIds: ['serv'],
      description: 'Rateio',
    });
    const base = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-split',
          installmentExternalId: 'r-split',
          occurredOn: '2026-09-03',
          netAmount: '1000',
        }),
      ],
      receivables: [paid],
      payables: [],
    });
    const all = universeOf(base, 'revenue', 'REALIZED', {
      costCenterNamesByInstallment: new Map([['RECEIVABLE:r-split', ['Centro A', 'Centro B']]]),
    });
    expect(all.items).toHaveLength(1);
    expect(all.items[0]?.amount.toString()).toBe('1000');
    expect(all.items[0]?.costCenterNames).toEqual(['Centro A', 'Centro B']);

    const filterA = universeOf(
      {
        ...base,
        costCenter: {
          expectedReceivables: [],
          expectedPayables: [],
          realizedReceivables: [allocation('600', paid)],
          realizedPayables: [],
        },
      },
      'revenue',
      'REALIZED',
      { filteredCostCenterName: 'Centro A' },
    );
    expect(filterA.items).toHaveLength(1);
    expect(filterA.items[0]?.amount.toString()).toBe('600');

    const filterB = universeOf(
      {
        ...base,
        costCenter: {
          expectedReceivables: [],
          expectedPayables: [],
          realizedReceivables: [allocation('400', paid)],
          realizedPayables: [],
        },
      },
      'revenue',
      'REALIZED',
      { filteredCostCenterName: 'Centro B' },
    );
    expect(filterB.items).toHaveLength(1);
    expect(filterB.items[0]?.amount.toString()).toBe('400');
  });

  it('Excel e PDF de receita exportam o universo completo, sem paginação', async () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      installment({
        externalId: `r-${index}`,
        dueDate: '2026-09-20',
        unpaid: '0',
        paid: '10',
        status: 'PAID',
        categoryExternalIds: ['serv'],
        description: `Linha ${index}`,
      }),
    );
    const expectedRow = installment({
      externalId: 'r-open',
      dueDate: '2026-09-20',
      unpaid: '400',
      categoryExternalIds: ['serv'],
      description: 'Parcela a receber',
    });
    const overdueRow = installment({
      externalId: 'r-od',
      dueDate: '2026-09-01',
      unpaid: '150',
      categoryExternalIds: ['serv'],
      description: 'Parcela vencida',
    });
    const input = cashInput({
      from: JAN.from,
      to: SEP.to,
      settlements: items.map((row, index) =>
        settlement({
          settlementExternalId: `ft-${index}`,
          installmentExternalId: row.externalId,
          occurredOn: index < 20 ? '2026-01-10' : '2026-09-10',
          netAmount: '10',
        }),
      ),
      receivables: [...items, expectedRow, overdueRow],
      payables: [],
    });
    const realized = universeOf(input, 'revenue', 'REALIZED');
    const expected = universeOf(input, 'revenue', 'EXPECTED');
    const overdue = universeOf(input, 'revenue', 'OVERDUE');
    expect(realized.items).toHaveLength(40);
    expect(expected.items).toHaveLength(1);
    expect(overdue.items).toHaveLength(1);
    const context: RevenueExportContext = {
      report: revenueReport({
        from: '2026-01',
        to: '2026-09',
        receivables: {
          ...revenueReport().receivables,
          total: '800',
          received: '400',
          outstanding: '400',
          overdue: '150',
        },
      }),
      companyName: 'Empresa Alfa',
      generatedAt: TODAY,
      filters: { costCenter: 'Todos', situation: 'Todas', category: 'Todas' },
      cashDetails: { realized, expected, overdue },
    };
    const xlsx = await renderRevenueReportXlsx(context);
    const workbook = new Workbook();
    await workbook.xlsx.load(xlsx);
    const sheet = workbook.getWorksheet('Lançamentos');
    expect(sheet).toBeTruthy();
    expect(sheet?.getCell('C1').value).toBe('Cliente');
    expect(sheet?.rowCount).toBe(43);
    expect(sheet?.getCell('A2').value).toBe('10/09/2026');
    expect(typeof sheet?.getCell('G2').value).toBe('number');
    expect(sheet?.getCell('G2').value).toBe(10);
    expect(sheet?.getCell('F2').value).toBe('Realizado');
    const situations = [...Array(42).keys()].map((index) => sheet?.getCell(index + 2, 6).value);
    expect(situations).toContain('Realizado');
    expect(situations).toContain('A receber');
    expect(situations).toContain('Vencido');

    const pdf = await renderRevenueReportPdf(context);
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0).toBeGreaterThan(1);
    const text = decodedPdfStrings(pdf);
    expect(text).toContain('Lançamentos do período');
    expect(text).toContain('Entradas realizadas');
    expect(text).toContain('A receber');
    expect(text).toContain('Vencido');
    expect(text).toContain('Linha 0');
    expect(text).toContain('Linha 39');
    expect(text).toContain('Parcela a receber');
    expect(text).toContain('Parcela vencida');
    expect(text).toContain('10/09/2026');
    expect(text).toContain('10/01/2026');
    expect(text).toContain('01/09/2026');
    expect(text).toContain('800,00');
    expect(text).toContain('400,00');
  });

  it('Excel e PDF de despesa usam Fornecedor e A pagar', async () => {
    const paid = installment({
      externalId: 'p-1',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '80',
      status: 'PAID',
      categoryExternalIds: ['alug'],
      description: 'Aluguel pago',
      partyId: 'forn',
    });
    const open = installment({
      externalId: 'p-2',
      dueDate: '2026-09-22',
      unpaid: '80',
      categoryExternalIds: ['alug'],
      description: 'Aluguel aberto',
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-p',
          installmentExternalId: 'p-1',
          occurredOn: '2026-09-03',
          netAmount: '80',
          type: 'DISBURSEMENT',
          kind: 'PAYABLE',
        }),
      ],
      receivables: [],
      payables: [paid, open],
    });
    const context: ExpensesExportContext = {
      report: expensesReport(),
      companyName: 'Empresa Alfa',
      generatedAt: TODAY,
      filters: { costCenter: 'Todos', situation: 'Todas', category: 'Todas' },
      cashDetails: {
        realized: universeOf(input, 'expenses', 'REALIZED', {
          partyNames: new Map([['forn', 'Fornecedor Z']]),
        }),
        expected: universeOf(input, 'expenses', 'EXPECTED'),
        overdue: universeOf(input, 'expenses', 'OVERDUE'),
      },
    };
    const workbook = new Workbook();
    await workbook.xlsx.load(await renderExpensesReportXlsx(context));
    const sheet = workbook.getWorksheet('Lançamentos');
    expect(sheet?.getCell('C1').value).toBe('Fornecedor');
    expect(String(sheet?.getCell('C2').value)).toContain('Fornecedor Z');
    expect(sheet?.getCell('F3').value).toBe('A pagar');
    const text = decodedPdfStrings(await renderExpensesReportPdf(context));
    expect(text).toContain('Saídas realizadas');
    expect(text).toContain('A pagar');
    expect(text).toContain('Fornecedor Z');
    expect(text).toContain('Aluguel pago');
  });

  it('split indisponível não vira zero no Excel nem no PDF', async () => {
    const unavailable = {
      available: false as const,
      unavailableReason: 'COST_CENTER_SPLIT' as const,
      situation: 'REALIZED' as const,
      direction: 'revenue' as const,
      totalAmount: null,
      items: [],
    };
    const emptyExpected = universeOf(
      cashInput({ settlements: [], receivables: [], payables: [] }),
      'revenue',
      'EXPECTED',
    );
    const context: RevenueExportContext = {
      report: revenueReport({
        receivables: {
          ...revenueReport().receivables,
          total: null,
          received: null,
        },
      }),
      companyName: 'Empresa Alfa',
      generatedAt: TODAY,
      filters: { costCenter: 'Centro X', situation: 'Todas', category: 'Todas' },
      cashDetails: {
        realized: unavailable,
        expected: emptyExpected,
        overdue: emptyExpected,
      },
    };
    const rows = buildExportLancamentosRows('revenue', context.cashDetails!);
    expect(rows.some((row) => row.description === COST_CENTER_SPLIT_EXPORT_NOTICE)).toBe(true);
    expect(rows.some((row) => row.amount === 0 && row.situation === 'Entradas realizadas')).toBe(
      false,
    );
    const workbook = new Workbook();
    await workbook.xlsx.load(await renderRevenueReportXlsx(context));
    const sheet = workbook.getWorksheet('Lançamentos');
    expect(String(sheet?.getCell('B2').value)).toMatch(/rateio por centro de custo/);
    expect(sheet?.getCell('G2').value).toBeNull();
    const text = decodedPdfStrings(await renderRevenueReportPdf(context));
    expect(text).toMatch(/rateio por centro de custo/);
    expect(text).not.toMatch(/Entradas realizadas[\s\S]{0,40}R\$\s*0,00/);
  });

  it('filtro de categoria na fonte canônica reduz o universo exportado', () => {
    const serv = installment({
      externalId: 'r-serv',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '70',
      status: 'PAID',
      categoryExternalIds: ['serv'],
      description: 'Serviço',
    });
    const other = installment({
      externalId: 'r-other',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '30',
      status: 'PAID',
      categoryExternalIds: ['prod'],
      description: 'Produto',
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-s',
          installmentExternalId: 'r-serv',
          occurredOn: '2026-09-03',
          netAmount: '70',
        }),
        settlement({
          settlementExternalId: 'ft-o',
          installmentExternalId: 'r-other',
          occurredOn: '2026-09-03',
          netAmount: '30',
        }),
      ],
      receivables: [serv, other],
      payables: [],
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
      categories: [
        category('serv', 'Serviços', 'REVENUE'),
        category('prod', 'Produtos', 'REVENUE'),
      ],
    });
    const realized = universeOf(input, 'revenue', 'REALIZED');
    expect(realized.items).toHaveLength(1);
    expect(realized.items[0]?.description).toBe('Serviço');
    expect(realized.totalAmount?.toString()).toBe('70');
  });
});
