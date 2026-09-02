import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { collectCashCategoryExternalIds } from '../domain/cash-realized-category-composition.js';
import { civilMonthBounds, civilMonthBoundsFromKey, civilMonthKey } from '../domain/civil-calendar.js';
import { buildExpectedReceivableDetailItems } from '../domain/expected-receivable-details.js';
import { selectExpectedOpenReceivables } from '../domain/expected-open-receivables.js';
import { matchesDashboardCategoryFilter } from '../domain/dashboard-home-filters.js';
import type { DashboardCategoryFilter } from '../domain/dashboard-home-filters.js';
import type { CashCostCenterAllocationSource } from '../domain/monthly-cash-flow.js';
import type { ExpectedReceivableDetails, GetMonthlyCashFlowInput } from '../domain/types.js';

const ZERO = new Prisma.Decimal(0);

export type ExpectedReceivableDetailsService = {
  getExpectedReceivableDetails(input: GetMonthlyCashFlowInput): Promise<ExpectedReceivableDetails>;
};

export type ExpectedReceivableDetailsServiceDependencies = {
  readonly receivables: ReceivableReadRepository;
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
  deps: ExpectedReceivableDetailsServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

function activeReceivablesForCategory(
  receivables: Awaited<ReturnType<ReceivableReadRepository['findActiveByTenant']>>,
  categoryFilter: DashboardCategoryFilter | null | undefined,
) {
  return receivables.filter(
    (row) =>
      (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(row.status) &&
      matchesDashboardCategoryFilter(row, categoryFilter ?? null, 'REVENUE'),
  );
}

export function createExpectedReceivableDetailsService(
  deps: ExpectedReceivableDetailsServiceDependencies,
): ExpectedReceivableDetailsService {
  return {
    async getExpectedReceivableDetails(input) {
      const { tenantId, today, from, to, monthKey, scope, costCenterId } = resolveMonth(input);
      const categoryFilter = input.categoryFilter ?? null;

      const receivables = await deps.receivables.findActiveByTenant(scope);
      const filteredReceivables = activeReceivablesForCategory(receivables, categoryFilter);

      let expectedReceivableRows: readonly CashCostCenterAllocationSource[] = filteredReceivables.map(
        (installment) => ({
          amount: installment.unpaid,
          installment,
        }),
      );

      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        expectedReceivableRows = await allocations.findActiveReceivableAllocations({
          ...scope,
          costCenterId,
        });
      }

      const selection = selectExpectedOpenReceivables({
        rows: expectedReceivableRows,
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
      const items = buildExpectedReceivableDetailItems({
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
  };
}
