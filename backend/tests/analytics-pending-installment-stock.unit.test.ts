import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { calculateInstallmentPendingStock } from '../src/modules/analytics/domain/installment-snapshot.js';
import {
  comparePendingStockItems,
  selectPendingStockInstallments,
  type PendingStockItem,
} from '../src/modules/analytics/domain/pending-installment-stock.js';

const today = new Date('2026-09-23T00:00:00.000Z');
const SEP_FROM = new Date('2026-09-01T00:00:00.000Z');
const SEP_TO = new Date('2026-09-30T00:00:00.000Z');
const AUG_FROM = new Date('2026-08-01T00:00:00.000Z');
const AUG_TO = new Date('2026-08-31T00:00:00.000Z');
const OCT_FROM = new Date('2026-10-01T00:00:00.000Z');
const OCT_TO = new Date('2026-10-31T00:00:00.000Z');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function installment(input: {
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly status?: FinancialInstallmentReadRecord['status'];
  readonly tenantId?: string;
  readonly partyId?: string | null;
  readonly categoryExternalIds?: readonly string[];
}): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  return {
    id: input.externalId,
    tenantId: input.tenantId ?? 't1',
    integrationId: 'i1',
    externalId: input.externalId,
    description: null,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: null,
    total: dec(input.total ?? unpaid.plus(paid).toString()),
    paid,
    unpaid,
    partyId: input.partyId ?? null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
    syncedAt: today,
  };
}

function row(record: FinancialInstallmentReadRecord) {
  return { amount: record.unpaid, installment: record };
}

function select(
  records: readonly FinancialInstallmentReadRecord[],
  type: 'REVENUE' | 'EXPENSE',
  window: { readonly from: Date; readonly to: Date } = { from: SEP_FROM, to: SEP_TO },
) {
  return selectPendingStockInstallments({
    rows: records.map(row),
    today,
    from: window.from,
    to: window.to,
    categoryFilter: null,
    hasCostCenter: false,
    expectedType: type,
  });
}

describe('calculateInstallmentPendingStock', () => {
  it('12 — total = overdue + dueToday + upcoming', () => {
    const stock = calculateInstallmentPendingStock(
      [
        { dueDate: new Date('2026-09-22T00:00:00.000Z'), unpaid: dec('3000') },
        { dueDate: today, unpaid: dec('1000') },
        { dueDate: new Date('2026-09-24T00:00:00.000Z'), unpaid: dec('8000') },
      ],
      today,
    );
    expect(stock.overdue.toString()).toBe('3000');
    expect(stock.dueToday.toString()).toBe('1000');
    expect(stock.upcoming.toString()).toBe('8000');
    expect(stock.open.toString()).toBe('12000');
    expect(stock.open.equals(stock.overdue.plus(stock.dueToday).plus(stock.upcoming))).toBe(true);
  });
});

describe('selectPendingStockInstallments', () => {
  it('1/8 — payable vencido ontem entra como OVERDUE', () => {
    const result = select(
      [installment({ externalId: 'ap-1', dueDate: '2026-09-22', unpaid: '10' })],
      'EXPENSE',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.situation).toBe('OVERDUE');
    expect(result.totals.overdue.toString()).toBe('10');
  });

  it('2/8 — receivable hoje entra como DUE_TODAY', () => {
    const result = select(
      [installment({ externalId: 'ar-1', dueDate: '2026-09-23', unpaid: '7' })],
      'REVENUE',
    );
    expect(result.items[0]?.situation).toBe('DUE_TODAY');
    expect(result.totals.dueToday.toString()).toBe('7');
  });

  it('3/8 — payable amanhã entra como UPCOMING', () => {
    const result = select(
      [installment({ externalId: 'ap-2', dueDate: '2026-09-24', unpaid: '4' })],
      'EXPENSE',
    );
    expect(result.items[0]?.situation).toBe('UPCOMING');
    expect(result.totals.upcoming.toString()).toBe('4');
  });

  it('4 — vencimento em mês anterior fica fora do mês selecionado', () => {
    const september = select(
      [installment({ externalId: 'ap-aug', dueDate: '2026-08-20', unpaid: '1000' })],
      'EXPENSE',
    );
    expect(september.items).toHaveLength(0);
    expect(september.totals.open.toString()).toBe('0');

    const august = select(
      [installment({ externalId: 'ap-aug', dueDate: '2026-08-20', unpaid: '1000' })],
      'EXPENSE',
      { from: AUG_FROM, to: AUG_TO },
    );
    expect(august.totals.open.toString()).toBe('1000');
    expect(august.items[0]?.situation).toBe('OVERDUE');
  });

  it('5 — PARTIALLY_PAID entra só pelo unpaid restante', () => {
    const result = select(
      [
        installment({
          externalId: 'ar-partial',
          dueDate: '2026-09-22',
          unpaid: '4.75',
          paid: '5.25',
          total: '10',
          status: 'PARTIALLY_PAID',
        }),
      ],
      'REVENUE',
    );
    expect(result.totals.open.toString()).toBe('4.75');
    expect(result.totals.overdue.toString()).toBe('4.75');
  });

  it('6 — PAID / unpaid=0 fica fora', () => {
    const result = select(
      [
        installment({
          externalId: 'ap-paid',
          dueDate: '2026-09-22',
          unpaid: '0',
          paid: '50',
          total: '50',
          status: 'PAID',
        }),
      ],
      'EXPENSE',
    );
    expect(result.items).toHaveLength(0);
    expect(result.totals.open.toString()).toBe('0');
  });

  it('7 — DELETED não é status ativo e fica fora', () => {
    const result = select(
      [
        installment({
          externalId: 'ap-deleted',
          dueDate: '2026-09-22',
          unpaid: '80',
          status: 'PAID',
        }),
      ],
      'EXPENSE',
    );
    expect(result.items).toHaveLength(0);
  });

  it('11 — itens de outro tenant não se misturam na seleção (input já isolado)', () => {
    const mine = installment({
      externalId: 'mine',
      dueDate: '2026-09-22',
      unpaid: '3',
      tenantId: 't-a',
    });
    const result = select([mine], 'REVENUE');
    expect(result.items.every((item) => item.installment.tenantId === 't-a')).toBe(true);
    expect(result.totals.open.toString()).toBe('3');
  });

  it('20 — recorta pelo mês: agosto e outubro ficam fora de setembro', () => {
    const records = [
      installment({ externalId: 'aug', dueDate: '2026-08-20', unpaid: '1000' }),
      installment({ externalId: 'sep-over', dueDate: '2026-09-22', unpaid: '200' }),
      installment({ externalId: 'sep-today', dueDate: '2026-09-23', unpaid: '50' }),
      installment({ externalId: 'sep-up', dueDate: '2026-09-24', unpaid: '500' }),
      installment({ externalId: 'oct', dueDate: '2026-10-05', unpaid: '900' }),
    ];
    const september = select(records, 'EXPENSE');
    expect(september.items.map((item) => item.installment.externalId)).toEqual([
      'sep-over',
      'sep-today',
      'sep-up',
    ]);
    expect(september.totals.overdue.toString()).toBe('200');
    expect(september.totals.dueToday.toString()).toBe('50');
    expect(september.totals.upcoming.toString()).toBe('500');
    expect(september.totals.open.toString()).toBe('750');

    const october = select(records, 'EXPENSE', { from: OCT_FROM, to: OCT_TO });
    expect(october.items).toHaveLength(1);
    expect(october.items[0]?.situation).toBe('UPCOMING');
    expect(october.totals.open.toString()).toBe('900');
  });

  it('8 — filtro de categoria precisa continua valendo no recorte mensal', () => {
    const records = [
      installment({
        externalId: 'serv-over',
        dueDate: '2026-09-22',
        unpaid: '40',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'outras',
        dueDate: '2026-09-24',
        unpaid: '90',
        categoryExternalIds: ['outras'],
      }),
      installment({
        externalId: 'multi',
        dueDate: '2026-09-23',
        unpaid: '15',
        categoryExternalIds: ['serv', 'outras'],
      }),
    ];
    const filtered = selectPendingStockInstallments({
      rows: records.map(row),
      today,
      from: SEP_FROM,
      to: SEP_TO,
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
      hasCostCenter: false,
      expectedType: 'REVENUE',
    });
    expect(filtered.items.map((item) => item.installment.externalId)).toEqual(['serv-over']);
    expect(filtered.totals.open.toString()).toBe('40');
    expect(filtered.totals.overdue.toString()).toBe('40');
  });
});

describe('comparePendingStockItems', () => {
  function item(
    dueDate: string,
    externalId: string,
    partyId: string | null = null,
  ): PendingStockItem {
    const record = installment({ externalId, dueDate, unpaid: '1', partyId });
    const selection = select([record], 'EXPENSE');
    return selection.items[0] as PendingStockItem;
  }

  it('15 — ordena vencidos mais antigos, depois hoje, depois futuros', () => {
    const names = new Map<string, string>([
      ['p-b', 'Beta'],
      ['p-a', 'Alfa'],
    ]);
    const rows = [
      item('2026-09-24', 'future-b', 'p-b'),
      item('2026-09-23', 'today', null),
      item('2026-09-10', 'old-b', 'p-b'),
      item('2026-09-10', 'old-a', 'p-a'),
      item('2026-09-22', 'yesterday', null),
    ];
    const sorted = [...rows].sort((left, right) =>
      comparePendingStockItems(left, right, (installment) =>
        installment.partyId ? (names.get(installment.partyId) ?? null) : null,
      ),
    );
    expect(sorted.map((row) => row.installment.externalId)).toEqual([
      'old-a',
      'old-b',
      'yesterday',
      'today',
      'future-b',
    ]);
  });
});
