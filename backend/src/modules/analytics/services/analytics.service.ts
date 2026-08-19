import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import {
  CASH_FLOW_FORECAST_HORIZON_DAYS,
  calculateCashFlowForecast,
} from '../domain/cash-flow-forecast.js';
import { addCivilDays } from '../domain/civil-calendar.js';
import { calculateInstallmentStockSnapshot } from '../domain/installment-snapshot.js';
import { calculateReceivableDelinquency } from '../domain/receivable-delinquency.js';
import type {
  CashFlowForecast,
  FinancialStockSnapshot,
  GetFinancialStockSnapshotInput,
  GetUpcomingInstallmentsInput,
  UpcomingInstallments,
} from '../domain/types.js';
import { assertNDays, mapUpcomingInstallments } from '../domain/upcoming.js';

export type AnalyticsService = {
  getFinancialStockSnapshot(input: GetFinancialStockSnapshotInput): Promise<FinancialStockSnapshot>;
  getUpcomingReceivables(input: GetUpcomingInstallmentsInput): Promise<UpcomingInstallments>;
  getUpcomingPayables(input: GetUpcomingInstallmentsInput): Promise<UpcomingInstallments>;
  getCashFlowForecast(input: GetFinancialStockSnapshotInput): Promise<CashFlowForecast>;
};

export type AnalyticsServiceDependencies = {
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
};

export function createAnalyticsService(deps: AnalyticsServiceDependencies): AnalyticsService {
  return {
    async getFinancialStockSnapshot(input) {
      const { tenantId, today, scope } = resolveScope(input);
      const [receivableRows, payableRows] = await Promise.all([
        deps.receivables.findActiveByTenant(scope),
        deps.payables.findActiveByTenant(scope),
      ]);
      const receivables = calculateInstallmentStockSnapshot(receivableRows, today);
      return {
        tenantId,
        today,
        receivables,
        payables: calculateInstallmentStockSnapshot(payableRows, today),
        receivableDelinquency: calculateReceivableDelinquency(receivables),
      };
    },

    async getUpcomingReceivables(input) {
      return loadUpcoming(deps.receivables.findActiveByDueDateRange, input);
    },

    async getUpcomingPayables(input) {
      return loadUpcoming(deps.payables.findActiveByDueDateRange, input);
    },

    async getCashFlowForecast(input) {
      const { tenantId, today, scope } = resolveScope(input);
      const from = today;
      const to = addCivilDays(today, CASH_FLOW_FORECAST_HORIZON_DAYS);
      const [receivables, payables] = await Promise.all([
        deps.receivables.findActiveByDueDateRange({ ...scope, from, to }),
        deps.payables.findActiveByDueDateRange({ ...scope, from, to }),
      ]);
      return {
        tenantId,
        today,
        ...calculateCashFlowForecast(receivables, payables, from, to),
      };
    },
  };
}

function resolveScope(input: GetFinancialStockSnapshotInput) {
  assertTenantId(input.tenantId);
  const now = input.now ?? new Date();
  return {
    tenantId: input.tenantId,
    today: civilTodayInSaoPaulo(now),
    scope: { tenantId: input.tenantId, integrationId: input.integrationId },
  };
}

async function loadUpcoming(
  findActiveByDueDateRange: ReceivableReadRepository['findActiveByDueDateRange'],
  input: GetUpcomingInstallmentsInput,
): Promise<UpcomingInstallments> {
  assertNDays(input.nDays);
  const { tenantId, today, scope } = resolveScope(input);
  const from = today;
  const to = addCivilDays(today, input.nDays);
  const records = await findActiveByDueDateRange({ ...scope, from, to });
  return {
    tenantId,
    today,
    nDays: input.nDays,
    from,
    to,
    items: mapUpcomingInstallments(records),
  };
}
