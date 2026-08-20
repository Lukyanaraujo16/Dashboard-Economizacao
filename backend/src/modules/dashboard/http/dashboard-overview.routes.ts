import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createDashboardOverviewFacade } from '../services/dashboard-overview.facade.js';
import { assertNoTenantIdQuery } from './assert-no-tenant-id-query.js';
import { parseDashboardMonth } from './parse-dashboard-month.js';
import { parseDashboardUpcomingDays } from './parse-dashboard-upcoming-days.js';

export async function registerDashboardOverviewRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const dashboard = createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
      categories: createFinancialCategoryReadRepository(prisma),
    }),
    integrations: createContaAzulIntegrationRepository(prisma),
  });

  app.get('/dashboard/overview', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const body = await dashboard.getOverview(auth);
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });

  app.get('/dashboard/upcoming', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const nDays = parseDashboardUpcomingDays(request.query);
    const body = await dashboard.getUpcoming(auth, nDays);
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
      const body = await dashboard.getCashFlowForecast(auth);
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
      const body = await dashboard.getExpenseComposition(auth);
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
      const body = await dashboard.getReceivableComposition(auth);
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
      const body = await dashboard.getMonthlyRevenue(auth, monthKey);
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
      const body = await dashboard.getMonthlyExpenses(auth, monthKey);
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
      const body = await dashboard.getMonthEndCashPressure(auth);
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
      const body = await dashboard.getMonthlyExecutiveInsights(auth, monthKey);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );
}
