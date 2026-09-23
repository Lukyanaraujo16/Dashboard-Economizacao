import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { collectCashCategoryExternalIds } from '../domain/cash-realized-category-composition.js';
import { civilMonthBounds, civilMonthBoundsFromKey, civilMonthKey } from '../domain/civil-calendar.js';
import { buildExpectedPayableDetailItems } from '../domain/expected-payable-details.js';
import { buildPayableStockDetailItems } from '../domain/pending-payable-details.js';
import { selectExpectedOpenPayables } from '../domain/expected-open-payables.js';
import { selectPendingStockInstallments } from '../domain/pending-installment-stock.js';
import { matchesDashboardCategoryFilter } from '../domain/dashboard-home-filters.js';
import type { DashboardCategoryFilter } from '../domain/dashboard-home-filters.js';
import type { CashCostCenterAllocationSource } from '../domain/monthly-cash-flow.js';
import type {
  ExpectedPayableDetails,
  GetFinancialStockSnapshotInput,
  GetMonthlyCashFlowInput,
  PayableStockDetails,
} from '../domain/types.js';

const ZERO = new Prisma.Decimal(0);

export type ExpectedPayableDetailsService = {
  getExpectedPayableDetails(input: GetMonthlyCashFlowInput): Promise<ExpectedPayableDetails>;
  getPayableStockDetails(input: GetFinancialStockSnapshotInput): Promise<PayableStockDetails>;
};

export type ExpectedPayableDetailsServiceDependencies = {
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  readonly parties: PartyReadRepository;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
};

function resolveMonth(input: GetMonthlyCashFlowInput): {
  readonly tenantId: string;
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string;
  readonly scope: { readonly tenantId: string; readonly integrationId?: string };
  readonly costCenterId: string | undefined;
} {
  assertTenantId(input.tenantId);
  const today = civilTodayInSaoPaulo(input.now ?? new Date());
  const bounds = input.monthKey ? civilMonthBoundsFromKey(input.monthKey) : civilMonthBounds(today);
  return {
    tenantId: input.tenantId.trim(),
    today,
    from: bounds.from,
    to: bounds.to,
    monthKey: input.monthKey ?? civilMonthKey(bounds.from),
    scope: {
      tenantId: input.tenantId.trim(),
      ...(input.integrationId !== undefined && input.integrationId.trim() !== ''
        ? { integrationId: input.integrationId }
        : {}),
    },
    costCenterId: input.costCenterId,
  };
}

function requireAllocations(
  deps: ExpectedPayableDetailsServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

function activePayablesForCategory(
  payables: Awaited<ReturnType<PayableReadRepository['findActiveByTenant']>>,
  categoryFilter: DashboardCategoryFilter | null | undefined,
) {
  return payables.filter(
    (row) =>
      (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(row.status) &&
      matchesDashboardCategoryFilter(row, categoryFilter ?? null, 'EXPENSE'),
  );
}

export function createExpectedPayableDetailsService(
  deps: ExpectedPayableDetailsServiceDependencies,
): ExpectedPayableDetailsService {
  return {
    async getExpectedPayableDetails(input) {
      const { tenantId, today, from, to, monthKey, scope, costCenterId } = resolveMonth(input);
      const categoryFilter = input.categoryFilter ?? null;

      const payables = await deps.payables.findActiveByTenant(scope);
      const filteredPayables = activePayablesForCategory(payables, categoryFilter);

      let expectedPayableRows: readonly CashCostCenterAllocationSource[] = filteredPayables.map(
        (installment) => ({
          amount: installment.unpaid,
          installment,
        }),
      );

      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        expectedPayableRows = await allocations.findActivePayableAllocations({
          ...scope,
          costCenterId,
        });
      }

      const selection = selectExpectedOpenPayables({
        rows: expectedPayableRows,
        today,
        from,
        to,
        categoryFilter,
        hasCostCenter: costCenterId !== undefined,
      });

      if (!selection.available) {
        return {
          tenantId,
          monthKey,
          from,
          to,
          today,
          available: false,
          total: null,
          items: [],
        };
      }

      const partyIds = selection.items
        .map((row) => row.installment.partyId)
        .filter((id): id is string => id !== null);
      const categoryIds = collectCashCategoryExternalIds(
        selection.items.map((row) => ({ categoryExternalIds: row.installment.categoryExternalIds })),
      );

      const [partyNames, categories] = await Promise.all([
        deps.parties.findNamesByIds(scope, partyIds),
        categoryIds.length === 0
          ? Promise.resolve([])
          : deps.categories.findByTenantAndExternalIds({ ...scope, externalIds: categoryIds }),
      ]);

      const categoryCatalog = new Map(categories.map((row) => [row.externalId, row]));
      const items = buildExpectedPayableDetailItems({
        items: selection.items,
        partyNames,
        categories: categoryCatalog,
      });

      const total = items.reduce((sum, row) => sum.plus(row.amount), ZERO);

      return {
        tenantId,
        monthKey,
        from,
        to,
        today,
        available: true,
        total,
        items,
      };
    },

    async getPayableStockDetails(input) {
      const { tenantId, today, scope, costCenterId } = resolveStockScope(input);
      const categoryFilter = input.categoryFilter ?? null;

      const payables = await deps.payables.findActiveByTenant(scope);
      const filteredPayables = activePayablesForCategory(payables, categoryFilter);

      let rows: readonly CashCostCenterAllocationSource[] = filteredPayables.map((installment) => ({
        amount: installment.unpaid,
        installment,
      }));

      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        rows = await allocations.findActivePayableAllocations({
          ...scope,
          costCenterId,
        });
      }

      const selection = selectPendingStockInstallments({
        rows,
        today,
        categoryFilter,
        hasCostCenter: costCenterId !== undefined,
        expectedType: 'EXPENSE',
      });

      if (!selection.available) {
        return {
          tenantId,
          today,
          available: false,
          total: null,
          overdue: null,
          dueToday: null,
          upcoming: null,
          items: [],
        };
      }

      const partyIds = selection.items
        .map((row) => row.installment.partyId)
        .filter((id): id is string => id !== null);
      const categoryIds = collectCashCategoryExternalIds(
        selection.items.map((row) => ({ categoryExternalIds: row.installment.categoryExternalIds })),
      );

      const [partyNames, categories] = await Promise.all([
        deps.parties.findNamesByIds(scope, partyIds),
        categoryIds.length === 0
          ? Promise.resolve([])
          : deps.categories.findByTenantAndExternalIds({ ...scope, externalIds: categoryIds }),
      ]);

      const categoryCatalog = new Map(categories.map((row) => [row.externalId, row]));
      const items = buildPayableStockDetailItems({
        items: selection.items,
        partyNames,
        categories: categoryCatalog,
      });

      return {
        tenantId,
        today,
        available: true,
        total: selection.totals.open,
        overdue: selection.totals.overdue,
        dueToday: selection.totals.dueToday,
        upcoming: selection.totals.upcoming,
        items,
      };
    },
  };
}

function resolveStockScope(input: GetFinancialStockSnapshotInput): {
  readonly tenantId: string;
  readonly today: Date;
  readonly scope: { readonly tenantId: string; readonly integrationId?: string };
  readonly costCenterId: string | undefined;
} {
  assertTenantId(input.tenantId);
  return {
    tenantId: input.tenantId.trim(),
    today: civilTodayInSaoPaulo(input.now ?? new Date()),
    scope: {
      tenantId: input.tenantId.trim(),
      ...(input.integrationId !== undefined && input.integrationId.trim() !== ''
        ? { integrationId: input.integrationId }
        : {}),
    },
    costCenterId: input.costCenterId,
  };
}
