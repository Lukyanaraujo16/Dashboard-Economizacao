import { assertTenantId } from '../../finance/repositories/read-query.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import {
  calculateCashExpectedHorizon,
  type CashExpectedHorizon,
  type CashExpectedHorizonMonths,
} from '../domain/cash-expected-horizon.js';
import { civilMonthBounds, civilMonthBoundsFromKey, civilMonthKey } from '../domain/civil-calendar.js';
import type { DashboardCategoryFilter } from '../domain/dashboard-home-filters.js';
import { accumulateReceivableOverdue } from '../domain/expected-open-receivables.js';
import { accumulatePayableOverdue } from '../domain/expected-open-payables.js';
import type { CashCostCenterAllocationSource } from '../domain/monthly-cash-flow.js';
import {
  calculateProjectedBankBalance,
  type OfficialBankBalanceBase,
} from '../domain/projected-bank-balance.js';

export type GetCashExpectedHorizonInput = {
  readonly tenantId: string;
  readonly integrationId?: string;
  readonly monthKey?: string | null;
  readonly horizon: CashExpectedHorizonMonths;
  readonly costCenterId?: string;
  readonly categoryFilter?: DashboardCategoryFilter | null;
  readonly now?: Date;
};

export type CashExpectedHorizonService = {
  getCashExpectedHorizon(input: GetCashExpectedHorizonInput): Promise<CashExpectedHorizon>;
};

export type CashExpectedHorizonServiceDependencies = {
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
  readonly loadOfficialBalanceBase?: (input: {
    readonly tenantId: string;
    readonly now: Date;
  }) => Promise<OfficialBankBalanceBase | null>;
};

function requireAllocations(
  deps: CashExpectedHorizonServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

/**
 * Uma carga AR/AP (+ CC CURRENT se filtro) → buckets mensais do horizonte.
 * Sem ledger. Sem N× MonthlyCashFlow.
 * Projeção bancária é camada extra: não altera `expected`.
 */
export function createCashExpectedHorizonService(
  deps: CashExpectedHorizonServiceDependencies,
): CashExpectedHorizonService {
  return {
    async getCashExpectedHorizon(input) {
      assertTenantId(input.tenantId);
      const today = civilTodayInSaoPaulo(input.now ?? new Date());
      const currentMonthKey = civilMonthKey(today);
      const anchorBounds = input.monthKey
        ? civilMonthBoundsFromKey(input.monthKey)
        : civilMonthBounds(today);
      const anchorMonthKey = input.monthKey ?? civilMonthKey(anchorBounds.from);
      const scope = {
        tenantId: input.tenantId.trim(),
        ...(input.integrationId !== undefined && input.integrationId.trim() !== ''
          ? { integrationId: input.integrationId }
          : {}),
      };
      const costCenterId = input.costCenterId;
      const categoryFilter = input.categoryFilter ?? null;
      const filtered = costCenterId !== undefined || categoryFilter !== null;
      const anchorIsCurrentMonth = anchorMonthKey === currentMonthKey;

      let receivableRows: readonly CashCostCenterAllocationSource[];
      let payableRows: readonly CashCostCenterAllocationSource[];

      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        const [expectedReceivables, expectedPayables] = await Promise.all([
          allocations.findActiveReceivableAllocations({ ...scope, costCenterId }),
          allocations.findActivePayableAllocations({ ...scope, costCenterId }),
        ]);
        receivableRows = expectedReceivables;
        payableRows = expectedPayables;
      } else {
        const [receivables, payables] = await Promise.all([
          deps.receivables.findActiveByTenant(scope),
          deps.payables.findActiveByTenant(scope),
        ]);
        receivableRows = receivables.map((installment) => ({
          amount: installment.unpaid,
          installment,
        }));
        payableRows = payables.map((installment) => ({
          amount: installment.unpaid,
          installment,
        }));
      }

      const horizon = calculateCashExpectedHorizon({
        today,
        anchorMonthKey,
        horizon: input.horizon,
        receivableRows,
        payableRows,
        categoryFilter,
        hasCostCenter: costCenterId !== undefined,
      });

      const overdueReceivables = accumulateReceivableOverdue({
        rows: receivableRows,
        today,
        from: anchorBounds.from,
        to: anchorBounds.to,
        categoryFilter,
        hasCostCenter: costCenterId !== undefined,
      });
      const overduePayables = accumulatePayableOverdue({
        rows: payableRows,
        today,
        from: anchorBounds.from,
        to: anchorBounds.to,
        categoryFilter,
        hasCostCenter: costCenterId !== undefined,
      });

      let base: OfficialBankBalanceBase | null = null;
      if (!filtered && anchorIsCurrentMonth && deps.loadOfficialBalanceBase) {
        base = await deps.loadOfficialBalanceBase({
          tenantId: input.tenantId.trim(),
          now: input.now ?? new Date(),
        });
      }

      const projection = calculateProjectedBankBalance({
        horizon,
        overdueReceivables: overdueReceivables.overdue,
        overduePayables: overduePayables.overdue,
        base,
        filtered,
        anchorIsCurrentMonth,
      });

      return { ...horizon, projection };
    },
  };
}
