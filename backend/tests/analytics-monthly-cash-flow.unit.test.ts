import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  attributeSettlementNetToCostCenter,
  calculateMonthlyCashFlow,
  monthlyBilling,
  type CashSettlementSource,
} from '../src/modules/analytics/domain/monthly-cash-flow.js';

const TODAY = new Date('2026-08-26T00:00:00.000Z');
const AUG = civilMonthBoundsFromKey('2026-08');
const SEP = civilMonthBoundsFromKey('2026-09');
const OCT = civilMonthBoundsFromKey('2026-10');

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
    readonly competenceDate?: string | null;
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
    competenceDate: input.competenceDate ? civil(input.competenceDate) : null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: null,
    total,
    paid,
    unpaid,
    partyId: null,
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

function cash(
  overrides: Partial<Parameters<typeof calculateMonthlyCashFlow>[0]> & {
    readonly today?: Date;
    readonly month?: typeof AUG;
  } = {},
) {
  const { month, today, from, to, ...rest } = overrides;
  const bounds = month ?? AUG;
  return calculateMonthlyCashFlow({
    tenantId: 't1',
    settlements: [],
    receivables: [],
    payables: [],
    ...rest,
    today: today ?? TODAY,
    from: from ?? bounds.from,
    to: to ?? bounds.to,
  });
}

describe('calculateMonthlyCashFlow', () => {
  it('1 — recebimento no prazo entra no realizado do mês da baixa', () => {
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'ar-1', occurredOn: '2026-08-10', netAmount: '100' })],
      receivables: [installment({ externalId: 'ar-1', dueDate: '2026-08-10', unpaid: '0', paid: '100', status: 'PAID' })],
    });
    expect(result.realized.inflows?.toString()).toBe('100');
    expect(result.expected.receivables?.toString()).toBe('0');
  });

  it('2 — pagamento no prazo', () => {
    const result = cash({
      settlements: [
        settlement({
          installmentExternalId: 'ap-1',
          occurredOn: '2026-08-12',
          netAmount: '80',
          type: 'DISBURSEMENT',
        }),
      ],
    });
    expect(result.realized.outflows?.toString()).toBe('80');
    expect(result.realized.result?.toString()).toBe('-80');
  });

  it('3 — recebimento tardio: realizado no mês da baixa, não do vencimento', () => {
    const august = cash({
      month: AUG,
      today: civil('2026-11-01'),
      settlements: [settlement({ installmentExternalId: 'late', occurredOn: '2026-10-15', netAmount: '1000' })],
      receivables: [
        installment({
          externalId: 'late',
          dueDate: '2026-08-31',
          unpaid: '0',
          paid: '1000',
          status: 'PAID',
        }),
      ],
    });
    const october = cash({
      month: OCT,
      today: civil('2026-11-01'),
      settlements: [settlement({ installmentExternalId: 'late', occurredOn: '2026-10-15', netAmount: '1000' })],
    });
    expect(august.realized.inflows?.toString()).toBe('0');
    expect(august.expected.receivables?.toString()).toBe('0');
    expect(october.realized.inflows?.toString()).toBe('1000');
  });

  it('4 — pagamento tardio', () => {
    const result = cash({
      month: OCT,
      today: civil('2026-11-01'),
      settlements: [
        settlement({
          installmentExternalId: 'ap-late',
          occurredOn: '2026-10-20',
          netAmount: '250',
          type: 'DISBURSEMENT',
        }),
      ],
    });
    expect(result.realized.outflows?.toString()).toBe('250');
  });

  it('5 — aberto futuro não entra no previsto do mês corrente', () => {
    const result = cash({
      receivables: [installment({ externalId: 'fut', dueDate: '2026-11-15', unpaid: '500' })],
    });
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.overdue.receivables?.toString()).toBe('0');
  });

  it('6 — vencido D1 independente do mês selecionado', () => {
    const overdue = installment({ externalId: 'ov', dueDate: '2026-07-01', unpaid: '200' });
    const august = cash({ receivables: [overdue], month: AUG });
    const september = cash({ receivables: [overdue], month: SEP, today: TODAY });
    expect(august.overdue.receivables?.toString()).toBe('200');
    expect(september.overdue.receivables?.toString()).toBe('200');
    expect(august.expected.receivables?.toString()).toBe('0');
    expect(august.overdue.ofMonth.receivables?.toString()).toBe('0');
  });

  it('7 — parcial com duas baixas não duplica', () => {
    const rows = [
      settlement({ installmentExternalId: 'p', occurredOn: '2026-09-10', netAmount: '4000' }),
      settlement({ installmentExternalId: 'p', occurredOn: '2026-10-15', netAmount: '6000' }),
    ];
    const september = cash({ month: SEP, today: civil('2026-11-01'), settlements: rows });
    const october = cash({ month: OCT, today: civil('2026-11-01'), settlements: rows });
    expect(september.realized.inflows?.toString()).toBe('4000');
    expect(october.realized.inflows?.toString()).toBe('6000');
    expect(september.realized.inflows?.plus(october.realized.inflows ?? 0).toString()).toBe('10000');
  });

  it('8 — juros/multa usam net, nunca gross', () => {
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'int', occurredOn: '2026-08-05', netAmount: '301.05' })],
    });
    expect(result.realized.inflows?.toString()).toBe('301.05');
  });

  it('C/D — competência e vencimento diferentes não movem o realizado', () => {
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'x', occurredOn: '2026-08-20', netAmount: '50' })],
      receivables: [
        installment({
          externalId: 'x',
          dueDate: '2026-07-01',
          competenceDate: '2026-06-15',
          unpaid: '0',
          paid: '50',
          status: 'PAID',
        }),
      ],
    });
    expect(result.realized.inflows?.toString()).toBe('50');
    expect(result.monthKey).toBe('2026-08');
  });

  it('F — quitado não aparece em previsto', () => {
    const result = cash({
      today: civil('2026-08-10'),
      receivables: [
        installment({
          externalId: 'paid',
          dueDate: '2026-08-31',
          unpaid: '0',
          paid: '10',
          status: 'PAID',
        }),
      ],
    });
    expect(result.expected.receivables?.toString()).toBe('0');
  });

  it('G — vencido no próprio mês não entra em expected', () => {
    const result = cash({
      receivables: [installment({ externalId: 'same-month', dueDate: '2026-08-01', unpaid: '70' })],
    });
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.overdue.receivables?.toString()).toBe('70');
    expect(result.overdue.ofMonth.receivables?.toString()).toBe('70');
  });

  it('estoque — vencido de mês anterior fica fora do stock de setembro e fora de expected', () => {
    const result = cash({
      month: SEP,
      today: civil('2026-09-23'),
      receivables: [installment({ externalId: 'aug-open', dueDate: '2026-08-20', unpaid: '1000' })],
      payables: [installment({ externalId: 'aug-ap', dueDate: '2026-08-20', unpaid: '400' })],
    });
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.expected.payables?.toString()).toBe('0');
    expect(result.stock.receivables.open?.toString()).toBe('0');
    expect(result.stock.payables.open?.toString()).toBe('0');
  });

  it('estoque — mês passado ainda aberto aparece como vencido só naquele mês', () => {
    const august = cash({
      month: AUG,
      today: civil('2026-09-23'),
      receivables: [installment({ externalId: 'aug-open', dueDate: '2026-08-20', unpaid: '1000' })],
    });
    expect(august.stock.receivables.open?.toString()).toBe('1000');
    expect(august.stock.receivables.overdue?.toString()).toBe('1000');
    expect(august.expected.receivables?.toString()).toBe('0');
  });

  it('estoque — mês futuro inclui só títulos daquele mês como upcoming', () => {
    const october = cash({
      month: OCT,
      today: civil('2026-09-23'),
      receivables: [
        installment({ externalId: 'sep', dueDate: '2026-09-24', unpaid: '80' }),
        installment({ externalId: 'oct', dueDate: '2026-10-10', unpaid: '70' }),
        installment({ externalId: 'nov', dueDate: '2026-11-02', unpaid: '60' }),
      ],
    });
    expect(october.stock.receivables.open?.toString()).toBe('70');
    expect(october.stock.receivables.upcoming?.toString()).toBe('70');
    expect(october.expected.receivables?.toString()).toBe('70');
  });

  it('estoque — total = overdue + dueToday + upcoming e não altera billing', () => {
    const result = cash({
      month: SEP,
      today: civil('2026-09-23'),
      receivables: [
        installment({ externalId: 'over', dueDate: '2026-09-22', unpaid: '30' }),
        installment({ externalId: 'today', dueDate: '2026-09-23', unpaid: '10' }),
        installment({ externalId: 'next', dueDate: '2026-09-24', unpaid: '80' }),
      ],
    });
    expect(result.stock.receivables.open?.toString()).toBe('120');
    expect(result.stock.receivables.overdue?.toString()).toBe('30');
    expect(result.stock.receivables.dueToday?.toString()).toBe('10');
    expect(result.stock.receivables.upcoming?.toString()).toBe('80');
    expect(result.expected.receivables?.toString()).toBe('90');
    expect(monthlyBilling(result)?.toString()).toBe('90');
  });

  it('estoque — virada 31/08 fica no stock de agosto, não no de setembro', () => {
    const september = cash({
      month: SEP,
      today: civil('2026-09-01'),
      payables: [installment({ externalId: 'aug-31', dueDate: '2026-08-31', unpaid: '15' })],
    });
    expect(september.stock.payables.open?.toString()).toBe('0');
    expect(september.expected.payables?.toString()).toBe('0');

    const august = cash({
      month: AUG,
      today: civil('2026-09-01'),
      payables: [installment({ externalId: 'aug-31', dueDate: '2026-08-31', unpaid: '15' })],
    });
    expect(august.stock.payables.overdue?.toString()).toBe('15');
    expect(august.expected.payables?.toString()).toBe('0');

    const january = cash({
      month: civilMonthBoundsFromKey('2027-01'),
      today: civil('2027-01-01'),
      receivables: [installment({ externalId: 'dec-31', dueDate: '2026-12-31', unpaid: '22' })],
    });
    expect(january.stock.receivables.open?.toString()).toBe('0');
    expect(january.expected.receivables?.toString()).toBe('0');
  });

  it('11 — título quitado no passado: realizado histórico permanece', () => {
    const result = cash({
      month: AUG,
      today: civil('2026-11-01'),
      settlements: [settlement({ installmentExternalId: 'old', occurredOn: '2026-08-05', netAmount: '90' })],
      receivables: [
        installment({
          externalId: 'old',
          dueDate: '2026-08-05',
          unpaid: '0',
          paid: '90',
          status: 'PAID',
        }),
      ],
    });
    expect(result.realized.inflows?.toString()).toBe('90');
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.overdue.receivables?.toString()).toBe('0');
  });

  it('12 — 404 local sem baixa: realizado 0 e estoque pode contaminar', () => {
    const result = cash({
      receivables: [
        installment({
          externalId: '9c880f8e-0168-4673-a243-f7f6fa8ada84',
          dueDate: '2026-08-01',
          unpaid: '15',
        }),
      ],
    });
    expect(result.realized.inflows?.toString()).toBe('0');
    expect(result.overdue.receivables?.toString()).toBe('15');
  });

  it('13 — receita e despesa no mesmo dia', () => {
    const result = cash({
      settlements: [
        settlement({ installmentExternalId: 'in', occurredOn: '2026-08-11', netAmount: '40' }),
        settlement({
          installmentExternalId: 'out',
          occurredOn: '2026-08-11',
          netAmount: '15',
          type: 'DISBURSEMENT',
        }),
      ],
    });
    const day = result.daily.realized.find((point) => point.date.toISOString().startsWith('2026-08-11'));
    expect(day?.inflows?.toString()).toBe('40');
    expect(day?.outflows?.toString()).toBe('15');
    expect(day?.result?.toString()).toBe('25');
    expect(result.realized.result?.toString()).toBe('25');
  });

  it('14 — mês sem movimentos preenche zeros civis', () => {
    const result = cash();
    expect(result.daily.realized).toHaveLength(31);
    expect(result.realized.inflows?.toString()).toBe('0');
    expect(result.daily.realized.every((point) => point.inflows?.isZero())).toBe(true);
  });

  it('16 — categoria precisa filtra realizado e previsto', () => {
    const rec = installment({
      externalId: 'cat',
      dueDate: '2026-08-28',
      unpaid: '30',
      categoryExternalIds: ['serv'],
    });
    const result = cash({
      today: civil('2026-08-20'),
      settlements: [settlement({ installmentExternalId: 'cat', occurredOn: '2026-08-05', netAmount: '10' })],
      receivables: [rec],
      realizedInstallments: new Map([['RECEIVABLE:cat', rec]]),
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
    });
    expect(result.realized.inflows?.toString()).toBe('10');
    expect(result.expected.receivables?.toString()).toBe('30');
    expect(result.stock.receivables.open?.toString()).toBe('30');
  });

  it('17 — categoria imprecisa/múltipla não associa', () => {
    const rec = installment({
      externalId: 'multi',
      dueDate: '2026-08-28',
      unpaid: '30',
      categoryExternalIds: ['serv', 'outros'],
    });
    const result = cash({
      today: civil('2026-08-20'),
      settlements: [settlement({ installmentExternalId: 'multi', occurredOn: '2026-08-05', netAmount: '10' })],
      receivables: [rec],
      realizedInstallments: new Map([['RECEIVABLE:multi', rec]]),
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
    });
    expect(result.realized.inflows?.toString()).toBe('0');
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.stock.receivables.open?.toString()).toBe('0');
  });

  it('18 — occurredOn no último dia civil do mês', () => {
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'eom', occurredOn: '2026-08-31', netAmount: '7' })],
    });
    expect(result.realized.inflows?.toString()).toBe('7');
    expect(result.daily.realized.at(-1)?.date.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(result.daily.realized.at(-1)?.inflows?.toString()).toBe('7');
  });

  it('19 — dueDate == today NÃO é vencido e entra em previsto', () => {
    const result = cash({
      receivables: [installment({ externalId: 'today', dueDate: '2026-08-26', unpaid: '12' })],
    });
    expect(result.overdue.receivables?.toString()).toBe('0');
    expect(result.expected.receivables?.toString()).toBe('12');
  });

  it('20 — dueDate < today é vencido', () => {
    const result = cash({
      receivables: [installment({ externalId: 'past', dueDate: '2026-08-25', unpaid: '12' })],
    });
    expect(result.overdue.receivables?.toString()).toBe('12');
    expect(result.expected.receivables?.toString()).toBe('0');
  });

  it('LOST/RENEGOTIATED/UNKNOWN não entram no previsto mesmo se o caller os passar', () => {
    const result = cash({
      today: civil('2026-08-10'),
      receivables: [
        installment({ externalId: 'lost', dueDate: '2026-08-31', unpaid: '9', status: 'LOST' }),
        installment({ externalId: 'ren', dueDate: '2026-08-31', unpaid: '8', status: 'RENEGOTIATED' }),
      ],
    });
    expect(result.expected.receivables?.toString()).toBe('0');
    expect(result.overdue.receivables?.toString()).toBe('0');
  });

  it('mês futuro: previsto inclui dueDate do mês; coverage null', () => {
    const result = cash({
      month: OCT,
      today: TODAY,
      receivables: [installment({ externalId: 'fut-m', dueDate: '2026-10-10', unpaid: '40' })],
    });
    expect(result.expected.receivables?.toString()).toBe('40');
    expect(result.coverage).toBeNull();
  });

  it('coverage só no mês corrente com denominador > 0', () => {
    const current = cash({
      today: TODAY,
      settlements: [settlement({ installmentExternalId: 'c', occurredOn: '2026-08-02', netAmount: '25' })],
      receivables: [installment({ externalId: 'open', dueDate: '2026-08-30', unpaid: '75' })],
    });
    expect(current.coverage?.toString()).toBe('0.25');
    const past = cash({
      month: AUG,
      today: civil('2026-11-01'),
      settlements: [settlement({ installmentExternalId: 'c', occurredOn: '2026-08-02', netAmount: '25' })],
    });
    expect(past.coverage).toBeNull();
  });

  it('9 — multi-centro total rateia net proporcional à allocation', () => {
    const title = installment({
      externalId: 'mc',
      dueDate: '2026-08-10',
      unpaid: '0',
      paid: '1000',
      total: '1000',
      status: 'PAID',
    });
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'mc', occurredOn: '2026-08-10', netAmount: '1000' })],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [{ amount: dec('600'), installment: title }],
        realizedPayables: [],
      },
    });
    expect(result.costCenterCashSplit).toBe(true);
    expect(result.realized.inflows?.toString()).toBe('600');
  });

  it('10 — multi-centro parcial unavailable não rateia baixa', () => {
    const title = installment({
      externalId: 'mcp',
      dueDate: '2026-08-31',
      unpaid: '600',
      paid: '400',
      total: '1000',
      status: 'PARTIALLY_PAID',
    });
    const result = cash({
      today: civil('2026-08-20'),
      settlements: [settlement({ installmentExternalId: 'mcp', occurredOn: '2026-08-10', netAmount: '400' })],
      costCenter: {
        expectedReceivables: [{ amount: dec('600'), installment: title }],
        expectedPayables: [],
        realizedReceivables: [{ amount: dec('600'), installment: title }],
        realizedPayables: [],
      },
    });
    expect(result.costCenterCashSplit).toBe(false);
    expect(result.realized.inflows).toBeNull();
    expect(result.expected.receivables).toBeNull();
  });

  it('single centro 100% atribui net integral', () => {
    const title = installment({
      externalId: 'one',
      dueDate: '2026-08-10',
      unpaid: '0',
      paid: '80',
      total: '80',
      status: 'PAID',
    });
    const result = cash({
      settlements: [settlement({ installmentExternalId: 'one', occurredOn: '2026-08-10', netAmount: '80' })],
      costCenter: {
        expectedReceivables: [],
        expectedPayables: [],
        realizedReceivables: [{ amount: dec('80'), installment: title }],
        realizedPayables: [],
      },
    });
    expect(result.realized.inflows?.toString()).toBe('80');
  });
});

describe('attributeSettlementNetToCostCenter', () => {
  it('não inventa rateio em parcial multi', () => {
    const share = attributeSettlementNetToCostCenter({
      netAmount: dec('4000'),
      allocationAmount: dec('600'),
      installmentTotal: dec('1000'),
      paid: dec('400'),
      unpaid: dec('600'),
      dueDate: civil('2026-08-31'),
      today: TODAY,
    });
    expect(share).toBe('UNAVAILABLE');
  });
});

describe('Faturamento homologado (realized.inflows + expected.receivables)', () => {
  it('F1 — 80k realizado + 20k previsto no prazo = 100k; vencido 0', () => {
    const result = cash({
      today: civil('2026-08-20'),
      settlements: [
        settlement({ installmentExternalId: 'r', occurredOn: '2026-08-05', netAmount: '80000' }),
      ],
      receivables: [
        installment({ externalId: 'open', dueDate: '2026-08-25', unpaid: '20000' }),
      ],
    });
    expect(result.realized.inflows?.toString()).toBe('80000');
    expect(result.expected.receivables?.toString()).toBe('20000');
    expect(result.overdue.receivables?.toString()).toBe('0');
    expect(monthlyBilling(result)?.toString()).toBe('100000');
  });

  it('F2 — vencido 5k NÃO entra no Faturamento (95k, não 100k)', () => {
    const result = cash({
      today: civil('2026-08-20'),
      settlements: [
        settlement({ installmentExternalId: 'r', occurredOn: '2026-08-05', netAmount: '80000' }),
      ],
      receivables: [
        installment({ externalId: 'open', dueDate: '2026-08-25', unpaid: '15000' }),
        installment({ externalId: 'late', dueDate: '2026-08-10', unpaid: '5000' }),
      ],
    });
    expect(result.expected.receivables?.toString()).toBe('15000');
    expect(result.overdue.receivables?.toString()).toBe('5000');
    expect(monthlyBilling(result)?.toString()).toBe('95000');
  });

  it('F3 — título no prazo compõe Faturamento via expected', () => {
    const result = cash({
      today: civil('2026-08-20'),
      receivables: [installment({ externalId: 'a', dueDate: '2026-08-25', unpaid: '5000' })],
    });
    expect(result.expected.receivables?.toString()).toBe('5000');
    expect(result.realized.inflows?.toString()).toBe('0');
    expect(monthlyBilling(result)?.toString()).toBe('5000');
  });

  it('F4 — ao vencer sem pagamento sai do Faturamento e entra em overdue', () => {
    const title = { externalId: 'a', dueDate: '2026-08-25', unpaid: '5000' } as const;
    const before = cash({
      today: civil('2026-08-20'),
      receivables: [installment(title)],
    });
    const afterDue = cash({
      today: civil('2026-08-26'),
      receivables: [installment(title)],
    });
    expect(monthlyBilling(before)?.toString()).toBe('5000');
    expect(afterDue.expected.receivables?.toString()).toBe('0');
    expect(afterDue.overdue.receivables?.toString()).toBe('5000');
    expect(monthlyBilling(afterDue)?.toString()).toBe('0');
  });

  it('F5 — pagamento tardio no mesmo mês volta ao Faturamento como realizado', () => {
    const before = cash({
      today: civil('2026-08-20'),
      receivables: [
        installment({ externalId: 't', dueDate: '2026-08-10', unpaid: '5000' }),
      ],
    });
    expect(before.overdue.receivables?.toString()).toBe('5000');
    expect(monthlyBilling(before)?.toString()).toBe('0');

    const after = cash({
      today: civil('2026-08-26'),
      settlements: [
        settlement({ installmentExternalId: 't', occurredOn: '2026-08-25', netAmount: '5000' }),
      ],
      receivables: [
        installment({
          externalId: 't',
          dueDate: '2026-08-10',
          unpaid: '0',
          paid: '5000',
          status: 'PAID',
        }),
      ],
    });
    expect(after.realized.inflows?.toString()).toBe('5000');
    expect(after.expected.receivables?.toString()).toBe('0');
    expect(after.overdue.receivables?.toString()).toBe('0');
    expect(monthlyBilling(after)?.toString()).toBe('5000');
  });

  it('F6 — pagamento em mês seguinte: agosto sem retroagir; outubro inclui realizado', () => {
    const titleOpen = installment({
      externalId: 'next',
      dueDate: '2026-08-31',
      unpaid: '5000',
      competenceDate: '2026-05-01',
    });
    const augustLate = cash({
      month: AUG,
      today: civil('2026-09-15'),
      receivables: [titleOpen],
    });
    expect(augustLate.realized.inflows?.toString()).toBe('0');
    expect(augustLate.expected.receivables?.toString()).toBe('0');
    expect(augustLate.overdue.receivables?.toString()).toBe('5000');
    expect(monthlyBilling(augustLate)?.toString()).toBe('0');

    const paidTitle = installment({
      externalId: 'next',
      dueDate: '2026-08-31',
      unpaid: '0',
      paid: '5000',
      status: 'PAID',
      competenceDate: '2026-05-01',
    });
    const settlementOct = settlement({
      installmentExternalId: 'next',
      occurredOn: '2026-10-15',
      netAmount: '5000',
    });
    const augustAfterPay = cash({
      month: AUG,
      today: civil('2026-10-20'),
      settlements: [settlementOct],
      receivables: [paidTitle],
    });
    expect(augustAfterPay.realized.inflows?.toString()).toBe('0');
    expect(monthlyBilling(augustAfterPay)?.toString()).toBe('0');

    const october = cash({
      month: OCT,
      today: civil('2026-10-20'),
      settlements: [settlementOct],
      receivables: [paidTitle],
    });
    expect(october.realized.inflows?.toString()).toBe('5000');
    expect(monthlyBilling(october)?.toString()).toBe('5000');
  });

  it('F7 — juros/multa: Faturamento realizado usa net 301.05, não gross 294', () => {
    const result = cash({
      settlements: [
        settlement({ installmentExternalId: 'int', occurredOn: '2026-08-05', netAmount: '301.05' }),
      ],
    });
    expect(monthlyBilling(result)?.toString()).toBe('301.05');
  });

  it('F8 — duas baixas 10000 + 1550 = 11550, sem consolidar parcela', () => {
    const result = cash({
      settlements: [
        settlement({ installmentExternalId: 'p', occurredOn: '2026-08-10', netAmount: '10000' }),
        settlement({ installmentExternalId: 'p', occurredOn: '2026-08-12', netAmount: '1550' }),
      ],
    });
    expect(result.realized.inflows?.toString()).toBe('11550');
    expect(monthlyBilling(result)?.toString()).toBe('11550');
  });

  it('F9 — competência maio nunca define o mês; prazo agosto; baixa outubro', () => {
    const openAugust = cash({
      month: AUG,
      today: civil('2026-08-20'),
      receivables: [
        installment({
          externalId: 'axis',
          dueDate: '2026-08-31',
          unpaid: '5000',
          competenceDate: '2026-05-10',
        }),
      ],
    });
    expect(monthlyBilling(openAugust)?.toString()).toBe('5000');
    expect(openAugust.monthKey).toBe('2026-08');

    const overdueAugust = cash({
      month: AUG,
      today: civil('2026-09-01'),
      receivables: [
        installment({
          externalId: 'axis',
          dueDate: '2026-08-31',
          unpaid: '5000',
          competenceDate: '2026-05-10',
        }),
      ],
    });
    expect(overdueAugust.expected.receivables?.toString()).toBe('0');
    expect(overdueAugust.overdue.receivables?.toString()).toBe('5000');
    expect(monthlyBilling(overdueAugust)?.toString()).toBe('0');

    const may = cash({
      month: civilMonthBoundsFromKey('2026-05'),
      today: civil('2026-08-20'),
      receivables: [
        installment({
          externalId: 'axis',
          dueDate: '2026-08-31',
          unpaid: '5000',
          competenceDate: '2026-05-10',
        }),
      ],
    });
    expect(may.realized.inflows?.toString()).toBe('0');
    expect(may.expected.receivables?.toString()).toBe('0');
    expect(monthlyBilling(may)?.toString()).toBe('0');

    const october = cash({
      month: OCT,
      today: civil('2026-10-20'),
      settlements: [
        settlement({ installmentExternalId: 'axis', occurredOn: '2026-10-15', netAmount: '5000' }),
      ],
    });
    expect(october.realized.inflows?.toString()).toBe('5000');
    expect(monthlyBilling(october)?.toString()).toBe('5000');
  });
});
