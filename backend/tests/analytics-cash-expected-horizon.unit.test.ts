import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import {
  calculateCashExpectedHorizon,
  type CashExpectedHorizonMonths,
} from '../src/modules/analytics/domain/cash-expected-horizon.js';
import {
  listForwardInclusiveMonthKeys,
  shiftCivilMonthKey,
} from '../src/modules/analytics/domain/civil-calendar.js';
import { parseCashExpectedHorizonQuery } from '../src/modules/dashboard/http/parse-cash-expected-horizon-query.js';
import { toDashboardCashExpectedHorizonResponse } from '../src/modules/dashboard/http/to-dashboard-cash-expected-horizon-response.js';

const TODAY = new Date('2026-09-15T00:00:00.000Z');

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
    partyId: null,
    categoryExternalIds: input.categoryExternalIds ?? [],
    syncedAt: TODAY,
  };
}

function row(inst: FinancialInstallmentReadRecord, amount?: string) {
  return { installment: inst, amount: amount !== undefined ? dec(amount) : inst.unpaid };
}

function sumBuckets(
  months: readonly { readonly expected: { readonly receivables: Prisma.Decimal | null; readonly payables: Prisma.Decimal | null } }[],
  field: 'receivables' | 'payables',
): string {
  let total = dec('0');
  for (const month of months) {
    const value = month.expected[field];
    if (value === null) {
      throw new Error(`bucket ${field} null`);
    }
    total = total.plus(value);
  }
  return total.toString();
}

describe('civil forward month keys', () => {
  it('shift cruzando ano', () => {
    expect(shiftCivilMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftCivilMonthKey('2026-09', 5)).toBe('2027-02');
    expect(shiftCivilMonthKey('2026-09', 11)).toBe('2027-08');
  });

  it('horizon 3 / 6 / 12 a partir de SET/2026', () => {
    expect(listForwardInclusiveMonthKeys('2026-09', 3)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(listForwardInclusiveMonthKeys('2026-09', 6)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(listForwardInclusiveMonthKeys('2026-09', 12)).toHaveLength(12);
    expect(listForwardInclusiveMonthKeys('2026-09', 12)[11]).toBe('2027-08');
  });
});

describe('parseCashExpectedHorizonQuery', () => {
  it('aceita 3|6|12', () => {
    expect(parseCashExpectedHorizonQuery({ horizon: '3' })).toBe(3);
    expect(parseCashExpectedHorizonQuery({ horizon: 6 })).toBe(6);
    expect(parseCashExpectedHorizonQuery({ horizon: '12' })).toBe(12);
  });

  it('rejeita ausente, 1, 4 e lixo', () => {
    expect(() => parseCashExpectedHorizonQuery({})).toThrow(/horizon/);
    expect(() => parseCashExpectedHorizonQuery({ horizon: '1' })).toThrow(/horizon/);
    expect(() => parseCashExpectedHorizonQuery({ horizon: '4' })).toThrow(/horizon/);
    expect(() => parseCashExpectedHorizonQuery({ horizon: 'abc' })).toThrow(/horizon/);
  });
});

describe('calculateCashExpectedHorizon', () => {
  const horizons: readonly CashExpectedHorizonMonths[] = [3, 6, 12];

  for (const horizon of horizons) {
    it(`horizon=${horizon} produz ${horizon} buckets e reconcilia totais`, () => {
      const arSep = installment({ externalId: 'ar-sep', dueDate: '2026-09-20', unpaid: '100' });
      const arOct = installment({ externalId: 'ar-oct', dueDate: '2026-10-05', unpaid: '40' });
      const apSep = installment({ externalId: 'ap-sep', dueDate: '2026-09-25', unpaid: '30' });
      const result = calculateCashExpectedHorizon({
        today: TODAY,
        anchorMonthKey: '2026-09',
        horizon,
        receivableRows: [row(arSep), row(arOct)],
        payableRows: [row(apSep)],
        categoryFilter: null,
        hasCostCenter: false,
      });
      expect(result.months).toHaveLength(horizon);
      expect(result.startMonth).toBe('2026-09');
      expect(result.horizon).toBe(horizon);
      expect(result.costCenterCashSplit).toBe(true);
      expect(sumBuckets(result.months, 'receivables')).toBe(result.totals.receivables!.toString());
      expect(sumBuckets(result.months, 'payables')).toBe(result.totals.payables!.toString());
      expect(result.totals.result!.toString()).toBe(
        result.totals.receivables!.minus(result.totals.payables!).toString(),
      );
      for (const month of result.months) {
        expect(month.expected.result!.toString()).toBe(
          month.expected.receivables!.minus(month.expected.payables!).toString(),
        );
      }
      expect(result.months[0]!.expected.receivables!.toString()).toBe('100');
      expect(result.months[0]!.expected.payables!.toString()).toBe('30');
      if (horizon >= 3) {
        expect(result.months[1]!.expected.receivables!.toString()).toBe('40');
        expect(result.months[2]!.expected.receivables!.toString()).toBe('0');
      }
    });
  }

  it('virada de ano SET→FEV em horizon=6', () => {
    const arJan = installment({ externalId: 'ar-jan', dueDate: '2027-01-10', unpaid: '15' });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 6,
      receivableRows: [row(arJan)],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.months.map((m) => m.monthKey)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(result.months[4]!.expected.receivables!.toString()).toBe('15');
    expect(result.totals.receivables!.toString()).toBe('15');
  });

  it('parcial usa unpaid restante', () => {
    const ar = installment({
      externalId: 'ar-partial',
      dueDate: '2026-09-20',
      unpaid: '25',
      paid: '75',
      total: '100',
      status: 'PARTIALLY_PAID',
    });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(ar)],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.totals.receivables!.toString()).toBe('25');
  });

  it('vencido excluído', () => {
    const overdue = installment({ externalId: 'ar-old', dueDate: '2026-09-01', unpaid: '90' });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(overdue)],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.totals.receivables!.toString()).toBe('0');
  });

  it('status PAID excluído', () => {
    const paid = installment({
      externalId: 'ar-paid',
      dueDate: '2026-09-20',
      unpaid: '0',
      status: 'PAID',
    });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(paid)],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.totals.receivables!.toString()).toBe('0');
  });

  it('filtro categoria REVENUE', () => {
    const match = installment({
      externalId: 'ar-cat',
      dueDate: '2026-09-20',
      unpaid: '50',
      categoryExternalIds: ['cat-rev'],
    });
    const other = installment({
      externalId: 'ar-other',
      dueDate: '2026-09-21',
      unpaid: '80',
      categoryExternalIds: ['cat-x'],
    });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(match), row(other)],
      payableRows: [],
      categoryFilter: {
        externalId: 'cat-rev',
        type: 'REVENUE',
      },
      hasCostCenter: false,
    });
    expect(result.totals.receivables!.toString()).toBe('50');
  });

  it('centro de custo CURRENT usa amount do rateio (outstanding)', () => {
    const ar = installment({
      externalId: 'ar-cc',
      dueDate: '2026-09-20',
      unpaid: '100',
      paid: '0',
      total: '100',
    });
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(ar, '40')],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: true,
    });
    expect(result.totals.receivables!.toString()).toBe('40');
  });

  it('mês sem movimento permanece com zero', () => {
    const result = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    expect(result.months).toHaveLength(3);
    expect(result.months.every((m) => m.expected.receivables!.toString() === '0')).toBe(true);
  });

  it('serializer HTTP preserva totais e horizon', () => {
    const ar = installment({ externalId: 'ar-1', dueDate: '2026-09-20', unpaid: '10' });
    const domain = calculateCashExpectedHorizon({
      today: TODAY,
      anchorMonthKey: '2026-09',
      horizon: 3,
      receivableRows: [row(ar)],
      payableRows: [],
      categoryFilter: null,
      hasCostCenter: false,
    });
    const body = toDashboardCashExpectedHorizonResponse(domain);
    expect(body.horizon).toBe(3);
    expect(body.months).toHaveLength(3);
    expect(body.totals.receivables).toBe('10');
    expect(body.months[0]!.expected.receivables).toBe('10');
  });
});
