import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import {
  IMPRECISE_PAYABLE_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
  classifyOpenReceivablesByCategory,
  presentOpenPayablesCategoryComposition,
} from '../src/modules/analytics/domain/payable-category-composition.js';

const ZERO = new Prisma.Decimal(0);

function receivable(input: {
  readonly unpaid: string;
  readonly status?: FinancialInstallmentStatus;
  readonly categoryExternalIds?: readonly string[];
}) {
  return {
    unpaid: new Prisma.Decimal(input.unpaid),
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

describe('classifyOpenReceivablesByCategory (D8 / REVENUE)', () => {
  it('uma categoria REVENUE recebe 100% do unpaid', () => {
    const result = classifyOpenReceivablesByCategory(
      [receivable({ unpaid: '10.50', categoryExternalIds: ['vendas'] })],
      [category({ externalId: 'vendas', name: 'Vendas' })],
    );
    expect(result.total.toString()).toBe('10.5');
    expect(result.classified.toString()).toBe('10.5');
    expect(result.uncategorized.toString()).toBe('0');
    expect(result.imprecise.toString()).toBe('0');
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({ kind: 'category', name: 'Vendas' });
    expect(result.buckets[0]?.amount.toString()).toBe('10.5');
  });

  it('zero categorias vai para Sem categoria', () => {
    const result = classifyOpenReceivablesByCategory(
      [receivable({ unpaid: '4' }), receivable({ unpaid: '1', categoryExternalIds: [''] })],
      [],
    );
    expect(result.uncategorized.toString()).toBe('5');
    expect(result.buckets[0]?.kind).toBe('uncategorized');
    expect(result.buckets[0]?.name).toBe(UNCATEGORIZED_PAYABLE_BUCKET_NAME);
  });

  it('múltiplos IDs sem rateio vão para Sem classificação precisa', () => {
    const result = classifyOpenReceivablesByCategory(
      [receivable({ unpaid: '9', categoryExternalIds: ['a', 'b'] })],
      [category({ externalId: 'a', name: 'A' }), category({ externalId: 'b', name: 'B' })],
    );
    expect(result.imprecise.toString()).toBe('9');
    expect(result.classified.toString()).toBe('0');
    expect(result.buckets[0]?.name).toBe(IMPRECISE_PAYABLE_BUCKET_NAME);
  });

  it('categoria EXPENSE, UNKNOWN ou não resolvida é imprecisa', () => {
    const result = classifyOpenReceivablesByCategory(
      [
        receivable({ unpaid: '1', categoryExternalIds: ['aluguel'] }),
        receivable({ unpaid: '2', categoryExternalIds: ['indefinida'] }),
        receivable({ unpaid: '3', categoryExternalIds: ['sumida'] }),
      ],
      [
        category({ externalId: 'aluguel', name: 'Aluguel', type: 'EXPENSE' }),
        category({ externalId: 'indefinida', name: 'Outros', type: 'UNKNOWN' }),
      ],
    );
    expect(result.imprecise.toString()).toBe('6');
    expect(result.classified.toString()).toBe('0');
  });

  it('PARTIALLY_PAID usa somente unpaid residual', () => {
    const result = classifyOpenReceivablesByCategory(
      [
        receivable({
          unpaid: '4.25',
          status: 'PARTIALLY_PAID',
          categoryExternalIds: ['vendas'],
        }),
      ],
      [category({ externalId: 'vendas', name: 'Vendas' })],
    );
    expect(result.total.toString()).toBe('4.25');
    expect(result.classified.toString()).toBe('4.25');
  });

  it('PAID e demais status inativos não entram', () => {
    const result = classifyOpenReceivablesByCategory(
      [
        receivable({ unpaid: '99', status: 'PAID', categoryExternalIds: ['vendas'] }),
        receivable({ unpaid: '1', status: 'LOST', categoryExternalIds: ['vendas'] }),
        receivable({ unpaid: '5', categoryExternalIds: ['vendas'] }),
      ],
      [category({ externalId: 'vendas', name: 'Vendas' })],
    );
    expect(result.total.toString()).toBe('5');
  });

  it('soma dos buckets reconcilia o total com Decimal', () => {
    const result = classifyOpenReceivablesByCategory(
      [
        receivable({ unpaid: '136856.54', categoryExternalIds: ['a'] }),
        receivable({ unpaid: '0.01' }),
        receivable({ unpaid: '1.10', categoryExternalIds: ['x', 'y'] }),
      ],
      [category({ externalId: 'a', name: 'Serviços' })],
    );
    const bucketSum = result.buckets.reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
    expect(bucketSum.toString()).toBe(result.total.toString());
    expect(result.classified.plus(result.uncategorized).plus(result.imprecise).toString()).toBe(
      result.total.toString(),
    );
  });
});

describe('presentOpenPayablesCategoryComposition (AR)', () => {
  it('percentuais e cobertura usam o total em aberto', () => {
    const classified = classifyOpenReceivablesByCategory(
      [receivable({ unpaid: '80', categoryExternalIds: ['a'] }), receivable({ unpaid: '20' })],
      [category({ externalId: 'a', name: 'Serviços' })],
    );
    const presented = presentOpenPayablesCategoryComposition(classified);
    expect(presented.coverageRate?.toString()).toBe('80');
    expect(presented.items[0]?.percentage.toString()).toBe('80');
    expect(presented.items[1]?.percentage.toString()).toBe('20');
  });

  it('total zero não inventa cobertura', () => {
    const presented = presentOpenPayablesCategoryComposition(
      classifyOpenReceivablesByCategory([], []),
    );
    expect(presented.total.toString()).toBe('0');
    expect(presented.coverageRate).toBeNull();
    expect(presented.items).toEqual([]);
  });
});
