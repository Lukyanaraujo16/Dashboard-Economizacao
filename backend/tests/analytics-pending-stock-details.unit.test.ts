import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { buildPayableStockDetailItems } from '../src/modules/analytics/domain/pending-payable-details.js';
import { buildReceivableStockDetailItems } from '../src/modules/analytics/domain/pending-receivable-details.js';
import { selectPendingStockInstallments } from '../src/modules/analytics/domain/pending-installment-stock.js';

const today = new Date('2026-09-23T00:00:00.000Z');

function installment(input: {
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly partyId?: string;
}): FinancialInstallmentReadRecord {
  return {
    id: input.externalId,
    tenantId: 't1',
    integrationId: 'i1',
    externalId: input.externalId,
    description: 'Parcela',
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'OPEN',
    upstreamStatus: null,
    total: new Prisma.Decimal(input.unpaid),
    paid: new Prisma.Decimal(0),
    unpaid: new Prisma.Decimal(input.unpaid),
    partyId: input.partyId ?? null,
    categoryExternalIds: [],
    syncedAt: today,
  };
}

describe('pending stock details', () => {
  it('13/14 — modal inclui overdue + today + upcoming com classificação', () => {
    const records = [
      installment({ externalId: 'up', dueDate: '2026-09-24', unpaid: '8', partyId: 'c1' }),
      installment({ externalId: 'over', dueDate: '2026-09-22', unpaid: '3', partyId: 'c2' }),
      installment({ externalId: 'today', dueDate: '2026-09-23', unpaid: '1', partyId: 'c3' }),
    ];
    const selection = selectPendingStockInstallments({
      rows: records.map((row) => ({ amount: row.unpaid, installment: row })),
      today,
      categoryFilter: null,
      hasCostCenter: false,
      expectedType: 'REVENUE',
    });
    const items = buildReceivableStockDetailItems({
      items: selection.items,
      partyNames: new Map([
        ['c1', 'Carla'],
        ['c2', 'Bruno'],
        ['c3', 'Ana'],
      ]),
      categories: new Map(),
    });
    expect(items.map((item) => item.situation)).toEqual(['OVERDUE', 'DUE_TODAY', 'UPCOMING']);
    expect(items.map((item) => item.externalId)).toEqual(['over', 'today', 'up']);
    expect(items[0]?.overdueDays).toBe(1);
  });

  it('8/15 — payables simétricos e ordenação determinística', () => {
    const records = [
      installment({ externalId: 'b', dueDate: '2026-08-20', unpaid: '2', partyId: 's2' }),
      installment({ externalId: 'a', dueDate: '2026-08-20', unpaid: '2', partyId: 's1' }),
    ];
    const selection = selectPendingStockInstallments({
      rows: records.map((row) => ({ amount: row.unpaid, installment: row })),
      today,
      categoryFilter: null,
      hasCostCenter: false,
      expectedType: 'EXPENSE',
    });
    const items = buildPayableStockDetailItems({
      items: selection.items,
      partyNames: new Map([
        ['s1', 'Alfa'],
        ['s2', 'Beta'],
      ]),
      categories: new Map(),
    });
    expect(items.map((item) => item.externalId)).toEqual(['a', 'b']);
    expect(items.every((item) => item.situation === 'OVERDUE')).toBe(true);
  });
});
