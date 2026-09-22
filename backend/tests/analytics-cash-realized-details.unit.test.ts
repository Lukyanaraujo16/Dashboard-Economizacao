import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../src/modules/finance/domain/types.js';
import { buildCashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';

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
    readonly externalId: string;
    readonly dueDate: string;
    readonly unpaid?: string;
    readonly paid?: string;
    readonly total?: string;
    readonly status?: FinancialInstallmentReadRecord['status'];
    readonly categoryExternalIds?: readonly string[];
    readonly description?: string | null;
    readonly partyId?: string | null;
    readonly kind?: 'RECEIVABLE' | 'PAYABLE';
  },
): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  const total = dec(input.total ?? unpaid.plus(paid).toString());
  return {
    id: input.externalId,
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

function settlement(
  input: {
    readonly settlementExternalId: string;
    readonly installmentExternalId: string;
    readonly occurredOn: string;
    readonly netAmount: string;
    readonly type?: 'RECEIPT' | 'DISBURSEMENT';
    readonly kind?: 'RECEIVABLE' | 'PAYABLE';
  },
): CashSettlementSource {
  const type = input.type ?? 'RECEIPT';
  return {
    settlementExternalId: input.settlementExternalId,
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.kind ?? (type === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE'),
    transactionType: type,
    occurredOn: civil(input.occurredOn),
    netAmount: dec(input.netAmount),
  };
}

function category(
  input: Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>,
): Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'> {
  return input;
}

function parentAmount(
  flow: ReturnType<typeof calculateMonthlyCashFlow>,
  direction: 'inflows' | 'outflows',
  categoryKey: string,
): string {
  const composition = flow.realizedByCategory[direction];
  const item = composition?.items.find((row) => row.key === categoryKey);
  return item?.amount.toString() ?? '0';
}

describe('cash-realized-details (12-B)', () => {
  it('1/8 — inflow única categoria: SUM(attributedAmount) = pai', () => {
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '100',
      categoryExternalIds: ['cat-rev'],
      description: 'Consulta',
      partyId: 'party-a',
    });
    const settlements = [
      settlement({
        settlementExternalId: 's1',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-05',
        netAmount: '100',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [ar],
      payables: [],
      realizedInstallments,
      categories,
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map([['party-a', 'Cliente A']]),
      limit: 100,
      offset: 0,
    });
    expect(details.available).toBe(true);
    expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', 'cat-rev'));
    expect(details.total?.toString()).toBe('100');
    expect(details.items).toHaveLength(1);
    expect(details.items[0]?.partyName).toBe('Cliente A');
    expect(details.items[0]?.description).toBe('Consulta');
    expect(details.items[0]?.attributedAmount.toString()).toBe('100');
    expect(details.items[0]?.netAmount.toString()).toBe('100');
  });

  it('2 — inflow com múltiplas categorias; cada key reconcilia', () => {
    const ar1 = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '80',
      categoryExternalIds: ['cat-a'],
      partyId: 'p1',
    });
    const ar2 = installment({
      externalId: 'ar-2',
      dueDate: '2026-08-11',
      paid: '20',
      categoryExternalIds: ['cat-b'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's1',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-05',
        netAmount: '80',
      }),
      settlement({
        settlementExternalId: 's2',
        installmentExternalId: 'ar-2',
        occurredOn: '2026-08-06',
        netAmount: '20',
      }),
    ];
    const categories = [
      category({ externalId: 'cat-a', name: 'A', type: 'REVENUE' }),
      category({ externalId: 'cat-b', name: 'B', type: 'REVENUE' }),
    ];
    const realizedInstallments = new Map([
      ['RECEIVABLE:ar-1', ar1],
      ['RECEIVABLE:ar-2', ar2],
    ]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [ar1, ar2],
      payables: [],
      realizedInstallments,
      categories,
    });
    for (const key of ['cat-a', 'cat-b'] as const) {
      const details = buildCashRealizedDetails({
        tenantId: 't1',
        today: TODAY,
        from: AUG.from,
        to: AUG.to,
        monthKey: '2026-08',
        direction: 'inflows',
        categoryKey: key,
        settlements,
        realizedInstallments,
        categories,
        partyNames: new Map([['p1', 'Party 1']]),
        limit: 100,
        offset: 0,
      });
      expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', key));
    }
  });

  it('3 — outflow', () => {
    const ap = installment({
      externalId: 'ap-1',
      dueDate: '2026-08-10',
      paid: '50',
      categoryExternalIds: ['cat-exp'],
      partyId: 'supplier-1',
      description: 'Folha',
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-out',
        installmentExternalId: 'ap-1',
        occurredOn: '2026-08-07',
        netAmount: '50',
        type: 'DISBURSEMENT',
        kind: 'PAYABLE',
      }),
    ];
    const categories = [category({ externalId: 'cat-exp', name: 'Salários', type: 'EXPENSE' })];
    const realizedInstallments = new Map([['PAYABLE:ap-1', ap]]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [],
      payables: [ap],
      realizedInstallments,
      categories,
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'outflows',
      categoryKey: 'cat-exp',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map([['supplier-1', 'Fornecedor X']]),
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe(parentAmount(flow, 'outflows', 'cat-exp'));
    expect(details.items[0]?.partyName).toBe('Fornecedor X');
  });

  it('4/5/6 — party presente, ausente e description', () => {
    const withParty = installment({
      externalId: 'ar-p',
      dueDate: '2026-08-10',
      paid: '10',
      categoryExternalIds: ['cat-rev'],
      partyId: 'party-ok',
      description: 'Com party',
    });
    const withoutParty = installment({
      externalId: 'ar-n',
      dueDate: '2026-08-10',
      paid: '5',
      categoryExternalIds: ['cat-rev'],
      description: 'Sem party',
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-p',
        installmentExternalId: 'ar-p',
        occurredOn: '2026-08-01',
        netAmount: '10',
      }),
      settlement({
        settlementExternalId: 's-n',
        installmentExternalId: 'ar-n',
        occurredOn: '2026-08-02',
        netAmount: '5',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([
      ['RECEIVABLE:ar-p', withParty],
      ['RECEIVABLE:ar-n', withoutParty],
    ]);
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map([['party-ok', 'Nome Party']]),
      limit: 100,
      offset: 0,
    });
    expect(details.items.find((i) => i.settlementExternalId === 's-p')?.partyName).toBe('Nome Party');
    expect(details.items.find((i) => i.settlementExternalId === 's-n')?.partyName).toBeNull();
    expect(details.items.find((i) => i.settlementExternalId === 's-n')?.description).toBe('Sem party');
  });

  it('7 — múltiplas baixas da mesma party somam no total', () => {
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '30',
      categoryExternalIds: ['cat-rev'],
      partyId: 'same',
    });
    const settlements = [
      settlement({
        settlementExternalId: 's1',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-01',
        netAmount: '10',
      }),
      settlement({
        settlementExternalId: 's2',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-02',
        netAmount: '20',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map([['same', 'Mesma']]),
      limit: 100,
      offset: 0,
    });
    expect(details.itemCount).toBe(2);
    expect(details.total?.toString()).toBe('30');
    expect(details.items.every((i) => i.partyName === 'Mesma')).toBe(true);
  });

  it('9 — installment DELETED ainda fornece metadata (join historical)', () => {
    const ar = installment({
      externalId: 'ar-del',
      dueDate: '2026-08-10',
      paid: '40',
      status: 'PAID',
      categoryExternalIds: ['cat-rev'],
      partyId: 'party-del',
      description: 'Histórico',
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-del',
        installmentExternalId: 'ar-del',
        occurredOn: '2026-08-08',
        netAmount: '40',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    // Somente no realizedInstallments (como findByExternalIds), fora de receivables ACTIVE.
    const realizedInstallments = new Map([['RECEIVABLE:ar-del', ar]]);
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map([['party-del', 'Cliente Histórico']]),
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe('40');
    expect(details.items[0]?.partyName).toBe('Cliente Histórico');
    expect(details.items[0]?.description).toBe('Histórico');
  });

  it('10 — transferência não entra (já filtrada na população de settlements)', () => {
    // O ledger repo exclui financialTransferId; aqui a população já chega limpa.
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '10',
      categoryExternalIds: ['cat-rev'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-ok',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-05',
        netAmount: '10',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.itemCount).toBe(1);
    expect(details.total?.toString()).toBe('10');
  });

  it('11 — cost center historical: attributedAmount = share, reconcilia com pai', () => {
    const ar = installment({
      externalId: 'ar-cc',
      dueDate: '2026-08-20',
      total: '100',
      paid: '100',
      unpaid: '0',
      status: 'PAID',
      categoryExternalIds: ['cat-rev'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-cc',
        installmentExternalId: 'ar-cc',
        occurredOn: '2026-08-10',
        netAmount: '100',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-cc', ar]]);
    const costCenter = {
      expectedReceivables: [],
      expectedPayables: [],
      realizedReceivables: [{ amount: dec('40'), installment: ar }],
      realizedPayables: [],
    };
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [],
      payables: [],
      realizedInstallments,
      categories,
      costCenter,
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      costCenter,
      limit: 100,
      offset: 0,
    });
    expect(details.items[0]?.netAmount.toString()).toBe('100');
    expect(details.items[0]?.attributedAmount.toString()).toBe('40');
    expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', 'cat-rev'));
    expect(details.total?.toString()).toBe('40');
  });

  it('12 — tenant isolation: builder não mistura fatos de outro tenant (população já scoped)', () => {
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '7',
      categoryExternalIds: ['cat-rev'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's1',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-05',
        netAmount: '7',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const details = buildCashRealizedDetails({
      tenantId: 'tenant-a',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.tenantId).toBe('tenant-a');
    expect(details.total?.toString()).toBe('7');
  });

  it('13 — uncategorized', () => {
    const ar = installment({
      externalId: 'ar-u',
      dueDate: '2026-08-10',
      paid: '15',
      categoryExternalIds: [],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-u',
        installmentExternalId: 'ar-u',
        occurredOn: '2026-08-05',
        netAmount: '15',
      }),
    ];
    const realizedInstallments = new Map([['RECEIVABLE:ar-u', ar]]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [ar],
      payables: [],
      realizedInstallments,
      categories: [],
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      settlements,
      realizedInstallments,
      categories: [],
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', 'uncategorized'));
    expect(details.items[0]?.categoryKind).toBe('uncategorized');
  });

  it('14 — imprecise (multi category ids)', () => {
    const ar = installment({
      externalId: 'ar-i',
      dueDate: '2026-08-10',
      paid: '25',
      categoryExternalIds: ['c1', 'c2'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-i',
        installmentExternalId: 'ar-i',
        occurredOn: '2026-08-05',
        netAmount: '25',
      }),
    ];
    const categories = [
      category({ externalId: 'c1', name: 'C1', type: 'REVENUE' }),
      category({ externalId: 'c2', name: 'C2', type: 'REVENUE' }),
    ];
    const realizedInstallments = new Map([['RECEIVABLE:ar-i', ar]]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [ar],
      payables: [],
      realizedInstallments,
      categories,
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'imprecise',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', 'imprecise'));
    expect(details.items[0]?.categoryKind).toBe('imprecise');
  });

  it('15 — paginação mantém total global', () => {
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '60',
      categoryExternalIds: ['cat-rev'],
    });
    const settlements = [1, 2, 3].map((n) =>
      settlement({
        settlementExternalId: `s${n}`,
        installmentExternalId: 'ar-1',
        occurredOn: `2026-08-0${n}`,
        netAmount: '20',
      }),
    );
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const page1 = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 2,
      offset: 0,
    });
    const page2 = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 2,
      offset: 2,
    });
    expect(page1.total?.toString()).toBe('60');
    expect(page2.total?.toString()).toBe('60');
    expect(page1.itemCount).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
  });

  it('16 — month scope exclui baixa fora do mês', () => {
    const ar = installment({
      externalId: 'ar-1',
      dueDate: '2026-08-10',
      paid: '10',
      categoryExternalIds: ['cat-rev'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 'in',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-08-05',
        netAmount: '10',
      }),
      settlement({
        settlementExternalId: 'out',
        installmentExternalId: 'ar-1',
        occurredOn: '2026-07-31',
        netAmount: '99',
      }),
    ];
    const categories = [category({ externalId: 'cat-rev', name: 'Serviços', type: 'REVENUE' })];
    const realizedInstallments = new Map([['RECEIVABLE:ar-1', ar]]);
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-rev',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe('10');
    expect(details.items.map((i) => i.settlementExternalId)).toEqual(['in']);
  });

  it('17 — category filter Home restringe população', () => {
    const arKeep = installment({
      externalId: 'ar-keep',
      dueDate: '2026-08-10',
      paid: '10',
      categoryExternalIds: ['cat-keep'],
    });
    const arDrop = installment({
      externalId: 'ar-drop',
      dueDate: '2026-08-10',
      paid: '90',
      categoryExternalIds: ['cat-drop'],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-keep',
        installmentExternalId: 'ar-keep',
        occurredOn: '2026-08-05',
        netAmount: '10',
      }),
      settlement({
        settlementExternalId: 's-drop',
        installmentExternalId: 'ar-drop',
        occurredOn: '2026-08-05',
        netAmount: '90',
      }),
    ];
    const categories = [
      category({ externalId: 'cat-keep', name: 'Keep', type: 'REVENUE' }),
      category({ externalId: 'cat-drop', name: 'Drop', type: 'REVENUE' }),
    ];
    const realizedInstallments = new Map([
      ['RECEIVABLE:ar-keep', arKeep],
      ['RECEIVABLE:ar-drop', arDrop],
    ]);
    const categoryFilter = {
      externalId: 'cat-keep',
      type: 'REVENUE' as const,
    };
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [arKeep, arDrop],
      payables: [],
      realizedInstallments,
      categories,
      categoryFilter,
    });
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'cat-keep',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      categoryFilter,
      limit: 100,
      offset: 0,
    });
    expect(details.total?.toString()).toBe(parentAmount(flow, 'inflows', 'cat-keep'));
    expect(details.itemCount).toBe(1);
  });

  it('18 — metadata ausente não descarta o fato do ledger', () => {
    const settlements = [
      settlement({
        settlementExternalId: 'orphan',
        installmentExternalId: 'missing-ar',
        occurredOn: '2026-08-05',
        netAmount: '12',
      }),
    ];
    const details = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      settlements,
      realizedInstallments: new Map(),
      categories: [],
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    expect(details.itemCount).toBe(1);
    expect(details.items[0]?.description).toBeNull();
    expect(details.items[0]?.partyName).toBeNull();
    expect(details.total?.toString()).toBe('12');
  });

  it('29 — kind+key: nominal key=uncategorized ≠ bucket uncategorized', () => {
    const nominal = installment({
      externalId: 'ar-nom',
      dueDate: '2026-08-10',
      paid: '70',
      categoryExternalIds: ['uncategorized'],
    });
    const empty = installment({
      externalId: 'ar-empty',
      dueDate: '2026-08-10',
      paid: '30',
      categoryExternalIds: [],
    });
    const settlements = [
      settlement({
        settlementExternalId: 's-nom',
        installmentExternalId: 'ar-nom',
        occurredOn: '2026-08-05',
        netAmount: '70',
      }),
      settlement({
        settlementExternalId: 's-empty',
        installmentExternalId: 'ar-empty',
        occurredOn: '2026-08-06',
        netAmount: '30',
      }),
    ];
    const categories = [
      category({ externalId: 'uncategorized', name: 'Categoria Literal', type: 'REVENUE' }),
    ];
    const realizedInstallments = new Map([
      ['RECEIVABLE:ar-nom', nominal],
      ['RECEIVABLE:ar-empty', empty],
    ]);
    const flow = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements,
      receivables: [nominal, empty],
      payables: [],
      realizedInstallments,
      categories,
    });
    const byKeyOnly = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    // Sem kind, as duas chaves colidem — soma mistura (70+30).
    expect(byKeyOnly.total?.toString()).toBe('100');

    const nominalOnly = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      categoryKind: 'category',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    const bucketOnly = buildCashRealizedDetails({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      monthKey: '2026-08',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      categoryKind: 'uncategorized',
      settlements,
      realizedInstallments,
      categories,
      partyNames: new Map(),
      limit: 100,
      offset: 0,
    });
    const parentNominal = flow.realizedByCategory.inflows!.items.find(
      (i) => i.key === 'uncategorized' && i.kind === 'category',
    );
    const parentBucket = flow.realizedByCategory.inflows!.items.find(
      (i) => i.key === 'uncategorized' && i.kind === 'uncategorized',
    );
    expect(parentNominal?.amount.toString()).toBe('70');
    expect(parentBucket?.amount.toString()).toBe('30');
    expect(nominalOnly.total?.toString()).toBe('70');
    expect(bucketOnly.total?.toString()).toBe('30');
    expect(nominalOnly.items).toHaveLength(1);
    expect(bucketOnly.items).toHaveLength(1);
  });
});
