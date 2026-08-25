import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createDashboardOverviewFacade } from '../../dashboard/services/dashboard-overview.facade.js';
import { createRevenueGoalRepository } from '../../dashboard/repositories/revenue-goal.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { assertNoTenantIdQuery } from '../../dashboard/http/assert-no-tenant-id-query.js';
import { parseDashboardCategoryQuery } from '../../dashboard/http/parse-dashboard-category-query.js';
import { parseDashboardCostCenterQuery } from '../../dashboard/http/parse-dashboard-cost-center-query.js';
import { parseDashboardSituationQuery } from '../../dashboard/http/parse-dashboard-situation-query.js';
import { parseReportMonthRange } from './parse-report-month-range.js';

export async function registerReportsRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const costCenters = createCostCenterReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const dashboard = createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
      categories,
      costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
    }),
    integrations: createContaAzulIntegrationRepository(prisma),
    revenueGoals: createRevenueGoalRepository(prisma),
    costCenters,
    categories,
  });

  app.get('/reports/revenue', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const range = parseReportMonthRange(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const situation = parseDashboardSituationQuery(request.query);
    const categoryId = parseDashboardCategoryQuery(request.query);
    const body = await dashboard.getRevenueReport(
      auth,
      range.from,
      range.to,
      costCenterId,
      situation,
      categoryId,
    );
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });
}
