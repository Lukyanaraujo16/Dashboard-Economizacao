import type { PrismaClient } from '../../../generated/prisma/client.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createExpectedReceivableDetailsService } from '../../analytics/services/expected-receivable-details.service.js';
import { createExpectedPayableDetailsService } from '../../analytics/services/expected-payable-details.service.js';
import { createCashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import { createCashExpectedHorizonService } from '../../analytics/services/cash-expected-horizon.service.js';
import { createMonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulBalanceSnapshotRepository } from '../../integrations/conta-azul/repositories/balance-snapshot.repository.js';
import { createRevenueGoalRepository } from '../repositories/revenue-goal.repository.js';
import { createExpenseCeilingRepository } from '../repositories/expense-ceiling.repository.js';
import {
  createCashBalanceHistoryService,
  resolveOfficialBankBalanceBase,
} from './cash-balance-history.service.js';
import {
  createDashboardOverviewFacade,
  type DashboardOverviewFacade,
} from './dashboard-overview.facade.js';

/**
 * Facade completa da Dashboard (Home, saldo bancário, detalhes, metas).
 * Compartilhada pelas rotas HTTP e pelo Consultor em modo agente (mesmos números).
 */
export function buildDashboardOverviewFacade(input: {
  readonly prisma: PrismaClient;
  readonly scheduleProactiveEvaluation?: (tenantId: string) => Promise<void>;
}): DashboardOverviewFacade {
  const { prisma } = input;
  const costCenters = createCostCenterReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const receivables = createReceivableReadRepository(prisma);
  const payables = createPayableReadRepository(prisma);
  const parties = createPartyReadRepository(prisma);
  const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
  const cashBalanceHistory = createCashBalanceHistoryService({
    snapshots: createContaAzulBalanceSnapshotRepository(prisma),
  });
  return createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables,
      payables,
      categories,
      costCenterAllocations,
    }),
    cashFlow: createMonthlyCashFlowService({
      ledger: createLedgerReadRepository(prisma),
      receivables,
      payables,
      categories,
      costCenterAllocations,
    }),
    cashExpectedHorizon: createCashExpectedHorizonService({
      receivables,
      payables,
      costCenterAllocations,
      loadOfficialBalanceBase: ({ tenantId, now }) =>
        resolveOfficialBankBalanceBase(cashBalanceHistory, { tenantId, now }),
    }),
    expectedReceivableDetails: createExpectedReceivableDetailsService({
      receivables,
      categories,
      parties,
      costCenterAllocations,
    }),
    expectedPayableDetails: createExpectedPayableDetailsService({
      payables,
      categories,
      parties,
      costCenterAllocations,
    }),
    cashRealizedDetails: createCashRealizedDetailsService({
      ledger: createLedgerReadRepository(prisma),
      receivables,
      payables,
      categories,
      parties,
      costCenterAllocations,
    }),
    cashBalanceHistory,
    integrations: createContaAzulIntegrationRepository(prisma),
    revenueGoals: createRevenueGoalRepository(prisma),
    expenseCeilings: createExpenseCeilingRepository(prisma),
    costCenters,
    categories,
    ...(input.scheduleProactiveEvaluation === undefined
      ? {}
      : { scheduleProactiveEvaluation: input.scheduleProactiveEvaluation }),
  });
}
