import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../src/modules/finance/domain/types.js';
import { classifyCashAmountsByCategory } from '../src/modules/analytics/domain/cash-realized-category-composition.js';
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
    description: null,
    dueDate: civil(input.dueDate),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: null,
    total,
    paid,
    unpaid,
    categoryExternalIds: input.categoryExternalIds ?? [],
    syncedAt: TODAY,
  };
}

function settlement(
  input: {
    readonly installmentExternalId: string;
    readonly occurredOn: string;
    readonly netAmount: string;
    readonly type?: 'RECEIPT' | 'DISBURSEMENT';
    readonly kind?: 'RECEIVABLE' | 'PAYABLE';
  },
): CashSettlementSource {
  const type = input.type ?? 'RECEIPT';
  return {
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

function realizedMap(
  rows: readonly {
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly installment: FinancialInstallmentReadRecord;
  }[],
): Map<string, FinancialInstallmentReadRecord> {
  const map = new Map<string, FinancialInstallmentReadRecord>();
  for (const row of rows) {
    map.set(`${row.kind}:${row.installment.externalId}`, row.installment);
  }
  return map;
}

describe('CASH-4C-CAT — composição de caixa realizado por categoria', () => {
  it('CAT1/CAT7 — soma receitas por categoria = realized.inflows; RECEIPT na categoria', () => {
    const arA = installment({
      externalId: 'ar-a',
      dueDate: '2026-08-10',
      unpaid: '0',
      paid: '150000.00',
      status: 'PAID',
      categoryExternalIds: ['rev-servicos'],
    });
    const arB = installment({
      externalId: 'ar-b',
      dueDate: '2026-08-15',
      unpaid: '0',
      paid: '74790.30',
      status: 'PAID',
      categoryExternalIds: ['rev-produtos'],
    });
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [
        settlement({ installmentExternalId: 'ar-a', occurredOn: '2026-08-10', netAmount: '150000.00' }),
        settlement({ installmentExternalId: 'ar-b', occurredOn: '2026-08-15', netAmount: '74790.30' }),
      ],
      receivables: [arA, arB],
      payables: [],
      realizedInstallments: realizedMap([
        { kind: 'RECEIVABLE', installment: arA },
        { kind: 'RECEIVABLE', installment: arB },
      ]),
      categories: [
        category({ externalId: 'rev-servicos', name: 'Serviços', type: 'REVENUE' }),
        category({ externalId: 'rev-produtos', name: 'Produtos', type: 'REVENUE' }),
      ],
    });

    expect(result.realized.inflows?.toString()).toBe('224790.3');
    expect(result.realizedByCategory.inflows?.total.toString()).toBe('224790.3');
    const itemSum = result.realizedByCategory.inflows!.items.reduce(
      (acc, item) => acc.plus(item.amount),
      dec('0'),
    );
    expect(itemSum.toString()).toBe(result.realized.inflows!.toString());
    expect(result.realizedByCategory.inflows!.items.find((i) => i.name === 'Serviços')?.amount.toString()).toBe(
      '150000',
    );
  });

  it('CAT2/CAT8/CAT22 — soma despesas = realized.outflows; Clínica Life shape', () => {
    const apA = installment({
      externalId: 'ap-a',
      dueDate: '2026-08-05',
      unpaid: '0',
      paid: '60000.00',
      status: 'PAID',
      categoryExternalIds: ['exp-salarios'],
    });
    const apB = installment({
      externalId: 'ap-b',
      dueDate: '2026-08-20',
      unpaid: '0',
      paid: '38941.52',
      status: 'PAID',
      categoryExternalIds: ['exp-aluguel'],
    });
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [
        settlement({
          installmentExternalId: 'ap-a',
          occurredOn: '2026-08-05',
          netAmount: '60000.00',
          type: 'DISBURSEMENT',
        }),
        settlement({
          installmentExternalId: 'ap-b',
          occurredOn: '2026-08-20',
          netAmount: '38941.52',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [apA, apB],
      realizedInstallments: realizedMap([
        { kind: 'PAYABLE', installment: apA },
        { kind: 'PAYABLE', installment: apB },
      ]),
      categories: [
        category({ externalId: 'exp-salarios', name: 'Salários', type: 'EXPENSE' }),
        category({ externalId: 'exp-aluguel', name: 'Aluguel', type: 'EXPENSE' }),
      ],
    });

    expect(result.realized.outflows?.toString()).toBe('98941.52');
    expect(result.realizedByCategory.outflows?.total.toString()).toBe('98941.52');
    const itemSum = result.realizedByCategory.outflows!.items.reduce(
      (acc, item) => acc.plus(item.amount),
      dec('0'),
    );
    expect(itemSum.toString()).toBe('98941.52');
  });

  it('CAT3/CAT4/CAT5 — transferências não entram (ledger já exclui; domínio não inventa despesa)', () => {
    // Ghostes 10881/1313 nunca chegam em settlements (financialTransferId filter no repo).
    // Aqui: só RECEIPT operacional 100; sem DISBURSEMENT sintético.
    const ar = installment({
      externalId: 'ar-op',
      dueDate: '2026-08-01',
      unpaid: '0',
      paid: '100',
      status: 'PAID',
      categoryExternalIds: ['rev-servicos'],
    });
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [
        settlement({ installmentExternalId: 'ar-op', occurredOn: '2026-08-01', netAmount: '100' }),
      ],
      receivables: [ar],
      payables: [],
      realizedInstallments: realizedMap([{ kind: 'RECEIVABLE', installment: ar }]),
      categories: [category({ externalId: 'rev-servicos', name: 'Serviços', type: 'REVENUE' })],
    });
    expect(result.realized.inflows?.toString()).toBe('100');
    expect(result.realized.outflows?.toString()).toBe('0');
    expect(result.realizedByCategory.outflows?.total.toString()).toBe('0');
    expect(result.realizedByCategory.inflows?.items).toHaveLength(1);
  });

  it('CAT6 — settlement DELETED não chega ao domínio (lista vazia)', () => {
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [],
      receivables: [],
      payables: [],
    });
    expect(result.realized.inflows?.toString()).toBe('0');
    expect(result.realizedByCategory.inflows?.total.toString()).toBe('0');
  });

  it('CAT9 — sem categoria não desaparece do total', () => {
    const ar = installment({
      externalId: 'ar-bare',
      dueDate: '2026-08-08',
      unpaid: '0',
      paid: '50',
      status: 'PAID',
      categoryExternalIds: [],
    });
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [
        settlement({ installmentExternalId: 'ar-bare', occurredOn: '2026-08-08', netAmount: '50' }),
      ],
      receivables: [ar],
      payables: [],
      realizedInstallments: realizedMap([{ kind: 'RECEIVABLE', installment: ar }]),
      categories: [],
    });
    expect(result.realized.inflows?.toString()).toBe('50');
    expect(result.realizedByCategory.inflows?.uncategorized.toString()).toBe('50');
    expect(result.realizedByCategory.inflows?.total.toString()).toBe('50');
  });

  it('CAT14 — CC unavailable → composição null (não zero)', () => {
    const ap = installment({
      externalId: 'ap-multi',
      dueDate: '2026-08-10',
      unpaid: '40',
      paid: '60',
      total: '100',
      status: 'PARTIALLY_PAID',
      categoryExternalIds: ['exp-a'],
    });
    const result = calculateMonthlyCashFlow({
      tenantId: 't1',
      today: TODAY,
      from: AUG.from,
      to: AUG.to,
      settlements: [
        settlement({
          installmentExternalId: 'ap-multi',
          occurredOn: '2026-08-10',
          netAmount: '60',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [ap],
      realizedInstallments: realizedMap([{ kind: 'PAYABLE', installment: ap }]),
      categories: [category({ externalId: 'exp-a', name: 'A', type: 'EXPENSE' })],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [],
        realizedPayables: [{ amount: dec('40'), installment: ap }],
      },
    });
    expect(result.costCenterCashSplit).toBe(false);
    expect(result.realized.outflows).toBeNull();
    expect(result.realizedByCategory.outflows).toBeNull();
    expect(result.realizedByCategory.inflows).toBeNull();
  });

  it('CAT18/CAT19 — percentuais sobre total realizado; Outras preserva soma', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      amount: dec('10'),
      categoryExternalIds: [`c-${index}`],
    }));
    const categories = rows.map((row, index) =>
      category({
        externalId: `c-${index}`,
        name: `Cat ${index}`,
        type: 'REVENUE',
      }),
    );
    const composition = classifyCashAmountsByCategory(rows, categories, 'REVENUE', 10);
    expect(composition.total.toString()).toBe('120');
    const itemSum = composition.items.reduce((acc, item) => acc.plus(item.amount), dec('0'));
    expect(itemSum.toString()).toBe('120');
    const other = composition.items.find((item) => item.kind === 'other');
    expect(other?.amount.toString()).toBe('20');
    const pctSum = composition.items.reduce((acc, item) => acc.plus(item.percentage), dec('0'));
    expect(pctSum.toFixed(4)).toBe('100.0000');
  });
});
