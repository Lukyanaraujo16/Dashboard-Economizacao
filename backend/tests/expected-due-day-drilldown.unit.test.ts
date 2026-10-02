import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { civilMonthBoundsFromKey, formatCivilDateKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { selectExpectedOpenPayables } from '../src/modules/analytics/domain/expected-open-payables.js';
import { selectExpectedOpenReceivables } from '../src/modules/analytics/domain/expected-open-receivables.js';
import { selectPendingStockInstallments } from '../src/modules/analytics/domain/pending-installment-stock.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';

const TODAY = new Date('2026-10-02T00:00:00.000Z');
const OCTOBER = civilMonthBoundsFromKey('2026-10');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function civil(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function installment(input: {
  readonly tenantId: string;
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid: string;
}): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid);
  return {
    id: `${input.tenantId}-${input.externalId}`,
    tenantId: input.tenantId,
    integrationId: 'i1',
    externalId: input.externalId,
    description: input.externalId,
    dueDate: civil(input.dueDate),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'OPEN',
    upstreamStatus: null,
    total: unpaid,
    paid: dec('0'),
    unpaid,
    partyId: null,
    categoryExternalIds: [],
    syncedAt: TODAY,
  };
}

function rows(tenantId: string) {
  return [
    installment({ tenantId, externalId: 'same-a', dueDate: '2026-10-10', unpaid: '100.50' }),
    installment({ tenantId, externalId: 'same-b', dueDate: '2026-10-10', unpaid: '49.50' }),
    installment({ tenantId, externalId: 'other-day', dueDate: '2026-10-11', unpaid: '10.00' }),
    installment({ tenantId, externalId: 'overdue', dueDate: '2026-10-01', unpaid: '80.00' }),
    installment({ tenantId, externalId: 'settled', dueDate: '2026-10-10', unpaid: '0.00' }),
  ].map((item) => ({ amount: item.unpaid, installment: item }));
}

function stockForDay(
  kind: 'REVENUE' | 'EXPENSE',
  tenantId: string,
  dueDate: string,
) {
  const stock = selectPendingStockInstallments({
    rows: rows(tenantId),
    today: TODAY,
    from: OCTOBER.from,
    to: OCTOBER.to,
    categoryFilter: null,
    hasCostCenter: false,
    expectedType: kind,
  });
  return stock.items.filter(
    (item) =>
      formatCivilDateKey(item.installment.dueDate) === dueDate && item.situation !== 'OVERDUE',
  );
}

function assertDayReconciles(
  byDay: ReadonlyMap<number, Prisma.Decimal>,
  kind: 'REVENUE' | 'EXPENSE',
  tenantId: string,
) {
  const day = civil('2026-10-10');
  const chart = byDay.get(day.getTime()) ?? null;
  expect(chart).not.toBeNull();
  const titles = stockForDay(kind, tenantId, '2026-10-10');
  expect(titles.map((item) => item.installment.externalId).sort()).toEqual(['same-a', 'same-b']);
  expect(titles.every((item) => formatCivilDateKey(item.installment.dueDate) === '2026-10-10')).toBe(
    true,
  );
  const sum = titles.reduce((total, item) => total.plus(item.amount), dec('0'));
  expect(sum.equals(chart!)).toBe(true);
  expect(sum.equals(dec('150.00'))).toBe(true);

  const otherDay = stockForDay(kind, tenantId, '2026-10-11');
  expect(otherDay.map((item) => item.installment.externalId)).toEqual(['other-day']);
  expect(byDay.get(civil('2026-10-11').getTime())?.equals(dec('10.00'))).toBe(true);

  expect(byDay.has(civil('2026-10-01').getTime())).toBe(false);
  expect(stockForDay(kind, tenantId, '2026-10-01')).toEqual([]);
  expect(byDay.has(civil('2026-10-12').getTime())).toBe(false);
  expect(titles.some((item) => item.installment.externalId === 'settled')).toBe(false);
}

describe('reconciliação do drill-down com a barra de vencimento', () => {
  it('A receber: soma do dia 10 iguala a barra e o vencido não entra', () => {
    const selected = selectExpectedOpenReceivables({
      rows: rows('tenant-a'),
      today: TODAY,
      from: OCTOBER.from,
      to: OCTOBER.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    assertDayReconciles(selected.byDay, 'REVENUE', 'tenant-a');
  });

  it('Contas a pagar: soma do dia 10 iguala a barra e o vencido não entra', () => {
    const selected = selectExpectedOpenPayables({
      rows: rows('tenant-a'),
      today: TODAY,
      from: OCTOBER.from,
      to: OCTOBER.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    assertDayReconciles(selected.byDay, 'EXPENSE', 'tenant-a');
  });

  it('dueDate 2026-10-10 permanece no dia civil 10, sem deslocar para o fuso de São Paulo', () => {
    const due = civil('2026-10-10');
    expect(formatCivilDateKey(due)).toBe('2026-10-10');
    expect(due.getTime()).toBe(Date.UTC(2026, 9, 10));
    expect(due.getUTCDate()).toBe(10);
    const selected = selectExpectedOpenReceivables({
      rows: rows('tenant-a'),
      today: TODAY,
      from: OCTOBER.from,
      to: OCTOBER.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(selected.byDay.has(Date.UTC(2026, 9, 9))).toBe(false);
    expect(selected.byDay.has(Date.UTC(2026, 9, 10))).toBe(true);
  });

  it('isola o tenant: títulos de outra empresa não entram no dia', () => {
    const companyA = selectExpectedOpenReceivables({
      rows: rows('tenant-a'),
      today: TODAY,
      from: OCTOBER.from,
      to: OCTOBER.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    const companyB = selectExpectedOpenReceivables({
      rows: rows('tenant-b'),
      today: TODAY,
      from: OCTOBER.from,
      to: OCTOBER.to,
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(companyA.items.every((item) => item.installment.tenantId === 'tenant-a')).toBe(true);
    expect(companyB.items.every((item) => item.installment.tenantId === 'tenant-b')).toBe(true);
    expect(companyA.items.some((item) => item.installment.tenantId === 'tenant-b')).toBe(false);
    const dayA = stockForDay('REVENUE', 'tenant-a', '2026-10-10');
    expect(dayA.every((item) => item.installment.tenantId === 'tenant-a')).toBe(true);
  });
});
