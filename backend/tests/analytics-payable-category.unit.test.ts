import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import {
  DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
  IMPRECISE_PAYABLE_BUCKET_NAME,
  OTHER_PAYABLE_CATEGORIES_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
  classifyOpenPayablesByCategory,
  presentOpenPayablesCategoryComposition,
} from '../src/modules/analytics/domain/payable-category-composition.js';

const ZERO = new Prisma.Decimal(0);

function payable(input: {
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
    type: input.type ?? 'EXPENSE',
  };
}

describe('classifyOpenPayablesByCategory (D8)', () => {
  it('uma categoria EXPENSE recebe 100% do unpaid', () => {
    const result = classifyOpenPayablesByCategory(
      [payable({ unpaid: '10.50', categoryExternalIds: ['aluguel'] })],
      [category({ externalId: 'aluguel', name: 'Aluguel' })],
    );
    expect(result.total.toString()).toBe('10.5');
    expect(result.classified.toString()).toBe('10.5');
    expect(result.uncategorized.toString()).toBe('0');
    expect(result.imprecise.toString()).toBe('0');
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({ kind: 'category', name: 'Aluguel' });
    expect(result.buckets[0]?.amount.toString()).toBe('10.5');
  });

  it('duas categorias em parcelas diferentes somam separado', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({ unpaid: '8', categoryExternalIds: ['a'] }),
        payable({ unpaid: '2', categoryExternalIds: ['b'] }),
      ],
      [
        category({ externalId: 'a', name: 'Salários' }),
        category({ externalId: 'b', name: 'Impostos' }),
      ],
    );
    expect(result.classified.toString()).toBe('10');
    expect(result.buckets.map((bucket) => bucket.name)).toEqual(['Salários', 'Impostos']);
    expect(result.buckets[0]?.amount.toString()).toBe('8');
  });

  it('zero categorias vai para Sem categoria', () => {
    const result = classifyOpenPayablesByCategory(
      [payable({ unpaid: '4' }), payable({ unpaid: '1', categoryExternalIds: [''] })],
      [],
    );
    expect(result.uncategorized.toString()).toBe('5');
    expect(result.buckets[0]?.kind).toBe('uncategorized');
    expect(result.buckets[0]?.name).toBe(UNCATEGORIZED_PAYABLE_BUCKET_NAME);
  });

  it('IDs duplicados na mesma parcela contam como uma categoria', () => {
    const result = classifyOpenPayablesByCategory(
      [payable({ unpaid: '7', categoryExternalIds: ['aluguel', 'aluguel', ''] })],
      [category({ externalId: 'aluguel', name: 'Aluguel' })],
    );
    expect(result.classified.toString()).toBe('7');
    expect(result.imprecise.toString()).toBe('0');
    expect(result.buckets).toHaveLength(1);
  });

  it('múltiplos IDs sem rateio vão para Sem classificação precisa', () => {
    const result = classifyOpenPayablesByCategory(
      [payable({ unpaid: '9', categoryExternalIds: ['a', 'b'] })],
      [category({ externalId: 'a', name: 'A' }), category({ externalId: 'b', name: 'B' })],
    );
    expect(result.imprecise.toString()).toBe('9');
    expect(result.classified.toString()).toBe('0');
    expect(result.buckets[0]?.name).toBe(IMPRECISE_PAYABLE_BUCKET_NAME);
  });

  it('categoria REVENUE, UNKNOWN ou não resolvida é imprecisa', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({ unpaid: '1', categoryExternalIds: ['receita'] }),
        payable({ unpaid: '2', categoryExternalIds: ['indefinida'] }),
        payable({ unpaid: '3', categoryExternalIds: ['sumida'] }),
      ],
      [
        category({ externalId: 'receita', name: 'Vendas', type: 'REVENUE' }),
        category({ externalId: 'indefinida', name: 'Outros', type: 'UNKNOWN' }),
      ],
    );
    expect(result.imprecise.toString()).toBe('6');
    expect(result.classified.toString()).toBe('0');
  });

  it('PARTIALLY_PAID usa somente unpaid residual', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({
          unpaid: '4.25',
          status: 'PARTIALLY_PAID',
          categoryExternalIds: ['aluguel'],
        }),
      ],
      [category({ externalId: 'aluguel', name: 'Aluguel' })],
    );
    expect(result.total.toString()).toBe('4.25');
    expect(result.classified.toString()).toBe('4.25');
  });

  it('status fora do universo ativo não entra', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({ unpaid: '99', status: 'PAID', categoryExternalIds: ['aluguel'] }),
        payable({ unpaid: '1', status: 'LOST', categoryExternalIds: ['aluguel'] }),
        payable({ unpaid: '5', categoryExternalIds: ['aluguel'] }),
      ],
      [category({ externalId: 'aluguel', name: 'Aluguel' })],
    );
    expect(result.total.toString()).toBe('5');
  });

  it('soma dos buckets reconcilia o total com Decimal e valores grandes', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({ unpaid: '1075516.03', categoryExternalIds: ['a'] }),
        payable({ unpaid: '0.01' }),
        payable({ unpaid: '1.10', categoryExternalIds: ['x', 'y'] }),
      ],
      [category({ externalId: 'a', name: 'Fornecedores' })],
    );
    const bucketSum = result.buckets.reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
    expect(bucketSum.toString()).toBe(result.total.toString());
    expect(result.total.toString()).toBe('1075517.14');
    expect(result.classified.plus(result.uncategorized).plus(result.imprecise).toString()).toBe(
      result.total.toString(),
    );
  });

  it('desempate determinístico: mesmo valor ordena por nome', () => {
    const result = classifyOpenPayablesByCategory(
      [
        payable({ unpaid: '10', categoryExternalIds: ['b'] }),
        payable({ unpaid: '10', categoryExternalIds: ['a'] }),
      ],
      [
        category({ externalId: 'b', name: 'Zebra' }),
        category({ externalId: 'a', name: 'Aluguel' }),
      ],
    );
    expect(result.buckets.map((bucket) => bucket.name)).toEqual(['Aluguel', 'Zebra']);
  });
});

describe('presentOpenPayablesCategoryComposition', () => {
  it('percentuais e cobertura usam o total em aberto', () => {
    const classified = classifyOpenPayablesByCategory(
      [payable({ unpaid: '80', categoryExternalIds: ['a'] }), payable({ unpaid: '20' })],
      [category({ externalId: 'a', name: 'Salários' })],
    );
    const presented = presentOpenPayablesCategoryComposition(classified);
    expect(presented.coverageRate?.toString()).toBe('80');
    expect(presented.items[0]?.percentage.toString()).toBe('80');
    expect(presented.items[1]?.percentage.toString()).toBe('20');
    const percentSum = presented.items.reduce((sum, item) => sum.plus(item.percentage), ZERO);
    expect(percentSum.toString()).toBe('100');
  });

  it('total zero não inventa cobertura', () => {
    const presented = presentOpenPayablesCategoryComposition(
      classifyOpenPayablesByCategory([], []),
    );
    expect(presented.total.toString()).toBe('0');
    expect(presented.coverageRate).toBeNull();
    expect(presented.items).toEqual([]);
  });

  it('massa de 9 categorias precisas permanece nominada (limite 10)', () => {
    const payables = Array.from({ length: 9 }, (_, index) =>
      payable({
        unpaid: String(9 - index),
        categoryExternalIds: [`c${index}`],
      }),
    );
    const categories = Array.from({ length: 9 }, (_, index) =>
      category({ externalId: `c${index}`, name: `Cat ${index}` }),
    );
    const presented = presentOpenPayablesCategoryComposition(
      classifyOpenPayablesByCategory(payables, categories),
    );
    expect(presented.items.filter((item) => item.kind === 'category')).toHaveLength(9);
    expect(presented.items.some((item) => item.kind === 'other')).toBe(false);
  });

  it('agrega o restante nominal em Outras categorias sem absorver qualidade', () => {
    const namedCount = DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES + 2;
    const payables = Array.from({ length: namedCount }, (_, index) =>
      payable({
        unpaid: String(namedCount - index),
        categoryExternalIds: [`c${index}`],
      }),
    );
    payables.push(payable({ unpaid: '5' }));
    const categories = Array.from({ length: namedCount }, (_, index) =>
      category({ externalId: `c${index}`, name: `Cat ${index}` }),
    );
    const presented = presentOpenPayablesCategoryComposition(
      classifyOpenPayablesByCategory(payables, categories),
      DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
    );
    const named = presented.items.filter((item) => item.kind === 'category');
    const other = presented.items.find((item) => item.kind === 'other');
    const uncategorized = presented.items.find((item) => item.kind === 'uncategorized');
    expect(named).toHaveLength(DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES);
    expect(other?.name).toBe(OTHER_PAYABLE_CATEGORIES_BUCKET_NAME);
    expect(other?.amount.toString()).toBe('3');
    expect(uncategorized?.amount.toString()).toBe('5');
    const itemSum = presented.items.reduce((sum, item) => sum.plus(item.amount), ZERO);
    expect(itemSum.toString()).toBe(presented.total.toString());
  });
});
