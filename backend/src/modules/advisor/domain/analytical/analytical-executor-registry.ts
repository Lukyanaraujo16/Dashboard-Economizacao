import type { AnalyticalExecutorKey } from './analytical-keys.js';
import type { AnalyticalExecutor } from './analytical-execution-types.js';
import {
  executeCompareCashMonths,
  executeCurrentSnapshot,
  executeFinancialFactsMonth,
  executeMonthlyPlanning,
  executeRealizedCashCategoryBreakdown,
  executeRealizedCashCounterparty,
  executeRealizedCashCostCenter,
  executeRealizedCashMovements,
} from './analytical-executors.js';

/**
 * Deny-by-default: só executorKeys declarados nas capabilities publicadas.
 * Provider/LLM nunca escolhe executor por string arbitrária.
 */
const ANALYTICAL_EXECUTOR_REGISTRY: Record<AnalyticalExecutorKey, AnalyticalExecutor> = {
  compareCashMonths: executeCompareCashMonths,
  realizedCashCategoryBreakdown: executeRealizedCashCategoryBreakdown,
  realizedCashMovements: executeRealizedCashMovements,
  realizedCashCounterparty: executeRealizedCashCounterparty,
  realizedCashCostCenter: executeRealizedCashCostCenter,
  currentSnapshot: executeCurrentSnapshot,
  financialFactsMonth: executeFinancialFactsMonth,
  monthlyPlanning: executeMonthlyPlanning,
};

export function getAnalyticalExecutor(
  key: AnalyticalExecutorKey,
): AnalyticalExecutor | undefined {
  return ANALYTICAL_EXECUTOR_REGISTRY[key];
}

export function listAnalyticalExecutorKeys(): readonly AnalyticalExecutorKey[] {
  return Object.keys(ANALYTICAL_EXECUTOR_REGISTRY) as AnalyticalExecutorKey[];
}
