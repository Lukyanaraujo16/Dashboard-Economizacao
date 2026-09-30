import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  calculateMonthlyCashFlow,
  monthlyBilling,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';

const TODAY = new Date('2026-09-10T00:00:00.000Z');
const SEPTEMBER = civilMonthBoundsFromKey('2026-09');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function civil(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function installment(input: {
  readonly externalId: string;
  readonly dueDate: string;
  readonly total: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly status?: FinancialInstallmentReadRecord['status'];
}): FinancialInstallmentReadRecord {
  const total = dec(input.total);
  const paid = dec(input.paid ?? '0');
  const unpaid = dec(input.unpaid ?? total.minus(paid).toString());
  return {
    id: input.externalId,
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
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
    partyId: null,
    categoryExternalIds: [],
    syncedAt: TODAY,
  };
}

function settlement(input: {
  readonly installmentExternalId: string;
  readonly occurredOn: string;
  readonly netAmount: string;
  readonly type: 'RECEIPT' | 'DISBURSEMENT';
}): CashSettlementSource {
  return {
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.type === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE',
    transactionType: input.type,
    occurredOn: civil(input.occurredOn),
    netAmount: dec(input.netAmount),
  };
}

function monthFlow(
  input: Omit<Parameters<typeof calculateMonthlyCashFlow>[0], 'tenantId' | 'today' | 'from' | 'to'>,
) {
  return calculateMonthlyCashFlow({
    tenantId: 'tenant-1',
    today: TODAY,
    from: SEPTEMBER.from,
    to: SEPTEMBER.to,
    ...input,
  });
}

describe('escopo temporal do centro de custo na Home', () => {
  it('parcela OPEN do mês com alocação válida mantém o agregado disponível', () => {
    const openTitle = installment({
      externalId: 'ap-month',
      dueDate: '2026-09-15',
      total: '180',
    });
    const flow = monthFlow({
      settlements: [],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('180'), installment: openTitle }],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.expected.payables?.toString()).toBe('180');
    expect(monthlyBilling(flow)?.toString()).toBe('0');
  });

  it('alocação acima do total no mês selecionado mantém o previsto fail-closed', () => {
    const openTitle = installment({
      externalId: 'ap-over-month',
      dueDate: '2026-09-20',
      total: '180',
    });
    const flow = monthFlow({
      settlements: [
        settlement({
          installmentExternalId: 'paid-in-month',
          occurredOn: '2026-09-10',
          netAmount: '40',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('840'), installment: openTitle }],
        realizedReceivables: [],
        realizedPayables: [
          {
            amount: dec('40'),
            installment: installment({
              externalId: 'paid-in-month',
              dueDate: '2026-09-10',
              total: '40',
              paid: '40',
              unpaid: '0',
              status: 'PAID',
            }),
          },
        ],
      },
    });

    expect(flow.expected.payables).toBeNull();
    expect(flow.costCenterCashSplit).toBe(false);
    expect(flow.realized.outflows?.toString()).toBe('40');
  });

  it('parcela OPEN futura com alocação acima do total não derruba o previsto do mês', () => {
    const inMonth = installment({
      externalId: 'ap-in-month',
      dueDate: '2026-09-18',
      total: '50',
    });
    const future = installment({
      externalId: 'ap-future',
      dueDate: '2027-09-30',
      total: '180',
    });
    const later = installment({
      externalId: 'ap-later',
      dueDate: '2028-07-30',
      total: '180',
    });
    const flow = monthFlow({
      settlements: [],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [
          { amount: dec('50'), installment: inMonth },
          { amount: dec('840'), installment: future },
          { amount: dec('840'), installment: later },
        ],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.expected.payables?.toString()).toBe('50');
    expect(flow.overdue.payables?.toString()).toBe('0');
    expect(flow.stock.payables.open?.toString()).toBe('50');
  });

  it('realizado EXACT do mês permanece quando a inconsistência está só no previsto futuro', () => {
    const realizedTitle = installment({
      externalId: 'ap-realized',
      dueDate: '2026-09-05',
      total: '70',
      paid: '70',
      unpaid: '0',
      status: 'PAID',
    });
    const receiptTitle = installment({
      externalId: 'ar-realized',
      dueDate: '2026-09-06',
      total: '30',
      paid: '30',
      unpaid: '0',
      status: 'PAID',
    });
    const future = installment({
      externalId: 'ap-future',
      dueDate: '2027-09-30',
      total: '180',
    });
    const flow = monthFlow({
      settlements: [
        settlement({
          installmentExternalId: 'ar-realized',
          occurredOn: '2026-09-06',
          netAmount: '30',
          type: 'RECEIPT',
        }),
        settlement({
          installmentExternalId: 'ap-realized',
          occurredOn: '2026-09-05',
          netAmount: '70',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('840'), installment: future }],
        realizedReceivables: [{ amount: dec('30'), installment: receiptTitle }],
        realizedPayables: [{ amount: dec('70'), installment: realizedTitle }],
      },
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.realized.inflows?.toString()).toBe('30');
    expect(flow.realized.outflows?.toString()).toBe('70');
    expect(flow.realized.result?.toString()).toBe('-40');
    expect(flow.expected.payables?.toString()).toBe('0');
    expect(flow.realizedByCategory.outflows).not.toBeNull();
    expect(monthlyBilling(flow)?.toString()).toBe('30');
  });

  it('vários centros não recebem clamp nem a parte de outro centro', () => {
    const shared = installment({
      externalId: 'ap-multi',
      dueDate: '2026-09-12',
      total: '1000',
    });
    const over = installment({
      externalId: 'ap-multi-over',
      dueDate: '2026-09-12',
      total: '180',
    });
    const exactShare = monthFlow({
      settlements: [],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('600'), installment: shared }],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });
    const overShare = monthFlow({
      settlements: [],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [
          { amount: dec('500'), installment: over },
          { amount: dec('500'), installment: over },
        ],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });

    expect(exactShare.costCenterCashSplit).toBe(true);
    expect(exactShare.expected.payables?.toString()).toBe('600');
    expect(overShare.expected.payables).toBeNull();
    expect(overShare.costCenterCashSplit).toBe(false);
  });

  it('centro só com alocações válidas não regride', () => {
    const openTitle = installment({
      externalId: 'ap-healthy',
      dueDate: '2026-09-22',
      total: '90',
    });
    const flow = monthFlow({
      settlements: [
        settlement({
          installmentExternalId: 'ap-healthy-paid',
          occurredOn: '2026-09-08',
          netAmount: '25',
          type: 'DISBURSEMENT',
        }),
      ],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('90'), installment: openTitle }],
        realizedReceivables: [],
        realizedPayables: [
          {
            amount: dec('25'),
            installment: installment({
              externalId: 'ap-healthy-paid',
              dueDate: '2026-09-08',
              total: '25',
              paid: '25',
              unpaid: '0',
              status: 'PAID',
            }),
          },
        ],
      },
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.realized.outflows?.toString()).toBe('25');
    expect(flow.expected.payables?.toString()).toBe('90');
  });

  it('consolidado sem centro de custo ignora o rateio', () => {
    const flow = monthFlow({
      settlements: [
        settlement({
          installmentExternalId: 'ar-all',
          occurredOn: '2026-09-04',
          netAmount: '100',
          type: 'RECEIPT',
        }),
      ],
      receivables: [
        installment({
          externalId: 'ar-open',
          dueDate: '2026-09-28',
          total: '40',
        }),
      ],
      payables: [
        installment({
          externalId: 'ap-open',
          dueDate: '2026-09-28',
          total: '15',
        }),
      ],
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.realized.inflows?.toString()).toBe('100');
    expect(flow.expected.receivables?.toString()).toBe('40');
    expect(flow.expected.payables?.toString()).toBe('15');
  });

  it('mês sem movimento continua zero disponível, mesmo com inconsistência futura', () => {
    const future = installment({
      externalId: 'ap-future',
      dueDate: '2028-07-30',
      total: '180',
    });
    const flow = monthFlow({
      settlements: [],
      receivables: [],
      payables: [],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [{ amount: dec('840'), installment: future }],
        realizedReceivables: [],
        realizedPayables: [],
      },
    });

    expect(flow.costCenterCashSplit).toBe(true);
    expect(flow.realized.inflows?.toString()).toBe('0');
    expect(flow.realized.outflows?.toString()).toBe('0');
    expect(flow.expected.receivables?.toString()).toBe('0');
    expect(flow.expected.payables?.toString()).toBe('0');
    expect(monthlyBilling(flow)?.toString()).toBe('0');
  });
});
