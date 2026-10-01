import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { buildCashRealizedDayDetails } from '../src/modules/analytics/domain/cash-realized-day-details.js';
import { civilDateUtcFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { cashRealizedOccurredOnWhere } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createCashRealizedDetailsService } from '../src/modules/analytics/services/cash-realized-details.service.js';
import type { CashRealizedDetailsServiceDependencies } from '../src/modules/analytics/services/cash-realized-details.service.js';
import { parseCashRealizedDayDetailsQuery } from '../src/modules/dashboard/http/parse-cash-realized-day-details-query.js';

const TODAY = new Date('2026-08-26T00:00:00.000Z');
const DAY = '2026-08-25';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function installment(input: {
  readonly externalId: string;
  readonly total?: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly categoryExternalIds?: readonly string[];
  readonly kind?: 'RECEIVABLE' | 'PAYABLE';
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
    occurredOn: new Date(`${input.occurredOn ?? DAY}T00:00:00.000Z`),
    netAmount: dec(input.netAmount),
  };
}

function details(input: {
  readonly direction?: 'inflows' | 'outflows';
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
  readonly date?: string;
}) {
  return buildCashRealizedDayDetails({
    date: input.date ?? DAY,
    direction: input.direction ?? 'inflows',
    today: TODAY,
    settlements: input.settlements,
    realizedInstallments: input.installments,
    categories: input.categories,
    partyNames: input.partyNames ?? new Map(),
    categoryFilter: input.categoryFilter,
    costCenter: input.costCenter,
    costCenterLabel: input.costCenterLabel,
    limit: input.limit,
  });
}

function chartPoint(input: {
  readonly settlements: readonly CashSettlementSource[];
  readonly installments?: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  readonly categoryFilter?: { externalId: string; type: 'REVENUE' | 'EXPENSE' } | null;
  readonly costCenter?: Parameters<typeof details>[0]['costCenter'];
}) {
  const bounds = civilMonthBoundsFromKey('2026-08');
  const flow = calculateMonthlyCashFlow({
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
  return flow.daily.realized.find((point) => point.date.toISOString() === '2026-08-25T00:00:00.000Z');
}

describe('detalhe diário de caixa realizado', () => {
  it('INFLOW no dia exato fecha o ponto do gráfico', () => {
    const settlements = [
      settlement({ id: 's1', installmentExternalId: 'ar-1', netAmount: '70.50' }),
      settlement({ id: 's2', installmentExternalId: 'ar-2', netAmount: '7.22' }),
      settlement({
        id: 'other-day',
        installmentExternalId: 'ar-3',
        netAmount: '999',
        occurredOn: '2026-08-24',
      }),
    ];
    const result = details({ settlements });
    const point = chartPoint({ settlements });
    expect(result.completeness).toBe('COMPLETE');
    expect(result.total?.toString()).toBe('77.72');
    expect(result.returnedSum?.toString()).toBe('77.72');
    expect(result.difference?.toString()).toBe('0');
    expect(result.hasMore).toBe(false);
    expect(point?.inflows?.toString()).toBe(result.total?.toString());
  });

  it('OUTFLOW no dia exato fecha o ponto do gráfico', () => {
    const settlements = [
      settlement({
        id: 'out-1',
        installmentExternalId: 'ap-1',
        netAmount: '20.00',
        type: 'DISBURSEMENT',
      }),
      settlement({ id: 'in-1', installmentExternalId: 'ar-1', netAmount: '80' }),
    ];
    const result = details({ settlements, direction: 'outflows' });
    const point = chartPoint({ settlements });
    expect(result.total?.toString()).toBe('20');
    expect(point?.outflows?.toString()).toBe('20');
    expect(result.items).toHaveLength(1);
  });

  it('occurredOn é meia-noite UTC e não entra horário local', () => {
    expect(civilDateUtcFromKey(DAY)?.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    const settlements = [
      settlement({ id: 'utc', installmentExternalId: 'ar-1', netAmount: '10' }),
      {
        ...settlement({ id: 'afternoon', installmentExternalId: 'ar-2', netAmount: '99' }),
        occurredOn: new Date('2026-08-25T15:00:00.000Z'),
      },
    ];
    const result = details({ settlements });
    expect(result.total?.toString()).toBe('10');
    expect(result.itemCount).toBe(1);
  });

  it('consolidado usa o valor líquido e não a soma dos centros', () => {
    const allocated = installment({ externalId: 'ar-a', total: '100', paid: '100' });
    const loose = installment({ externalId: 'ar-b', total: '50', paid: '50' });
    const settlements = [
      settlement({ id: 's-a', installmentExternalId: 'ar-a', netAmount: '100' }),
      settlement({ id: 's-b', installmentExternalId: 'ar-b', netAmount: '50' }),
    ];
    const installments = new Map<string, FinancialInstallmentReadRecord>([
      ['RECEIVABLE:ar-a', allocated],
      ['RECEIVABLE:ar-b', loose],
    ]);
    const consolidated = details({ settlements, installments });
    const center = details({
      settlements,
      installments,
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [{ amount: dec('100'), installment: allocated }],
        realizedPayables: [],
      },
      costCenterLabel: 'Laranjeiras',
    });
    expect(consolidated.total?.toString()).toBe('150');
    expect(center.total?.toString()).toBe('100');
    expect(consolidated.total?.toString()).not.toBe(center.total?.toString());
    expect(center.items[0]?.costCenterLabel).toBe('Laranjeiras');
  });

  it('rateio atribuído fecha o ponto do centro', () => {
    const row = installment({ externalId: 'ar-cc', total: '100', paid: '100', unpaid: '0' });
    const settlements = [settlement({ id: 's-cc', installmentExternalId: 'ar-cc', netAmount: '100' })];
    const installments = new Map([['RECEIVABLE:ar-cc', row]]);
    const costCenter = {
      expectedReceivables: [],
      expectedPayables: [],
      realizedReceivables: [{ amount: dec('40'), installment: row }],
      realizedPayables: [],
    };
    const result = details({ settlements, installments, costCenter });
    const point = chartPoint({ settlements, installments, costCenter });
    expect(result.total?.toString()).toBe('40');
    expect(result.items[0]?.attributedAmount.toString()).toBe('40');
    expect(point?.inflows?.toString()).toBe('40');
  });

  it('filtro de categoria restringe o mesmo universo do gráfico', () => {
    const match = installment({
      externalId: 'ar-cat',
      paid: '30',
      total: '30',
      categoryExternalIds: ['cat-a'],
    });
    const other = installment({
      externalId: 'ar-other',
      paid: '70',
      total: '70',
      categoryExternalIds: ['cat-b'],
    });
    const settlements = [
      settlement({ id: 's-cat', installmentExternalId: 'ar-cat', netAmount: '30' }),
      settlement({ id: 's-other', installmentExternalId: 'ar-other', netAmount: '70' }),
    ];
    const installments = new Map<string, FinancialInstallmentReadRecord>([
      ['RECEIVABLE:ar-cat', match],
      ['RECEIVABLE:ar-other', other],
    ]);
    const categoryFilter = { externalId: 'cat-a', type: 'REVENUE' as const };
    const categories = [
      { externalId: 'cat-a', name: 'Convênio', type: 'REVENUE' as const },
      { externalId: 'cat-b', name: 'Particular', type: 'REVENUE' as const },
    ];
    const filtered = details({ settlements, installments, categoryFilter, categories });
    const open = details({ settlements, installments, categories });
    expect(filtered.total?.toString()).toBe('30');
    expect(filtered.items[0]?.categoryNames).toEqual(['Convênio']);
    expect(open.total?.toString()).toBe('100');
    expect(chartPoint({ settlements, installments, categoryFilter })?.inflows?.toString()).toBe('30');
  });

  it('sem contraparte usa descrição e, sem descrição, o fallback', () => {
    const described = installment({ externalId: 'ar-d', paid: '5', total: '5', description: 'Boleto' });
    const blank = installment({ externalId: 'ar-b', paid: '2', total: '2', description: '   ' });
    const named = installment({ externalId: 'ar-n', paid: '8', total: '8', partyId: 'p1' });
    const result = details({
      settlements: [
        settlement({ id: 's-d', installmentExternalId: 'ar-d', netAmount: '5' }),
        settlement({ id: 's-b', installmentExternalId: 'ar-b', netAmount: '2' }),
        settlement({ id: 's-n', installmentExternalId: 'ar-n', netAmount: '8' }),
      ],
      installments: new Map([
        ['RECEIVABLE:ar-d', described],
        ['RECEIVABLE:ar-b', blank],
        ['RECEIVABLE:ar-n', named],
      ]),
      partyNames: new Map([['p1', 'Empresa A']]),
    });
    const labels = result.items.map((item) => item.displayLabel).sort();
    expect(labels).toEqual(['Boleto', 'Empresa A', 'Sem contraparte identificada']);
    expect(result.itemCount).toBe(3);
  });

  it('zero real permanece zero e completo', () => {
    const result = details({ settlements: [] });
    expect(result.completeness).toBe('COMPLETE');
    expect(result.total?.toString()).toBe('0');
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('rateio indisponível não vira zero', () => {
    const row = installment({
      externalId: 'ar-u',
      total: '1000',
      paid: '500',
      unpaid: '500',
    });
    const result = details({
      settlements: [settlement({ id: 's-u', installmentExternalId: 'ar-u', netAmount: '500' })],
      installments: new Map([['RECEIVABLE:ar-u', row]]),
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [{ amount: dec('600'), installment: row }],
        realizedPayables: [],
      },
    });
    expect(result.completeness).toBe('UNAVAILABLE');
    expect(result.total).toBeNull();
    expect(result.returnedSum).toBeNull();
    expect(result.difference).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('transferência interna fica fora da população do ledger', () => {
    const where = cashRealizedOccurredOnWhere({
      tenantId: 'tenant-a',
      from: civilDateUtcFromKey(DAY)!,
      to: civilDateUtcFromKey(DAY)!,
    });
    expect(where.financialTransferId).toBeNull();
    expect(where.tenantId).toBe('tenant-a');
    expect(where.lifecycleStatus).toBe('ACTIVE');
  });

  it('PARTIAL devolve o total do dia e a diferença da página', () => {
    const result = details({
      limit: 1,
      settlements: [
        settlement({ id: 'small', installmentExternalId: 'ar-1', netAmount: '10' }),
        settlement({ id: 'large', installmentExternalId: 'ar-2', netAmount: '20' }),
      ],
    });
    expect(result.completeness).toBe('PARTIAL');
    expect(result.hasMore).toBe(true);
    expect(result.total?.toString()).toBe('30');
    expect(result.returnedSum?.toString()).toBe('20');
    expect(result.difference?.toString()).toBe('10');
    expect(result.items).toHaveLength(1);
    expect(result.itemCount).toBe(2);
  });

  it('data inválida no parser é rejeitada e tenantId do cliente também', () => {
    expect(() => parseCashRealizedDayDetailsQuery({ date: '2026-02-31', direction: 'inflows' })).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() =>
      parseCashRealizedDayDetailsQuery({ date: DAY, direction: 'inflows', tenantId: 'other' }),
    ).toThrow(/tenantId/);
    expect(parseCashRealizedDayDetailsQuery({ date: DAY, direction: 'outflows' })).toEqual({
      date: DAY,
      direction: 'outflows',
    });
  });

  it('o serviço consulta o ledger só do tenant e do dia UTC', async () => {
    const calls: { tenantId: string; from: Date; to: Date }[] = [];
    const service = createCashRealizedDetailsService({
      ledger: {
        listActiveByOccurredOn: async (query) => {
          calls.push({ tenantId: query.tenantId, from: query.from, to: query.to });
          return [];
        },
      },
      receivables: {
        findActiveByTenant: async () => [],
        findByExternalIds: async () => [],
      },
      payables: {
        findActiveByTenant: async () => [],
        findByExternalIds: async () => [],
      },
      categories: { findByTenantAndExternalIds: async () => [] },
      parties: { findNamesByIds: async () => new Map() },
    } as unknown as CashRealizedDetailsServiceDependencies);
    const result = await service.getCashRealizedDayDetails({
      tenantId: 'tenant-a',
      date: DAY,
      direction: 'inflows',
      now: TODAY,
    });
    expect(calls).toEqual([
      {
        tenantId: 'tenant-a',
        from: new Date('2026-08-25T00:00:00.000Z'),
        to: new Date('2026-08-25T00:00:00.000Z'),
      },
    ]);
    expect(result.completeness).toBe('COMPLETE');
    expect(result.total?.toString()).toBe('0');
  });
});
