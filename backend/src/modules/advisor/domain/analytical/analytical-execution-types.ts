import type { AnalyticalCapability } from './analytical-capability-registry.js';
import type { AnalyticalExecutorKey } from './analytical-keys.js';
import type { AnalyticalQuery } from './analytical-query.js';
import type { AnalyticalResult } from './analytical-result.js';
import type { AdvisorCashComparisonService } from '../advisor-analytical-tools.js';
import type { AdvisorCashBreakdownService } from '../advisor-analytical-tools.js';
import type { AdvisorCashMovementLinesService } from '../advisor-analytical-tools.js';
import type { AdvisorNominalDimensionService } from '../advisor-nominal-tools.js';
import type { AdvisorCostCenterDimensionService } from '../advisor-cost-center-tools.js';
import type { AdvisorCashMovementSort } from '../advisor-cash-movement-lines.js';
import type { AdvisorPayableTitlesService } from '../advisor-payable-titles-tools.js';
import type {
  AdvisorPayableTitleOrdering,
  AdvisorPayableTitleStatus,
} from '../advisor-payable-titles.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../../../analytics/domain/types.js';
import type { MonthlyCashFlowService } from '../../../analytics/services/monthly-cash-flow.service.js';
import type { ExpenseCeilingRepository } from '../../../dashboard/repositories/expense-ceiling.repository.js';
import type { RevenueGoalRepository } from '../../../dashboard/repositories/revenue-goal.repository.js';
import type { CounterpartyIdentityService } from '../load-counterparty-identity-population.js';
import type { CashRealizedDetailsService } from '../../../analytics/services/cash-realized-details.service.js';
import type { CostCenterReadRepository } from '../../../finance/repositories/cost-center-read.repository.js';

/**
 * Runtime seguro: tenant/user/now NÃO vêm da AnalyticalQuery nem do LLM.
 */
export type AnalyticalExecutionRuntime = {
  readonly tenantId: string;
  readonly now?: Date;
  readonly cashComparison?: AdvisorCashComparisonService;
  readonly cashBreakdown?: AdvisorCashBreakdownService;
  readonly cashMovements?: AdvisorCashMovementLinesService;
  readonly cashNominal?: AdvisorNominalDimensionService;
  readonly cashCostCenter?: AdvisorCostCenterDimensionService;
  readonly payableTitles?: AdvisorPayableTitlesService;
  readonly counterpartyIdentity?: CounterpartyIdentityService;
  /** Já materializados pelo Context Builder (preload). */
  readonly monthlyCashFlow?: MonthlyCashFlow | null;
  readonly financialStockSnapshot?: FinancialStockSnapshot | null;
  /** Planejamento mensal consolidado. Não herda filtro de centro de custo. */
  readonly planningCashFlow?: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly revenueGoals?: RevenueGoalRepository;
  readonly expenseCeilings?: ExpenseCeilingRepository;
  /** Mesmo serviço do detalhe diário da Dashboard. */
  readonly cashRealizedDay?: Pick<CashRealizedDetailsService, 'getCashRealizedDayDetails'>;
  readonly costCenters?: Pick<CostCenterReadRepository, 'listByTenant'>;
};

/**
 * Hints de tool que não pertencem ao contrato AnalyticalQuery (ex.: sort de movements).
 */
export type AnalyticalExecutionHints = {
  readonly movementSort?: AdvisorCashMovementSort;
  readonly payableTitleStatus?: AdvisorPayableTitleStatus;
  readonly payableTitleOrdering?: AdvisorPayableTitleOrdering;
};

export type ValidatedAnalyticalQuery = {
  readonly query: AnalyticalQuery;
  readonly capability: AnalyticalCapability;
};

export type AnalyticalExecutionSuccess = {
  readonly ok: true;
  readonly capability: AnalyticalCapability;
  readonly executorKey: AnalyticalExecutorKey;
  readonly result: AnalyticalResult;
  /** Fact/payload legado bit-a-bit do caminho atual. */
  readonly legacyFact: Record<string, unknown>;
};

export type AnalyticalExecutionFailure = {
  readonly ok: false;
  readonly reason:
    | 'CAPABILITY_NOT_FOUND'
    | 'EXECUTOR_NOT_FOUND'
    | 'EXECUTOR_DEPENDENCY_MISSING'
    | 'INVALID_QUERY'
    | 'EXECUTION_FAILED';
  readonly message: string;
  readonly capabilityKey?: string;
  readonly executorKey?: AnalyticalExecutorKey;
};

export type AnalyticalExecutionOutcome =
  | AnalyticalExecutionSuccess
  | AnalyticalExecutionFailure;

export type AnalyticalExecutor = (input: {
  readonly validated: ValidatedAnalyticalQuery;
  readonly runtime: AnalyticalExecutionRuntime;
  readonly hints?: AnalyticalExecutionHints;
}) => Promise<AnalyticalExecutionSuccess>;
