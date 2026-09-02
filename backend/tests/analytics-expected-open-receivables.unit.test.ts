import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { buildExpectedReceivableDetailItems } from '../src/modules/analytics/domain/expected-receivable-details.js';
import {
  compareExpectedOpenReceivableItems,
  selectExpectedOpenReceivables,
} from '../src/modules/analytics/domain/expected-open-receivables.js';
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

describe('selectExpectedOpenReceivables', () => {
  it('1 — item previsto simples entra', () => {
    const row = installment({ externalId: 'ar-1', dueDate: '2026-08-28', unpaid: '978' });
    const result = selectExpectedOpenReceivables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.total.toString()).toBe('978');
  });

  it('2 — vencido excluído', () => {
    const row = installment({ externalId: 'ar-old', dueDate: '2026-08-20', unpaid: '50' });
    const result = selectExpectedOpenReceivables({
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
      externalId: 'ar-paid',
      dueDate: '2026-08-28',
      unpaid: '0',
      paid: '100',
      status: 'PAID',
    });
    const result = selectExpectedOpenReceivables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
  });

  it('4 — unpaid zero excluído', () => {
    const row = installment({ externalId: 'ar-zero', dueDate: '2026-08-28', unpaid: '0' });
    const result = selectExpectedOpenReceivables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
  });

  it('5 — item fora do mês excluído', () => {
    const row = installment({ externalId: 'ar-sep', dueDate: '2026-09-05', unpaid: '40' });
    const result = selectExpectedOpenReceivables({
      rows: [{ amount: row.unpaid, installment: row }],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(0);
  });

  it('6 — múltiplos itens somam', () => {
    const a = installment({ externalId: 'ar-a', dueDate: '2026-08-28', unpaid: '10' });
    const b = installment({ externalId: 'ar-b', dueDate: '2026-08-30', unpaid: '20' });
    const result = selectExpectedOpenReceivables({
      rows: [
        { amount: a.unpaid, installment: a },
        { amount: b.unpaid, installment: b },
      ],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(2);
    expect(result.total.toString()).toBe('30');
  });

  it('7 — ordenação por vencimento, cliente e externalId', () => {
    const late = installment({
      externalId: 'ar-z',
      dueDate: '2026-08-30',
      unpaid: '1',
      partyId: 'p2',
    });
    const early = installment({
      externalId: 'ar-a',
      dueDate: '2026-08-28',
      unpaid: '2',
      partyId: 'p1',
    });
    const partyNames = new Map([
      ['p1', 'Ana'],
      ['p2', 'Bruno'],
    ]);
    const customerNameFor = (row: FinancialInstallmentReadRecord) =>
      row.partyId ? (partyNames.get(row.partyId) ?? null) : null;
    const items = [
      { installment: late, amount: late.unpaid },
      { installment: early, amount: early.unpaid },
    ];
    const sorted = [...items].sort((left, right) =>
      compareExpectedOpenReceivableItems(left, right, customerNameFor),
    );
    expect(sorted[0]?.installment.externalId).toBe('ar-a');
    expect(sorted[1]?.installment.externalId).toBe('ar-z');
  });

  it('13 — filtro por categoria', () => {
    const match = installment({
      externalId: 'ar-match',
      dueDate: '2026-08-28',
      unpaid: '15',
      categoryExternalIds: ['cat-rev'],
    });
    const other = installment({
      externalId: 'ar-other',
      dueDate: '2026-08-29',
      unpaid: '25',
      categoryExternalIds: ['cat-exp'],
    });
    const result = selectExpectedOpenReceivables({
      rows: [
        { amount: match.unpaid, installment: match },
        { amount: other.unpaid, installment: other },
      ],
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      categoryFilter: { externalId: 'cat-rev', type: 'REVENUE' },
      hasCostCenter: false,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.installment.externalId).toBe('ar-match');
  });
});

describe('buildExpectedReceivableDetailItems', () => {
  it('8 — customerName via Party', () => {
    const row = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-28',
      unpaid: '100',
      partyId: 'party-1',
      description: 'Consulta',
      categoryExternalIds: ['cat-1'],
    });
    const items = buildExpectedReceivableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map([['party-1', 'Maria']]),
      categories: new Map([['cat-1', { name: 'Consultas', type: 'REVENUE' as const }]]),
    });
    expect(items[0]?.customerName).toBe('Maria');
    expect(items[0]?.description).toBe('Consulta');
    expect(items[0]?.categoryNames).toEqual(['Consultas']);
  });

  it('9 — Party ausente → null', () => {
    const row = installment({ externalId: 'ar-1', dueDate: '2026-08-28', unpaid: '10' });
    const items = buildExpectedReceivableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map(),
    });
    expect(items[0]?.customerName).toBeNull();
  });

  it('10 — categoria única', () => {
    const row = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-28',
      unpaid: '10',
      categoryExternalIds: ['cat-1'],
    });
    const items = buildExpectedReceivableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map([['cat-1', { name: 'Mensalidade', type: 'REVENUE' as const }]]),
    });
    expect(items[0]?.categoryNames).toEqual(['Mensalidade']);
  });

  it('11 — múltiplas categorias', () => {
    const row = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-28',
      unpaid: '10',
      categoryExternalIds: ['cat-1', 'cat-2'],
    });
    const items = buildExpectedReceivableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map([
        ['cat-1', { name: 'A', type: 'REVENUE' as const }],
        ['cat-2', { name: 'B', type: 'REVENUE' as const }],
      ]),
    });
    expect(items[0]?.categoryNames).toEqual(['A', 'B']);
  });

  it('12 — sem categoria', () => {
    const row = installment({ externalId: 'ar-1', dueDate: '2026-08-28', unpaid: '10' });
    const items = buildExpectedReceivableDetailItems({
      items: [{ installment: row, amount: row.unpaid }],
      partyNames: new Map(),
      categories: new Map(),
    });
    expect(items[0]?.categoryNames).toEqual([]);
  });
});

describe('reconciliação com calculateMonthlyCashFlow', () => {
  it('14 — centro de custo usa share outstanding e reconcilia com cash flow', () => {
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
      receivables: [row],
      payables: [],
      categoryFilter: null,
      costCenter: {
        expectedReceivables: allocationRows,
        expectedPayables: [],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });
    const selection = selectExpectedOpenReceivables({
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
    expect(flow.expected.receivables?.toString()).toBe(detailTotal.toString());
    expect(detailTotal.toString()).toBe('60');
  });

  it('15 — SUM(items.amount) === expected.receivables.total', () => {
    const receivables = [
      installment({ externalId: 'ar-1', dueDate: '2026-08-28', unpaid: '978' }),
      installment({ externalId: 'ar-2', dueDate: '2026-08-30', unpaid: '22' }),
      installment({ externalId: 'ar-old', dueDate: '2026-08-10', unpaid: '999' }),
    ];
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [],
      receivables,
      payables: [],
      categoryFilter: null,
    });
    const selection = selectExpectedOpenReceivables({
      rows: receivables.map((row) => ({ amount: row.unpaid, installment: row })),
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
    expect(flow.expected.receivables?.toString()).toBe(detailTotal.toString());
    expect(flow.expected.receivables?.toString()).toBe('1000');
  });
});
