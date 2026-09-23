import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createExpectedReceivableDetailsService } from '../../analytics/services/expected-receivable-details.service.js';
import { createExpectedPayableDetailsService } from '../../analytics/services/expected-payable-details.service.js';
import { createCashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import { createCashExpectedHorizonService } from '../../analytics/services/cash-expected-horizon.service.js';
import { createMonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulBalanceSnapshotRepository } from '../../integrations/conta-azul/repositories/balance-snapshot.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createRevenueGoalRepository } from '../repositories/revenue-goal.repository.js';
import { createCashBalanceHistoryService } from '../services/cash-balance-history.service.js';
import { createDashboardOverviewFacade } from '../services/dashboard-overview.facade.js';
import { assertNoCashBalanceAnalyticsFilters } from './assert-no-cash-balance-analytics-filters.js';
import { assertNoTenantIdQuery } from './assert-no-tenant-id-query.js';
import { parseDashboardCategoryQuery } from './parse-dashboard-category-query.js';
import { parseDashboardCostCenterListPeriod } from './parse-dashboard-cost-center-list-period.js';
import { parseDashboardCostCenterQuery } from './parse-dashboard-cost-center-query.js';
import { parseDashboardMonth } from './parse-dashboard-month.js';
import { parseDashboardRevenueGoalBody } from './parse-dashboard-revenue-goal-body.js';
import { parseDashboardSituationQuery } from './parse-dashboard-situation-query.js';
import { parseDashboardUpcomingDays } from './parse-dashboard-upcoming-days.js';
import { parseCashExpectedHorizonQuery } from './parse-cash-expected-horizon-query.js';
import {
  parseCashRealizedDetailsCategoryKey,
  parseCashRealizedDetailsCategoryKind,
  parseCashRealizedDetailsDirection,
  parseCashRealizedDetailsLimit,
  parseCashRealizedDetailsOffset,
} from './parse-cash-realized-details-query.js';

export async function registerDashboardOverviewRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const costCenters = createCostCenterReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const receivables = createReceivableReadRepository(prisma);
  const payables = createPayableReadRepository(prisma);
  const parties = createPartyReadRepository(prisma);
  const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
  const dashboard = createDashboardOverviewFacade({
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
    cashBalanceHistory: createCashBalanceHistoryService({
      snapshots: createContaAzulBalanceSnapshotRepository(prisma),
    }),
    integrations: createContaAzulIntegrationRepository(prisma),
    revenueGoals: createRevenueGoalRepository(prisma),
    costCenters,
    categories,
  });

  app.get(
    '/dashboard/cost-centers',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const period = parseDashboardCostCenterListPeriod(request.query);
      const body = await dashboard.listCostCenters(auth, {
        from: period.from,
        to: period.to,
        monthKey: period.monthKey,
        context: period.context,
      });
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/categories',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const period = parseDashboardCostCenterListPeriod(request.query);
      const body = await dashboard.listCategories(auth, {
        from: period.from,
        to: period.to,
        monthKey: period.monthKey,
        context: period.context,
      });
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get('/dashboard/overview', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const body = await dashboard.getOverview(auth, costCenterId);
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });

  app.get('/dashboard/upcoming', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const nDays = parseDashboardUpcomingDays(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const body = await dashboard.getUpcoming(auth, nDays, costCenterId);
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });

  app.get(
    '/dashboard/cash-flow-forecast',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      const body = await dashboard.getCashFlowForecast(auth, costCenterId, categoryId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/expense-composition',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const body = await dashboard.getExpenseComposition(auth, costCenterId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/receivable-composition',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const body = await dashboard.getReceivableComposition(auth, costCenterId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/monthly-revenue',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const situation = parseDashboardSituationQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      const body = await dashboard.getMonthlyRevenue(
        auth,
        monthKey,
        costCenterId,
        situation,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/monthly-expenses',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const situation = parseDashboardSituationQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      const body = await dashboard.getMonthlyExpenses(
        auth,
        monthKey,
        costCenterId,
        situation,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/monthly-cash-flow',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      // situation, se presente, é validada e ignorada: realizado é evento histórico.
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getMonthlyCashFlow(auth, monthKey, costCenterId, categoryId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/cash-movement-history',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getCashMovementHistory(auth, monthKey, costCenterId, categoryId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/cash-expected-horizon',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const horizon = parseCashExpectedHorizonQuery(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getCashExpectedHorizon(auth, {
        monthKey,
        horizon,
        costCenterId,
        categoryId,
      });
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/cash-balance-history',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      assertNoCashBalanceAnalyticsFilters(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const body = await dashboard.getCashBalanceHistory(auth, monthKey);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/receivables/expected-details',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getExpectedReceivableDetails(
        auth,
        monthKey,
        costCenterId,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/payables/expected-details',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getExpectedPayableDetails(
        auth,
        monthKey,
        costCenterId,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/receivables/stock-details',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getReceivableStockDetails(
        auth,
        monthKey,
        costCenterId,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/payables/stock-details',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const body = await dashboard.getPayableStockDetails(
        auth,
        monthKey,
        costCenterId,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/cash-realized/details',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const direction = parseCashRealizedDetailsDirection(request.query);
      const categoryKey = parseCashRealizedDetailsCategoryKey(request.query);
      const categoryKind = parseCashRealizedDetailsCategoryKind(request.query);
      const limit = parseCashRealizedDetailsLimit(request.query);
      const offset = parseCashRealizedDetailsOffset(request.query);
      const body = await dashboard.getCashRealizedDetails(auth, {
        monthKey,
        direction,
        categoryKey,
        categoryKind,
        costCenterId,
        categoryId,
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      });
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/month-end-cash-pressure',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      parseDashboardSituationQuery(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      const body = await dashboard.getMonthEndCashPressure(auth, costCenterId, categoryId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/revenue-goal',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      // Meta é sempre company-level — costCenter/situation/category, se presentes, são ignorados.
      const monthKey = parseDashboardMonth(request.query);
      const body = await dashboard.getRevenueGoal(auth, monthKey);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.put(
    '/dashboard/revenue-goal',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const command = parseDashboardRevenueGoalBody(request.body);
      const body = await dashboard.upsertRevenueGoal(auth, command.monthKey, command.targetAmount);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.get(
    '/dashboard/executive-insights',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      assertNoTenantIdQuery(request.query);
      const monthKey = parseDashboardMonth(request.query);
      const costCenterId = parseDashboardCostCenterQuery(request.query);
      const situation = parseDashboardSituationQuery(request.query);
      const categoryId = parseDashboardCategoryQuery(request.query);
      const body = await dashboard.getMonthlyExecutiveInsights(
        auth,
        monthKey,
        costCenterId,
        situation,
        categoryId,
      );
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );
}
