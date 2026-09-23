import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import { calculateCashExpectedHorizon } from '../src/modules/analytics/domain/cash-expected-horizon.js';
import { accumulateReceivableOverdue } from '../src/modules/analytics/domain/expected-open-receivables.js';
import { accumulatePayableOverdue } from '../src/modules/analytics/domain/expected-open-payables.js';
import {
  calculateProjectedBankBalance,
  type OfficialBankBalanceBase,
} from '../src/modules/analytics/domain/projected-bank-balance.js';
import {
  officialBalanceBaseFromHistory,
  resolveOfficialBankBalanceBase,
} from '../src/modules/dashboard/services/cash-balance-history.service.js';

const TODAY = new Date('2026-09-23T00:00:00.000Z');
const SEP_FROM = new Date('2026-09-01T00:00:00.000Z');
const SEP_TO = new Date('2026-09-30T00:00:00.000Z');

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function civil(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function installment(input: {
  readonly externalId: string;
  readonly dueDate: string;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly status?: FinancialInstallmentReadRecord['status'];
  readonly tenantId?: string;
}): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  return {
    id: input.externalId,
    tenantId: input.tenantId ?? 't1',
    integrationId: 'i1',
    externalId: input.externalId,
    description: null,
    dueDate: civil(input.dueDate),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: null,
    total: dec(input.total ?? unpaid.plus(paid).toString()),
    paid,
    unpaid,
    partyId: null,
    categoryExternalIds: [],
    syncedAt: TODAY,
  };
}

function row(record: FinancialInstallmentReadRecord) {
  return { amount: record.unpaid, installment: record };
}

function base(balance: string, coverage: OfficialBankBalanceBase['coverage'] = 'available') {
  return {
    date: TODAY,
    balance: dec(balance),
    coverage,
  } satisfies OfficialBankBalanceBase;
}

function horizonOf(
  receivables: readonly FinancialInstallmentReadRecord[],
  payables: readonly FinancialInstallmentReadRecord[] = [],
  horizon: 3 | 6 | 12 = 3,
) {
  return calculateCashExpectedHorizon({
    today: TODAY,
    anchorMonthKey: '2026-09',
    horizon,
    receivableRows: receivables.map(row),
    payableRows: payables.map(row),
    categoryFilter: null,
    hasCostCenter: false,
  });
}

function overdueOf(
  receivables: readonly FinancialInstallmentReadRecord[],
  payables: readonly FinancialInstallmentReadRecord[] = [],
) {
  return {
    receivables: accumulateReceivableOverdue({
      rows: receivables.map(row),
      today: TODAY,
      from: SEP_FROM,
      to: SEP_TO,
      categoryFilter: null,
      hasCostCenter: false,
    }).overdue,
    payables: accumulatePayableOverdue({
      rows: payables.map(row),
      today: TODAY,
      from: SEP_FROM,
      to: SEP_TO,
      categoryFilter: null,
      hasCostCenter: false,
    }).overdue,
  };
}

function project(input: {
  readonly receivables?: readonly FinancialInstallmentReadRecord[];
  readonly payables?: readonly FinancialInstallmentReadRecord[];
  readonly balance?: string | null;
  readonly coverage?: OfficialBankBalanceBase['coverage'];
  readonly filtered?: boolean;
  readonly current?: boolean;
  readonly horizon?: 3 | 6 | 12;
}) {
  const receivables = input.receivables ?? [];
  const payables = input.payables ?? [];
  const horizon = horizonOf(receivables, payables, input.horizon ?? 3);
  const overdue = overdueOf(receivables, payables);
  return {
    horizon,
    overdue,
    projection: calculateProjectedBankBalance({
      horizon,
      overdueReceivables: overdue.receivables,
      overduePayables: overdue.payables,
      base: input.balance === null || input.balance === undefined ? null : base(input.balance, input.coverage),
      filtered: input.filtered ?? false,
      anchorIsCurrentMonth: input.current ?? true,
    }),
  };
}

describe('calculateProjectedBankBalance', () => {
  it('1 — saldo-base positivo acumula o primeiro mês', () => {
    const { projection, horizon } = project({
      balance: '100000',
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '20000' })],
      payables: [installment({ externalId: 'ap', dueDate: '2026-09-25', unpaid: '10000' })],
    });
    expect(horizon.totals.receivables?.toString()).toBe('20000');
    expect(projection.available).toBe(true);
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('110000');
  });

  it('2 — saldo-base zero', () => {
    const { projection } = project({
      balance: '0',
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '20' })],
    });
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('20');
  });

  it('3 — saldo-base negativo permanece visível', () => {
    const { projection } = project({
      balance: '-50',
      payables: [installment({ externalId: 'ap', dueDate: '2026-09-24', unpaid: '10' })],
    });
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('-60');
  });

  it('4 — primeiro mês parcial: só due >= hoje no expected', () => {
    const { horizon, projection } = project({
      balance: '100',
      receivables: [
        installment({ externalId: 'before', dueDate: '2026-09-10', unpaid: '80' }),
        installment({ externalId: 'today', dueDate: '2026-09-23', unpaid: '15' }),
        installment({ externalId: 'after', dueDate: '2026-09-28', unpaid: '25' }),
      ],
    });
    expect(horizon.months[0]?.expected.receivables?.toString()).toBe('40');
    expect(projection.months[0]?.overdueAdjustment?.toString()).toBe('80');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('220');
  });

  it('5/6/7 — vencido AR/AP entra só no ajuste; expected permanece 0', () => {
    const receivables = [installment({ externalId: 'ar-old', dueDate: '2026-09-01', unpaid: '90' })];
    const payables = [installment({ externalId: 'ap-old', dueDate: '2026-08-20', unpaid: '40' })];
    const { horizon, projection } = project({
      balance: '1000',
      receivables,
      payables,
    });
    expect(horizon.totals.receivables?.toString()).toBe('0');
    expect(horizon.totals.payables?.toString()).toBe('0');
    expect(projection.months[0]?.overdueAdjustment?.toString()).toBe('50');
    expect(projection.months[0]?.expectedReceivables?.toString()).toBe('0');
    expect(projection.months[1]?.overdueAdjustment?.toString()).toBe('0');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('1050');
  });

  it('8 — due today entra no expected do primeiro mês', () => {
    const { horizon, projection } = project({
      balance: '10',
      receivables: [installment({ externalId: 'today', dueDate: '2026-09-23', unpaid: '7' })],
    });
    expect(horizon.months[0]?.expected.receivables?.toString()).toBe('7');
    expect(projection.months[0]?.overdueAdjustment?.toString()).toBe('0');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('17');
  });

  it('9 — futuro cai no bucket do mês e acumula', () => {
    const { projection } = project({
      balance: '100',
      receivables: [installment({ externalId: 'oct', dueDate: '2026-10-10', unpaid: '30' })],
    });
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('100');
    expect(projection.months[1]?.expectedReceivables?.toString()).toBe('30');
    expect(projection.months[1]?.projectedBalance?.toString()).toBe('130');
  });

  it('10 — partial usa unpaid', () => {
    const { projection, horizon } = project({
      balance: '0',
      receivables: [
        installment({
          externalId: 'part',
          dueDate: '2026-09-24',
          unpaid: '25',
          paid: '75',
          total: '100',
          status: 'PARTIALLY_PAID',
        }),
      ],
    });
    expect(horizon.totals.receivables?.toString()).toBe('25');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('25');
  });

  it('11/12 — PAID e unpaid=0 ficam fora', () => {
    const { projection, horizon } = project({
      balance: '80',
      receivables: [
        installment({
          externalId: 'paid',
          dueDate: '2026-09-24',
          unpaid: '0',
          paid: '50',
          total: '50',
          status: 'PAID',
        }),
      ],
    });
    expect(horizon.totals.receivables?.toString()).toBe('0');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('80');
  });

  it('13 — PAID/LOST ficam fora; lifecycle DELETED é filtrado no repositório ACTIVE', () => {
    const { overdue, horizon } = project({
      balance: '10',
      receivables: [
        installment({
          externalId: 'paid',
          dueDate: '2026-09-01',
          unpaid: '99',
          status: 'PAID',
        }),
        installment({
          externalId: 'lost',
          dueDate: '2026-09-01',
          unpaid: '80',
          status: 'LOST',
        }),
      ],
    });
    expect(horizon.totals.receivables?.toString()).toBe('0');
    expect(overdue.receivables.toString()).toBe('0');
  });

  it('14 — ausência de saldo-base não inventa projeção', () => {
    const { projection } = project({
      balance: null,
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '10' })],
    });
    expect(projection.available).toBe(false);
    expect(projection.unavailableReason).toBe('NO_BASE');
    expect(projection.months).toEqual([]);
  });

  it('15 — coverage none é NO_BASE; partial permanece utilizável', () => {
    const none = project({
      balance: '10',
      coverage: 'none',
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '1' })],
    });
    expect(none.projection.available).toBe(false);
    expect(none.projection.unavailableReason).toBe('NO_BASE');

    const partial = project({
      balance: '10',
      coverage: 'partial',
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '1' })],
    });
    expect(partial.projection.available).toBe(true);
    expect(partial.projection.base?.coverage).toBe('partial');
    expect(partial.projection.months[0]?.projectedBalance?.toString()).toBe('11');
  });

  it('16/17/18 — 3/6/12 reconciliam P[n] = P[n-1] + Δn', () => {
    const horizons = [3, 6, 12] as const;
    for (const size of horizons) {
      const { projection } = project({
        balance: '1000',
        horizon: size,
        receivables: [
          installment({ externalId: 'sep', dueDate: '2026-09-24', unpaid: '100' }),
          installment({ externalId: 'oct', dueDate: '2026-10-05', unpaid: '40' }),
        ],
        payables: [installment({ externalId: 'ap-sep', dueDate: '2026-09-25', unpaid: '30' })],
      });
      expect(projection.months).toHaveLength(size);
      let running = dec('1000');
      for (const [index, month] of projection.months.entries()) {
        running = running
          .plus(month.overdueAdjustment ?? 0)
          .plus(month.expectedReceivables ?? 0)
          .minus(month.expectedPayables ?? 0);
        expect(month.projectedBalance?.toString()).toBe(running.toString());
        if (index > 0) {
          expect(month.overdueAdjustment?.toString()).toBe('0');
        }
      }
    }
  });

  it('21 — sem dupla contagem: baixa já no prazo não soma vencido', () => {
    const { horizon, projection } = project({
      balance: '500',
      receivables: [
        installment({ externalId: 'over', dueDate: '2026-09-10', unpaid: '80' }),
        installment({ externalId: 'open', dueDate: '2026-09-24', unpaid: '20' }),
      ],
    });
    expect(horizon.totals.receivables?.toString()).toBe('20');
    expect(projection.months[0]?.overdueAdjustment?.toString()).toBe('80');
    expect(projection.months[0]?.projectedBalance?.toString()).toBe('600');
  });

  it('25/26 — filtro ou mês não corrente oculta projeção', () => {
    const filtered = project({
      balance: '100',
      filtered: true,
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '10' })],
    });
    expect(filtered.projection.available).toBe(false);
    expect(filtered.projection.unavailableReason).toBe('FILTERED');
    expect(filtered.horizon.totals.receivables?.toString()).toBe('10');

    const past = project({
      balance: '100',
      current: false,
      receivables: [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '10' })],
    });
    expect(past.projection.available).toBe(false);
    expect(past.projection.unavailableReason).toBe('NOT_CURRENT_MONTH');
    expect(past.horizon.totals.receivables?.toString()).toBe('10');
  });
});

describe('officialBalanceBaseFromHistory', () => {
  it('usa o último ponto diário consolidado e rejeita coverage none', () => {
    expect(
      officialBalanceBaseFromHistory({
        today: '2026-09-23',
        availableFrom: '2026-09-01',
        availableTo: '2026-09-23',
        pointCount: 2,
        accountsIncluded: 1,
        coverage: 'available',
        daily: [
          { date: '2026-09-22', balance: '90' },
          { date: '2026-09-23', balance: '100' },
        ],
        monthly: [],
      })?.balance.toString(),
    ).toBe('100');

    expect(
      officialBalanceBaseFromHistory({
        today: '2026-09-23',
        availableFrom: null,
        availableTo: null,
        pointCount: 0,
        accountsIncluded: 0,
        coverage: 'none',
        daily: [],
        monthly: [],
      }),
    ).toBeNull();

    expect(
      officialBalanceBaseFromHistory({
        today: '2026-10-01',
        availableFrom: '2026-08-01',
        availableTo: '2026-10-01',
        pointCount: 1,
        accountsIncluded: 1,
        coverage: 'partial',
        daily: [],
        monthly: [{ monthKey: '2026-09', balance: '250' }],
      }),
    ).toBeNull();
  });

  it('recua ao último mês com série diária quando o corrente ainda não tem ponto', async () => {
    const calls: Array<string | undefined> = [];
    const base = await resolveOfficialBankBalanceBase(
      {
        async getCashBalanceHistory(input) {
          calls.push(input.monthKey);
          if (input.monthKey === '2026-09') {
            return {
              today: '2026-10-01',
              availableFrom: '2026-08-01',
              availableTo: '2026-09-30',
              pointCount: 2,
              accountsIncluded: 1,
              coverage: 'available',
              daily: [{ date: '2026-09-30', balance: '250' }],
              monthly: [{ monthKey: '2026-09', balance: '250' }],
            };
          }
          return {
            today: '2026-10-01',
            availableFrom: '2026-08-01',
            availableTo: '2026-10-01',
            pointCount: 1,
            accountsIncluded: 1,
            coverage: 'partial',
            daily: [],
            monthly: [{ monthKey: '2026-09', balance: '250' }],
          };
        },
      },
      { tenantId: 't1', now: new Date('2026-10-01T15:00:00.000Z') },
    );
    expect(calls).toEqual([undefined, '2026-09']);
    expect(base?.balance.toString()).toBe('250');
    expect(base?.date.toISOString().slice(0, 10)).toBe('2026-09-30');
  });
});
