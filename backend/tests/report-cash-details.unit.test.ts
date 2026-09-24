import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../src/modules/finance/domain/types.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  type CalculateMonthlyCashFlowInput,
  type CashCostCenterAllocationSource,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';
import {
  buildReportCashDetails,
  collectReportCashDetailUniverse,
} from '../src/modules/reports/domain/report-cash-details.js';

const TODAY = new Date('2026-09-15T00:00:00.000Z');
const SEP = civilMonthBoundsFromKey('2026-09');
const JAN = civilMonthBoundsFromKey('2026-01');
const MAR = civilMonthBoundsFromKey('2026-03');

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
      category('prod', 'Produtos', 'REVENUE'),
      category('alug', 'Aluguel', 'EXPENSE'),
      category('sal', 'Salário', 'EXPENSE'),
    ],
    categoryFilter: null,
    ...partial,
  };
}

function detailsOf(
  cashFlowInput: CalculateMonthlyCashFlowInput,
  direction: 'revenue' | 'expenses',
  situation: 'REALIZED' | 'EXPECTED' | 'OVERDUE',
  extras?: {
    readonly partyNames?: ReadonlyMap<string, string>;
    readonly costCenterNamesByInstallment?: ReadonlyMap<string, readonly string[]>;
    readonly filteredCostCenterName?: string | null;
    readonly limit?: number;
    readonly offset?: number;
  },
) {
  return buildReportCashDetails({
    cashFlowInput,
    direction,
    situation,
    partyNames: extras?.partyNames ?? new Map(),
    costCenterNamesByInstallment: extras?.costCenterNamesByInstallment ?? new Map(),
    filteredCostCenterName: extras?.filteredCostCenterName ?? null,
    limit: extras?.limit ?? 100,
    offset: extras?.offset ?? 0,
  });
}

function sumItems(items: readonly { readonly amount: Prisma.Decimal }[]): string {
  return items.reduce((acc, item) => acc.plus(item.amount), dec('0')).toString();
}

describe('report-cash-details (fonte canônica)', () => {
  it('REALIZED/EXPECTED/OVERDUE de receita fecham com o MonthlyCashFlow', () => {
    const open = installment({
      externalId: 'r-open',
      dueDate: '2026-09-20',
      unpaid: '400',
      categoryExternalIds: ['serv'],
      description: 'Aberto',
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
    const realized = detailsOf(input, 'revenue', 'REALIZED');
    const expected = detailsOf(input, 'revenue', 'EXPECTED');
    const overdueDetails = detailsOf(input, 'revenue', 'OVERDUE');

    expect(realized.available).toBe(true);
    expect(realized.totalAmount?.toString()).toBe(flow.realized.inflows?.toString());
    expect(sumItems(realized.items)).toBe(flow.realized.inflows?.toString());
    expect(expected.totalAmount?.toString()).toBe(flow.expected.receivables?.toString());
    expect(sumItems(expected.items)).toBe(flow.expected.receivables?.toString());
    expect(overdueDetails.totalAmount?.toString()).toBe(flow.overdue.ofMonth.receivables?.toString());
    expect(sumItems(overdueDetails.items)).toBe(flow.overdue.ofMonth.receivables?.toString());
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe(
      flow.realized.inflows!.plus(flow.expected.receivables!).toString(),
    );
    expect(realized.items[0]?.date.toISOString()).toBe(civil('2026-09-03').toISOString());
    expect(expected.items[0]?.date.toISOString()).toBe(civil('2026-09-20').toISOString());
    expect(overdueDetails.items[0]?.date.toISOString()).toBe(civil('2026-09-01').toISOString());
  });

  it('REALIZED/EXPECTED/OVERDUE de despesa fecham com o MonthlyCashFlow', () => {
    const open = installment({
      externalId: 'p-open',
      dueDate: '2026-09-22',
      unpaid: '80',
      categoryExternalIds: ['alug'],
    });
    const overdue = installment({
      externalId: 'p-od',
      dueDate: '2026-09-04',
      unpaid: '25',
      categoryExternalIds: ['alug'],
    });
    const paid = installment({
      externalId: 'p-paid',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '300',
      status: 'PAID',
      categoryExternalIds: ['alug'],
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-p',
          installmentExternalId: 'p-paid',
          occurredOn: '2026-09-05',
          netAmount: '300',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [open, overdue, paid],
    });
    const flow = calculateMonthlyCashFlow(input);
    const realized = detailsOf(input, 'expenses', 'REALIZED');
    const expected = detailsOf(input, 'expenses', 'EXPECTED');
    const overdueDetails = detailsOf(input, 'expenses', 'OVERDUE');
    expect(realized.totalAmount?.toString()).toBe(flow.realized.outflows?.toString());
    expect(expected.totalAmount?.toString()).toBe(flow.expected.payables?.toString());
    expect(overdueDetails.totalAmount?.toString()).toBe(flow.overdue.ofMonth.payables?.toString());
    expect(realized.totalAmount!.plus(expected.totalAmount!).toString()).toBe(
      flow.realized.outflows!.plus(flow.expected.payables!).toString(),
    );
  });

  it('rateio 1000=600+400: Todos uma linha; filtro devolve a parcela', () => {
    const paid = installment({
      externalId: 'r-split',
      dueDate: '2026-09-10',
      unpaid: '0',
      paid: '1000',
      status: 'PAID',
      categoryExternalIds: ['serv'],
    });
    const base = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-split',
          installmentExternalId: 'r-split',
          occurredOn: '2026-09-11',
          netAmount: '1000',
        }),
      ],
      receivables: [paid],
      payables: [],
    });
    const all = detailsOf(base, 'revenue', 'REALIZED', {
      costCenterNamesByInstallment: new Map([['RECEIVABLE:r-split', ['Centro A', 'Centro B']]]),
    });
    expect(all.items).toHaveLength(1);
    expect(all.items[0]?.amount.toString()).toBe('1000');
    expect(all.items[0]?.costCenterNames).toEqual(['Centro A', 'Centro B']);
    expect(calculateMonthlyCashFlow(base).realized.inflows?.toString()).toBe('1000');

    const filteredA = cashInput({
      settlements: base.settlements,
      receivables: [paid],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [allocation('600', paid)],
        realizedPayables: [],
      },
    });
    const a = detailsOf(filteredA, 'revenue', 'REALIZED', { filteredCostCenterName: 'Centro A' });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]?.amount.toString()).toBe('600');
    expect(a.items[0]?.costCenterNames).toEqual(['Centro A']);
    expect(calculateMonthlyCashFlow(filteredA).realized.inflows?.toString()).toBe('600');

    const filteredB = cashInput({
      settlements: base.settlements,
      receivables: [paid],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [allocation('400', paid)],
        realizedPayables: [],
      },
    });
    const b = detailsOf(filteredB, 'revenue', 'REALIZED', { filteredCostCenterName: 'Centro B' });
    expect(b.items[0]?.amount.toString()).toBe('400');
    expect(calculateMonthlyCashFlow(filteredB).realized.inflows?.toString()).toBe('400');
  });

  it('EXPECTED/OVERDUE com rateio usam o split outstanding/overdue do motor', () => {
    const open = installment({
      externalId: 'r-open-cc',
      dueDate: '2026-09-28',
      unpaid: '1000',
      categoryExternalIds: ['serv'],
    });
    const overdue = installment({
      externalId: 'r-od-cc',
      dueDate: '2026-09-01',
      unpaid: '1000',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      settlements: [],
      receivables: [open, overdue],
      payables: [],
      costCenter: {
        expectedReceivables: [allocation('600', open), allocation('250', overdue)],
        expectedPayables: [],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });
    const flow = calculateMonthlyCashFlow(input);
    const expected = detailsOf(input, 'revenue', 'EXPECTED', { filteredCostCenterName: 'A' });
    const overdueDetails = detailsOf(input, 'revenue', 'OVERDUE', { filteredCostCenterName: 'A' });
    expect(expected.totalAmount?.toString()).toBe(flow.expected.receivables?.toString());
    expect(expected.items[0]?.amount.toString()).toBe('600');
    expect(overdueDetails.totalAmount?.toString()).toBe(flow.overdue.ofMonth.receivables?.toString());
    expect(overdueDetails.items[0]?.amount.toString()).toBe('250');
  });

  it('filtro de categoria precisa (D8) alinha detalhe e KPI', () => {
    const a = installment({
      externalId: 'r-a',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '100',
      status: 'PAID',
      categoryExternalIds: ['serv'],
    });
    const b = installment({
      externalId: 'r-b',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '70',
      status: 'PAID',
      categoryExternalIds: ['prod'],
    });
    const all = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-a',
          installmentExternalId: 'r-a',
          occurredOn: '2026-09-03',
          netAmount: '100',
        }),
        settlement({
          settlementExternalId: 'ft-b',
          installmentExternalId: 'r-b',
          occurredOn: '2026-09-04',
          netAmount: '70',
        }),
      ],
      receivables: [a, b],
      payables: [],
    });
    expect(detailsOf(all, 'revenue', 'REALIZED').totalAmount?.toString()).toBe('170');
    const onlyA = cashInput({
      settlements: all.settlements,
      receivables: [a, b],
      payables: [],
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
    });
    const filtered = detailsOf(onlyA, 'revenue', 'REALIZED');
    expect(filtered.items).toHaveLength(1);
    expect(filtered.totalAmount?.toString()).toBe('100');
    expect(calculateMonthlyCashFlow(onlyA).realized.inflows?.toString()).toBe('100');
  });

  it('intervalo multi-mês soma janeiro+fevereiro+março', () => {
    const jan = installment({
      externalId: 'r-jan',
      dueDate: '2026-01-10',
      unpaid: '0',
      paid: '100',
      status: 'PAID',
      categoryExternalIds: ['serv'],
    });
    const feb = installment({
      externalId: 'r-feb',
      dueDate: '2026-02-10',
      unpaid: '0',
      paid: '200',
      status: 'PAID',
      categoryExternalIds: ['serv'],
    });
    const mar = installment({
      externalId: 'r-mar',
      dueDate: '2026-03-10',
      unpaid: '0',
      paid: '300',
      status: 'PAID',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      from: JAN.from,
      to: MAR.to,
      settlements: [
        settlement({
          settlementExternalId: 'ft-jan',
          installmentExternalId: 'r-jan',
          occurredOn: '2026-01-12',
          netAmount: '100',
        }),
        settlement({
          settlementExternalId: 'ft-feb',
          installmentExternalId: 'r-feb',
          occurredOn: '2026-02-12',
          netAmount: '200',
        }),
        settlement({
          settlementExternalId: 'ft-mar',
          installmentExternalId: 'r-mar',
          occurredOn: '2026-03-12',
          netAmount: '300',
        }),
      ],
      receivables: [jan, feb, mar],
      payables: [],
    });
    const details = detailsOf(input, 'revenue', 'REALIZED');
    expect(details.totalAmount?.toString()).toBe('600');
    expect(details.items).toHaveLength(3);
    expect(calculateMonthlyCashFlow(input).realized.inflows?.toString()).toBe('600');
    expect(details.items.map((item) => item.settlementExternalId)).toEqual([
      'ft-mar',
      'ft-feb',
      'ft-jan',
    ]);
  });

  it('título DELETED não entra em expected/overdue; baixa órfã ainda conta no realizado', () => {
    const deleted = installment({
      externalId: 'r-del',
      dueDate: '2026-09-20',
      unpaid: '90',
      status: 'DELETED',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-ghost',
          installmentExternalId: 'r-paid',
          occurredOn: '2026-09-03',
          netAmount: '50',
        }),
      ],
      receivables: [deleted],
      payables: [],
    });
    const realized = detailsOf(input, 'revenue', 'REALIZED');
    expect(realized.totalAmount?.toString()).toBe('50');
    expect(detailsOf(input, 'revenue', 'EXPECTED').items).toEqual([]);
    expect(detailsOf(input, 'revenue', 'OVERDUE').items).toEqual([]);
  });

  it('split unavailable: available=false, totalAmount null, items vazios', () => {
    const partial = installment({
      externalId: 'r-partial',
      dueDate: '2026-09-10',
      unpaid: '400',
      paid: '600',
      total: '1000',
      status: 'PARTIALLY_PAID',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-partial',
          installmentExternalId: 'r-partial',
          occurredOn: '2026-09-11',
          netAmount: '600',
        }),
      ],
      receivables: [partial],
      payables: [],
      costCenter: {
        expectedReceivables: [allocation('400', partial)],
        expectedPayables: [],
        realizedReceivables: [allocation('400', partial)],
        realizedPayables: [],
      },
    });
    const flow = calculateMonthlyCashFlow(input);
    expect(flow.realized.inflows).toBeNull();
    const details = detailsOf(input, 'revenue', 'REALIZED');
    expect(details.available).toBe(false);
    expect(details.unavailableReason).toBe('COST_CENTER_SPLIT');
    expect(details.totalAmount).toBeNull();
    expect(details.items).toEqual([]);
  });

  it('paginação é determinística e totalAmount cobre o universo', () => {
    const rows = [1, 2, 3].map((n) =>
      installment({
        externalId: `r-${n}`,
        dueDate: '2026-09-02',
        unpaid: '0',
        paid: '10',
        status: 'PAID',
        categoryExternalIds: ['serv'],
      }),
    );
    const input = cashInput({
      settlements: rows.map((row, index) =>
        settlement({
          settlementExternalId: `ft-${index + 1}`,
          installmentExternalId: row.externalId,
          occurredOn: '2026-09-03',
          netAmount: '10',
        }),
      ),
      receivables: rows,
      payables: [],
    });
    const page1 = detailsOf(input, 'revenue', 'REALIZED', { limit: 2, offset: 0 });
    const page2 = detailsOf(input, 'revenue', 'REALIZED', { limit: 2, offset: 2 });
    expect(page1.itemCount).toBe(3);
    expect(page1.totalAmount?.toString()).toBe('30');
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    const ids = [...page1.items, ...page2.items].map((item) => item.settlementExternalId);
    expect(new Set(ids).size).toBe(3);
    const universe = collectReportCashDetailUniverse({
      cashFlowInput: input,
      direction: 'revenue',
      situation: 'REALIZED',
      partyNames: new Map(),
      costCenterNamesByInstallment: new Map(),
      filteredCostCenterName: null,
    });
    expect(universe.items).toHaveLength(3);
  });

  it('expected de mês passado fica vazio (sem as-of histórico)', () => {
    const pastOpen = installment({
      externalId: 'r-past',
      dueDate: '2026-01-20',
      unpaid: '40',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      from: JAN.from,
      to: JAN.to,
      settlements: [],
      receivables: [pastOpen],
      payables: [],
    });
    expect(detailsOf(input, 'revenue', 'EXPECTED').items).toEqual([]);
    expect(calculateMonthlyCashFlow(input).expected.receivables?.toString()).toBe('0');
  });

  it('partyName e description vêm do título; sem fallback enganoso', () => {
    const paid = installment({
      externalId: 'r-party',
      dueDate: '2026-09-02',
      unpaid: '0',
      paid: '10',
      status: 'PAID',
      description: 'Nota 88',
      partyId: 'party-1',
      categoryExternalIds: ['serv'],
    });
    const input = cashInput({
      settlements: [
        settlement({
          settlementExternalId: 'ft-p',
          installmentExternalId: 'r-party',
          occurredOn: '2026-09-03',
          netAmount: '10',
        }),
      ],
      receivables: [paid],
      payables: [],
    });
    const withName = detailsOf(input, 'revenue', 'REALIZED', {
      partyNames: new Map([['party-1', 'Cliente X']]),
    });
    expect(withName.items[0]?.description).toBe('Nota 88');
    expect(withName.items[0]?.partyName).toBe('Cliente X');
    const without = detailsOf(input, 'revenue', 'REALIZED');
    expect(without.items[0]?.partyName).toBeNull();
    expect(JSON.stringify(without.items)).not.toContain('Sem cliente');
  });
});
