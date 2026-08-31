import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { civilMonthBounds } from '../src/modules/analytics/domain/civil-calendar.js';
import { calculateMonthlyCompetenceRevenue } from '../src/modules/analytics/domain/monthly-competence-revenue.js';
import {
  IMPRECISE_PAYABLE_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
} from '../src/modules/analytics/domain/payable-category-composition.js';

const TODAY = new Date('2026-08-19T00:00:00.000Z');

function row(input: {
  readonly total: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly dueDate?: string;
  readonly status?: FinancialInstallmentStatus;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total);
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? total.minus(paid).toString());
  return {
    total,
    paid,
    unpaid,
    dueDate: new Date(`${input.dueDate ?? '2026-08-25'}T00:00:00.000Z`),
    status: input.status ?? 'OPEN',
    categoryExternalIds: input.categoryExternalIds ?? [],
  };
}

function category(input: {
  readonly externalId: string;
  readonly name: string;
  readonly type?: 'EXPENSE' | 'REVENUE' | 'UNKNOWN';
}) {
  return {
    externalId: input.externalId,
    name: input.name,
    type: input.type ?? 'REVENUE',
  };
}

describe('civilMonthBounds', () => {
  it('agosto 2026 vai de 01 a 31', () => {
    const bounds = civilMonthBounds(TODAY);
    expect(bounds.monthKey).toBe('2026-08');
    expect(bounds.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(bounds.to.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('calculateMonthlyCompetenceRevenue', () => {
  it('OPEN permanece no total do mês', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [row({ total: '10000', unpaid: '10000', categoryExternalIds: ['serv'] })],
      [category({ externalId: 'serv', name: 'Serviços' })],
      TODAY,
    );
    expect(result.total.toString()).toBe('10000');
    expect(result.received.toString()).toBe('0');
    expect(result.outstanding.toString()).toBe('10000');
  });

  it('PARTIALLY_PAID preserva total e divide paid/unpaid', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [
        row({
          total: '10000',
          paid: '4000',
          unpaid: '6000',
          status: 'PARTIALLY_PAID',
          categoryExternalIds: ['serv'],
        }),
      ],
      [category({ externalId: 'serv', name: 'Serviços' })],
      TODAY,
    );
    expect(result.total.toString()).toBe('10000');
    expect(result.received.toString()).toBe('4000');
    expect(result.outstanding.toString()).toBe('6000');
  });

  it('PAID permanece na receita mensal sem unpaid', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [
        row({
          total: '10000',
          paid: '10000',
          unpaid: '0',
          status: 'PAID',
          categoryExternalIds: ['serv'],
        }),
      ],
      [category({ externalId: 'serv', name: 'Serviços' })],
      TODAY,
    );
    expect(result.total.toString()).toBe('10000');
    expect(result.received.toString()).toBe('10000');
    expect(result.outstanding.toString()).toBe('0');
    expect(result.items[0]?.amount.toString()).toBe('10000');
  });

  it('vencido usa unpaid residual e dueDate < hoje (D1)', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [
        row({
          total: '10',
          paid: '4',
          unpaid: '6',
          dueDate: '2026-08-18',
          status: 'PARTIALLY_PAID',
        }),
        row({
          total: '5',
          unpaid: '5',
          dueDate: '2026-08-19',
        }),
      ],
      [],
      TODAY,
    );
    expect(result.overdue.toString()).toBe('6');
  });

  it('composição usa total e categoria REVENUE precisa', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [
        row({ total: '80', paid: '80', unpaid: '0', status: 'PAID', categoryExternalIds: ['a'] }),
        row({ total: '20', unpaid: '20' }),
      ],
      [category({ externalId: 'a', name: 'Serviços' })],
      TODAY,
    );
    expect(result.items[0]).toMatchObject({ kind: 'category', name: 'Serviços' });
    expect(result.items[0]?.amount.toString()).toBe('80');
    expect(result.items[0]?.percentage.toString()).toBe('80');
    expect(result.coverageRate?.toString()).toBe('80');
  });

  it('múltiplas categorias não recebem rateio inventado', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [row({ total: '9', categoryExternalIds: ['a', 'b'] })],
      [category({ externalId: 'a', name: 'A' }), category({ externalId: 'b', name: 'B' })],
      TODAY,
    );
    expect(result.imprecise.toString()).toBe('9');
    expect(result.classified.toString()).toBe('0');
    expect(result.items[0]?.name).toBe(IMPRECISE_PAYABLE_BUCKET_NAME);
  });

  it('zero categorias vai para Sem categoria', () => {
    const result = calculateMonthlyCompetenceRevenue([row({ total: '3' })], [], TODAY);
    expect(result.uncategorized.toString()).toBe('3');
    expect(result.items[0]?.name).toBe(UNCATEGORIZED_PAYABLE_BUCKET_NAME);
  });

  it('categoria EXPENSE é imprecisa', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [row({ total: '2', categoryExternalIds: ['aluguel'] })],
      [category({ externalId: 'aluguel', name: 'Aluguel', type: 'EXPENSE' })],
      TODAY,
    );
    expect(result.imprecise.toString()).toBe('2');
  });

  it('lado despesa classifica EXPENSE e marca REVENUE como imprecisa', () => {
    const result = calculateMonthlyCompetenceRevenue(
      [
        row({ total: '600', categoryExternalIds: ['limpeza'] }),
        row({ total: '50', categoryExternalIds: ['serv'] }),
      ],
      [
        category({ externalId: 'limpeza', name: 'Profissional de Limpeza', type: 'EXPENSE' }),
        category({ externalId: 'serv', name: 'Serviços', type: 'REVENUE' }),
      ],
      TODAY,
      'EXPENSE',
    );
    expect(result.classified.toString()).toBe('600');
    expect(result.imprecise.toString()).toBe('50');
    expect(
      result.items.find((item) => item.name === 'Profissional de Limpeza')?.amount.toString(),
    ).toBe('600');
  });
});
