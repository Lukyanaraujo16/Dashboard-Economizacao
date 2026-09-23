import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import type { CostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createCashExpectedHorizonService } from '../src/modules/analytics/services/cash-expected-horizon.service.js';

const TODAY = new Date('2026-09-23T15:00:00.000Z');

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
  readonly integrationId?: string;
  readonly categoryExternalIds?: readonly string[];
}): FinancialInstallmentReadRecord {
  const unpaid = dec(input.unpaid ?? '0');
  const paid = dec(input.paid ?? '0');
  return {
    id: input.externalId,
    tenantId: input.tenantId ?? 't1',
    integrationId: input.integrationId ?? 'i1',
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
    categoryExternalIds: input.categoryExternalIds ?? [],
    syncedAt: TODAY,
  };
}

describe('createCashExpectedHorizonService — projeção sem regressão de expected', () => {
  it('19/20 — isola tenant/integration e não vaza título de outro escopo', async () => {
    const seen: Array<{ tenantId: string; integrationId?: string }> = [];
    const service = createCashExpectedHorizonService({
      receivables: {
        async findActiveByTenant(scope) {
          seen.push(scope);
          if (scope.tenantId !== 't1') {
            return [installment({ externalId: 'leak', dueDate: '2026-09-24', unpaid: '99999', tenantId: 't2' })];
          }
          return [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '20' })];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceRevenue: async () => [],
        findByExternalIds: async () => [],
      },
      payables: {
        async findActiveByTenant() {
          return [];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceExpenses: async () => [],
        findByExternalIds: async () => [],
      },
      loadOfficialBalanceBase: async () => ({
        date: civil('2026-09-23'),
        balance: dec('100'),
        coverage: 'available',
      }),
    });

    const result = await service.getCashExpectedHorizon({
      tenantId: 't1',
      integrationId: 'i1',
      horizon: 3,
      now: TODAY,
    });
    expect(seen[0]?.tenantId).toBe('t1');
    expect(seen[0]?.integrationId).toBe('i1');
    expect(result.totals.receivables?.toString()).toBe('20');
    expect(result.projection?.available).toBe(true);
    expect(result.projection?.months[0]?.projectedBalance?.toString()).toBe('120');
  });

  it('13/23 — título DELETED não chega ao read model; expected permanece sem vencido', async () => {
    const service = createCashExpectedHorizonService({
      receivables: {
        async findActiveByTenant() {
          return [
            installment({ externalId: 'open', dueDate: '2026-09-24', unpaid: '10' }),
          ];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceRevenue: async () => [],
        findByExternalIds: async () => [],
      },
      payables: {
        async findActiveByTenant() {
          return [];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceExpenses: async () => [],
        findByExternalIds: async () => [],
      },
      loadOfficialBalanceBase: async () => ({
        date: civil('2026-09-23'),
        balance: dec('50'),
        coverage: 'available',
      }),
    });

    const result = await service.getCashExpectedHorizon({
      tenantId: 't1',
      horizon: 3,
      now: TODAY,
    });
    expect(result.totals.receivables?.toString()).toBe('10');
    expect(result.projection?.months[0]?.overdueAdjustment?.toString()).toBe('0');
    expect(result.projection?.months[0]?.projectedBalance?.toString()).toBe('60');
  });

  it('25/26/27/28 — filtro CC ou categoria mantém expected e oculta projeção', async () => {
    const open = installment({
      externalId: 'ar',
      dueDate: '2026-09-24',
      unpaid: '40',
      categoryExternalIds: ['cat-1'],
    });
    const service = createCashExpectedHorizonService({
      receivables: {
        async findActiveByTenant() {
          return [open];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceRevenue: async () => [],
        findByExternalIds: async () => [],
      },
      payables: {
        async findActiveByTenant() {
          return [];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceExpenses: async () => [],
        findByExternalIds: async () => [],
      },
      costCenterAllocations: {
        async findActiveReceivableAllocations() {
          return [{ amount: open.unpaid, installment: open }];
        },
        async findActivePayableAllocations() {
          return [];
        },
      } as unknown as CostCenterAllocationReadRepository,
      loadOfficialBalanceBase: async () => ({
        date: civil('2026-09-23'),
        balance: dec('1000'),
        coverage: 'available',
      }),
    });

    const byCategory = await service.getCashExpectedHorizon({
      tenantId: 't1',
      horizon: 3,
      now: TODAY,
      categoryFilter: { externalId: 'cat-1', type: 'REVENUE' },
    });
    expect(byCategory.totals.receivables?.toString()).toBe('40');
    expect(byCategory.projection?.available).toBe(false);
    expect(byCategory.projection?.unavailableReason).toBe('FILTERED');
    expect(byCategory.projection?.months).toEqual([]);

    const byCostCenter = await service.getCashExpectedHorizon({
      tenantId: 't1',
      horizon: 3,
      now: TODAY,
      costCenterId: 'cc-1',
    });
    expect(byCostCenter.totals.receivables?.toString()).toBe('40');
    expect(byCostCenter.projection?.available).toBe(false);
    expect(byCostCenter.projection?.unavailableReason).toBe('FILTERED');

    const combined = await service.getCashExpectedHorizon({
      tenantId: 't1',
      horizon: 3,
      now: TODAY,
      costCenterId: 'cc-1',
      categoryFilter: { externalId: 'cat-1', type: 'REVENUE' },
    });
    expect(combined.totals.receivables?.toString()).toBe('40');
    expect(combined.projection?.unavailableReason).toBe('FILTERED');
  });

  it('29/30/31 — só o mês civil corrente libera projeção', async () => {
    const service = createCashExpectedHorizonService({
      receivables: {
        async findActiveByTenant() {
          return [installment({ externalId: 'ar', dueDate: '2026-09-24', unpaid: '10' })];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceRevenue: async () => [],
        findByExternalIds: async () => [],
      },
      payables: {
        async findActiveByTenant() {
          return [];
        },
        findActiveByDueDateRange: async () => [],
        findMonthlyCompetenceExpenses: async () => [],
        findByExternalIds: async () => [],
      },
      loadOfficialBalanceBase: async () => ({
        date: civil('2026-09-23'),
        balance: dec('80'),
        coverage: 'available',
      }),
    });

    const current = await service.getCashExpectedHorizon({
      tenantId: 't1',
      monthKey: '2026-09',
      horizon: 3,
      now: TODAY,
    });
    expect(current.projection?.available).toBe(true);
    expect(current.totals.receivables?.toString()).toBe('10');

    const past = await service.getCashExpectedHorizon({
      tenantId: 't1',
      monthKey: '2026-05',
      horizon: 3,
      now: TODAY,
    });
    expect(past.projection?.available).toBe(false);
    expect(past.projection?.unavailableReason).toBe('NOT_CURRENT_MONTH');
    expect(past.totals.receivables?.toString()).toBe('0');

    const future = await service.getCashExpectedHorizon({
      tenantId: 't1',
      monthKey: '2026-11',
      horizon: 3,
      now: TODAY,
    });
    expect(future.projection?.available).toBe(false);
    expect(future.projection?.unavailableReason).toBe('NOT_CURRENT_MONTH');
  });
});
