import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { buildExpectedPayableDetailItems } from '../src/modules/analytics/domain/expected-payable-details.js';
import {
  compareExpectedOpenPayableItems,
  selectExpectedOpenPayables,
} from '../src/modules/analytics/domain/expected-open-payables.js';
import { calculateMonthlyCashFlow } from '../src/modules/analytics/domain/monthly-cash-flow.js';

const TODAY = new Date('2026-08-26T00:00:00.000Z');
const AUG = civilMonthBoundsFromKey('2026-08');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function civil(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function installment(
  input: {
    readonly id?: string;
    readonly externalId: string;
    readonly dueDate: string;
    readonly unpaid?: string;
    readonly paid?: string;
    readonly total?: string;
    readonly status?: FinancialInstallmentReadRecord['status'];
    readonly categoryExternalIds?: readonly string[];
    readonly description?: string | null;
    readonly partyId?: string | null;
  },
): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  const total = dec(input.total ?? unpaid.plus(paid).toString());
  return {
    id: input.id ?? input.externalId,
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

describe('selectExpectedOpenPayables', () => {
  it('1 — item previsto simples entra', () => {
    const row = installment({ externalId: 'ap-1', dueDate: '2026-08-28', unpaid: '1250' });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.total.toString()).toBe('1250');
  });

  it('2 — vencido excluído', () => {
    const row = installment({ externalId: 'ap-old', dueDate: '2026-08-20', unpaid: '50' });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
    expect(result.total.toString()).toBe('0');
  });

  it('3 — quitado excluído', () => {
    const row = installment({
      externalId: 'ap-paid',
      dueDate: '2026-08-28',
      unpaid: '0',
      paid: '100',
      status: 'PAID',
    });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
  });

  it('4 — partial payment usa unpaid restante', () => {
    const row = installment({
      externalId: 'ap-partial',
      dueDate: '2026-08-28',
      unpaid: '40',
      paid: '60',
      total: '100',
      status: 'PARTIALLY_PAID',
    });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(1);
    expect(result.total.toString()).toBe('40');
  });

  it('5 — boundary dueDate === today', () => {
    const row = installment({ externalId: 'ap-today', dueDate: '2026-08-26', unpaid: '10' });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(1);
  });

  it('6 — fora do mês excluído', () => {
    const row = installment({ externalId: 'ap-sep', dueDate: '2026-09-05', unpaid: '40' });
    const result = selectExpectedOpenPayables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
  });

  it('7 — filtro categoria EXPENSE', () => {
    const match = installment({
      externalId: 'ap-match',
      dueDate: '2026-08-28',
      unpaid: '15',
      categoryExternalIds: ['cat-exp'],
    });
    const other = installment({
      externalId: 'ap-other',
      dueDate: '2026-08-29',
      unpaid: '25',
      categoryExternalIds: ['cat-rev'],
    });
    const result = selectExpectedOpenPayables({
      rows: [
        { amount: match.unpaid, installment: match },
        { amount: other.unpaid, installment: other },
      ],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: { externalId: 'cat-exp', type: 'EXPENSE' },
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.installment.externalId).toBe('ap-match');
  });

  it('8 — ordenação por vencimento, fornecedor e externalId', () => {
    const late = installment({
      externalId: 'ap-z',
      dueDate: '2026-08-30',
      unpaid: '1',
      partyId: 'p2',
    });
    const early = installment({
      externalId: 'ap-a',
      dueDate: '2026-08-28',
      unpaid: '2',
      partyId: 'p1',
    });
    const partyNames = new Map([
      ['p1', 'Ana'],
      ['p2', 'Bruno'],
    ]);
    const supplierNameFor = (row: FinancialInstallmentReadRecord) =>
      row.partyId ? (partyNames.get(row.partyId) ?? null) : null;
    const items = [
      { installment: late, amount: late.unpaid },
      { installment: early, amount: early.unpaid },
    ];
    const sorted = [...items].sort((left, right) =>
      compareExpectedOpenPayableItems(left, right, supplierNameFor),
    );
    expect(sorted[0]?.installment.externalId).toBe('ap-a');
    expect(sorted[1]?.installment.externalId).toBe('ap-z');
  });
});

describe('buildExpectedPayableDetailItems', () => {
  it('9 — supplierName via Party', () => {
    const row = installment({
      externalId: 'ap-1',
      dueDate: '2026-08-28',
      unpaid: '100',
      partyId: 'party-1',
      description: 'Honorários',
      categoryExternalIds: ['cat-1'],
    });
    const items = buildExpectedPayableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map([['party-1', 'Fornecedor XYZ']]),
      categories: new Map([['cat-1', { name: 'Contabilidade', type: 'EXPENSE' as const }]]),
    });
    expect(items[0]?.supplierName).toBe('Fornecedor XYZ');
    expect(items[0]?.description).toBe('Honorários');
    expect(items[0]?.categoryNames).toEqual(['Contabilidade']);
  });

  it('10 — Party ausente → null', () => {
    const row = installment({ externalId: 'ap-1', dueDate: '2026-08-28', unpaid: '10' });
    const items = buildExpectedPayableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map(),
    });
    expect(items[0]?.supplierName).toBeNull();
  });

  it('11 — múltiplas categorias EXPENSE', () => {
    const row = installment({
      externalId: 'ap-1',
      dueDate: '2026-08-28',
      unpaid: '10',
      categoryExternalIds: ['cat-1', 'cat-2'],
    });
    const items = buildExpectedPayableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map([
        ['cat-1', { name: 'A', type: 'EXPENSE' as const }],
        ['cat-2', { name: 'B', type: 'EXPENSE' as const }],
      ]),
    });
    expect(items[0]?.categoryNames).toEqual(['A', 'B']);
  });
});

describe('reconciliação com calculateMonthlyCashFlow', () => {
  it('12 — centro de custo usa share outstanding e reconcilia com cash flow', () => {
    const row = installment({
      externalId: 'cc-open',
      dueDate: '2026-08-30',
      unpaid: '60',
      paid: '40',
      total: '100',
    });
    const allocationRows = [{ amount: dec('100'), installment: row }];
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [],
      receivables: [],
      payables: [row],
      categoryFilter: null,
      costCenter: {
        expectedReceivables: [],
        expectedPayables: allocationRows,
        realizedReceivables: [],
        realizedPayables: [],
      },
    });
    const selection = selectExpectedOpenPayables({
      rows: allocationRows,
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: true,
    });
    const detailTotal = selection.items.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0),
    );
    expect(flow.expected.payables?.toString()).toBe(detailTotal.toString());
    expect(detailTotal.toString()).toBe('60');
  });

  it('13 — SUM(items.amount) === expected.payables.total', () => {
    const payables = [
      installment({ externalId: 'ap-1', dueDate: '2026-08-28', unpaid: '978' }),
      installment({ externalId: 'ap-2', dueDate: '2026-08-30', unpaid: '22' }),
      installment({ externalId: 'ap-old', dueDate: '2026-08-10', unpaid: '999' }),
    ];
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [],
      receivables: [],
      payables,
      categoryFilter: null,
    });
    const selection = selectExpectedOpenPayables({
      rows: payables.map((row) => ({ amount: row.unpaid, installment: row })),
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    const detailTotal = selection.items.reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0),
    );
    expect(flow.expected.payables?.toString()).toBe(detailTotal.toString());
    expect(flow.expected.payables?.toString()).toBe('1000');
  });
});
