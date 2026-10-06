import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  buildCashRealizedMonthDetails,
  CASH_REALIZED_MONTH_DETAILS_LIMIT,
} from '../src/modules/analytics/domain/cash-realized-day-details.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { parseCashRealizedMonthDetailsQuery } from '../src/modules/dashboard/http/parse-cash-realized-month-details-query.js';

const TODAY = new Date('2026-08-26T00:00:00.000Z');
const MONTH = '2026-08';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function installment(input: {
  readonly externalId: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly total?: string;
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly categoryExternalIds?: readonly string[];
}): FinancialInstallmentReadRecord {
  const paid = dec(input.paid ?? '0');
  const unpaid = dec(input.unpaid ?? '0');
  return {
    id: input.externalId,
    tenantId: 'tenant-a',
    integrationId: 'i1',
    externalId: input.externalId,
    description: input.description ?? null,
    dueDate: new Date('2026-08-20T00:00:00.000Z'),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'PAID',
    upstreamStatus: null,
    total: dec(input.total ?? paid.plus(unpaid).toString()),
    paid,
    unpaid,
    partyId: input.partyId ?? null,
    categoryExternalIds: input.categoryExternalIds ?? [],
    syncedAt: TODAY,
  };
}

function settlement(input: {
  readonly id: string;
  readonly installmentExternalId: string;
  readonly netAmount: string;
  readonly occurredOn?: string;
  readonly type?: 'RECEIPT' | 'DISBURSEMENT';
  readonly kind?: 'RECEIVABLE' | 'PAYABLE';
}): CashSettlementSource {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.kind ?? (input.type === 'DISBURSEMENT' ? 'PAYABLE' : 'RECEIVABLE'),
    transactionType: input.type ?? 'RECEIPT',
    occurredOn: new Date(`${input.occurredOn ?? '2026-08-05'}T00:00:00.000Z`),
    netAmount: dec(input.netAmount),
  };
}

function monthDetails(input: {
  readonly direction?: 'inflows' | 'outflows';
  readonly monthKey?: string;
  readonly settlements: readonly CashSettlementSource[];
  readonly installments?: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  readonly partyNames?: ReadonlyMap<string, string>;
  readonly categories?: readonly { externalId: string; name: string; type: 'REVENUE' | 'EXPENSE' }[];
  readonly categoryFilter?: { externalId: string; type: 'REVENUE' | 'EXPENSE' } | null;
  readonly costCenter?: {
    expectedReceivables: readonly { amount: Prisma.Decimal; installment: FinancialInstallmentReadRecord }[];
    expectedPayables: readonly { amount: Prisma.Decimal; installment: FinancialInstallmentReadRecord }[];
    realizedReceivables: readonly { amount: Prisma.Decimal; installment: FinancialInstallmentReadRecord }[];
    realizedPayables: readonly { amount: Prisma.Decimal; installment: FinancialInstallmentReadRecord }[];
  };
  readonly costCenterLabel?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}) {
  return buildCashRealizedMonthDetails({
    monthKey: input.monthKey ?? MONTH,
    direction: input.direction ?? 'inflows',
    today: TODAY,
    settlements: input.settlements,
    realizedInstallments: input.installments,
    categories: input.categories,
    partyNames: input.partyNames ?? new Map([['party-1', 'Cliente Norte']]),
    categoryFilter: input.categoryFilter,
    costCenter: input.costCenter,
    costCenterLabel: input.costCenterLabel,
    limit: input.limit,
    offset: input.offset,
  });
}

function chartMonth(input: {
  readonly monthKey?: string;
  readonly settlements: readonly CashSettlementSource[];
  readonly installments?: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  readonly categoryFilter?: { externalId: string; type: 'REVENUE' | 'EXPENSE' } | null;
  readonly costCenter?: Parameters<typeof monthDetails>[0]['costCenter'];
}) {
  const bounds = civilMonthBoundsFromKey(input.monthKey ?? MONTH);
  return calculateMonthlyCashFlow({
    tenantId: 'tenant-a',
    today: TODAY,
    from: bounds.from,
    to: bounds.to,
    settlements: input.settlements,
    receivables: [],
    payables: [],
    realizedInstallments: input.installments,
    categoryFilter: input.categoryFilter,
    costCenter: input.costCenter,
  });
}

describe('detalhe mensal de caixa realizado', () => {
  it('entradas do mês reconciliam com o gráfico e ignoram outro mês', () => {
    const settlements = [
      settlement({ id: 'in-1', installmentExternalId: 'ar-1', netAmount: '20102.67', occurredOn: '2026-08-05' }),
      settlement({ id: 'in-2', installmentExternalId: 'ar-2', netAmount: '10.00', occurredOn: '2026-08-20' }),
      settlement({ id: 'other-month', installmentExternalId: 'ar-3', netAmount: '999', occurredOn: '2026-07-31' }),
    ];
    const installments = new Map<string, FinancialInstallmentReadRecord>([
      ['RECEIVABLE:ar-1', installment({ externalId: 'ar-1', paid: '20102.67', partyId: 'party-1' })],
      ['RECEIVABLE:ar-2', installment({ externalId: 'ar-2', paid: '10', partyId: 'party-1' })],
    ]);
    const result = monthDetails({ settlements, installments });
    const flow = chartMonth({ settlements, installments });
    expect(result.completeness).toBe('COMPLETE');
    expect(result.total?.toString()).toBe('20112.67');
    expect(result.returnedSum?.toString()).toBe('20112.67');
    expect(result.difference?.toString()).toBe('0');
    expect(result.itemCount).toBe(2);
    expect(flow.realized.inflows?.toString()).toBe(result.total?.toString());
    expect(result.items.map((item) => item.displayLabel)).toContain('Cliente Norte');
  });

  it('saídas do mês reconciliam com o gráfico', () => {
    const settlements = [
      settlement({
        id: 'out-1',
        installmentExternalId: 'ap-1',
        netAmount: '575.00',
        occurredOn: '2026-08-05',
        type: 'DISBURSEMENT',
      }),
      settlement({ id: 'in-1', installmentExternalId: 'ar-1', netAmount: '20102.67' }),
    ];
    const result = monthDetails({ settlements, direction: 'outflows' });
    const flow = chartMonth({ settlements });
    expect(result.total?.toString()).toBe('575');
    expect(result.items).toHaveLength(1);
    expect(flow.realized.outflows?.toString()).toBe('575');
  });

  it('mês sem movimento devolve total zero e lista vazia', () => {
    const result = monthDetails({
      monthKey: '2026-09',
      settlements: [settlement({ id: 'ago', installmentExternalId: 'ar-1', netAmount: '10' })],
    });
    const flow = chartMonth({
      monthKey: '2026-09',
      settlements: [settlement({ id: 'ago', installmentExternalId: 'ar-1', netAmount: '10' })],
    });
    expect(result.completeness).toBe('COMPLETE');
    expect(result.total?.toString()).toBe('0');
    expect(result.items).toEqual([]);
    expect(flow.realized.inflows?.toString()).toBe('0');
  });

  it('página parcial preserva o total do mês', () => {
    const settlements = [
      settlement({ id: 'a', installmentExternalId: 'ar-1', netAmount: '30.00', occurredOn: '2026-08-01' }),
      settlement({ id: 'b', installmentExternalId: 'ar-2', netAmount: '20.00', occurredOn: '2026-08-02' }),
    ];
    const page = monthDetails({ settlements, limit: 1 });
    expect(page.completeness).toBe('PARTIAL');
    expect(page.hasMore).toBe(true);
    expect(page.itemCount).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.total?.toString()).toBe('50');
    expect(page.returnedSum?.toString()).not.toBe(page.total?.toString());
    expect(page.limit).toBe(1);
    const rest = monthDetails({ settlements, limit: 1, offset: 1 });
    expect(rest.hasMore).toBe(false);
    expect(rest.total?.toString()).toBe('50');
    expect(rest.offset).toBe(1);
  });

  it('centro de custo e categoria usam a mesma atribuição do gráfico', () => {
    const match = installment({
      externalId: 'ar-cat',
      paid: '40',
      total: '100',
      categoryExternalIds: ['cat-a'],
    });
    const other = installment({
      externalId: 'ar-other',
      paid: '70',
      total: '70',
      categoryExternalIds: ['cat-b'],
    });
    const settlements = [
      settlement({ id: 's-cat', installmentExternalId: 'ar-cat', netAmount: '100' }),
      settlement({ id: 's-other', installmentExternalId: 'ar-other', netAmount: '70' }),
    ];
    const installments = new Map<string, FinancialInstallmentReadRecord>([
      ['RECEIVABLE:ar-cat', match],
      ['RECEIVABLE:ar-other', other],
    ]);
    const categoryFilter = { externalId: 'cat-a', type: 'REVENUE' as const };
    const costCenter = {
      expectedReceivables: [],
      expectedPayables: [],
      realizedReceivables: [{ amount: dec('40'), installment: match }],
      realizedPayables: [],
    };
    const filtered = monthDetails({
      settlements,
      installments,
      categoryFilter,
      costCenter,
      costCenterLabel: 'Centro Norte',
      categories: [{ externalId: 'cat-a', name: 'Convênio', type: 'REVENUE' }],
    });
    const flow = chartMonth({ settlements, installments, categoryFilter, costCenter });
    expect(filtered.total?.toString()).toBe('40');
    expect(filtered.items[0]?.costCenterLabel).toBe('Centro Norte');
    expect(filtered.items[0]?.categoryNames).toEqual(['Convênio']);
    expect(flow.realized.inflows?.toString()).toBe('40');
    expect(CASH_REALIZED_MONTH_DETAILS_LIMIT).toBeGreaterThan(1);
  });

  it('rejeita tenantId arbitrário e não fixa empresa', () => {
    expect(() =>
      parseCashRealizedMonthDetailsQuery({
        tenantId: 'tenant-b',
        month: MONTH,
        direction: 'inflows',
      }),
    ).toThrow(/tenantId/);
    expect(
      parseCashRealizedMonthDetailsQuery({ month: MONTH, direction: 'outflows', offset: '40' }),
    ).toMatchObject({ monthKey: MONTH, direction: 'outflows', offset: 40 });
  });
});
