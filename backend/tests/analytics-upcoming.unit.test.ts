import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { assertNDays, mapUpcomingInstallments } from '../src/modules/analytics/domain/upcoming.js';

function record(input: {
  readonly id: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly status?: FinancialInstallmentReadRecord['status'];
}): FinancialInstallmentReadRecord {
  const unpaid = new Prisma.Decimal(input.unpaid);
  return {
    id: input.id,
    tenantId: 't',
    integrationId: 'i',
    externalId: input.id,
    description: 'não expor',
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: 'OPEN',
    total: unpaid,
    paid: new Prisma.Decimal(0),
    unpaid,
    categoryExternalIds: [],
    syncedAt: new Date('2026-08-19T00:00:00.000Z'),
  };
}

describe('assertNDays', () => {
  it('aceita inteiro >= 0, inclusive zero', () => {
    expect(() => assertNDays(0)).not.toThrow();
    expect(() => assertNDays(90)).not.toThrow();
  });

  it('rejeita negativo, não inteiro e não-número', () => {
    expect(() => assertNDays(-1)).toThrow(/nDays/);
    expect(() => assertNDays(1.5)).toThrow(/nDays/);
    expect(() => assertNDays(Number.NaN)).toThrow(/nDays/);
    expect(() => assertNDays(Number.POSITIVE_INFINITY)).toThrow(/nDays/);
  });
});

describe('mapUpcomingInstallments', () => {
  it('lista vazia não é null', () => {
    expect(mapUpcomingInstallments([])).toEqual([]);
  });

  it('exclui unpaid zero e preserva ordem', () => {
    const items = mapUpcomingInstallments([
      record({ id: 'a', dueDate: '2026-08-19', unpaid: '1.25', status: 'PARTIALLY_PAID' }),
      record({ id: 'b', dueDate: '2026-08-19', unpaid: '0' }),
      record({ id: 'c', dueDate: '2026-08-20', unpaid: '2' }),
    ]);
    expect(items.map((item) => item.id)).toEqual(['a', 'c']);
    expect(items[0]?.unpaid.equals(new Prisma.Decimal('1.25'))).toBe(true);
    expect(items[0]).not.toHaveProperty('description');
  });
});
