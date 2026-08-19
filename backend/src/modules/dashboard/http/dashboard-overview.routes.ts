import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createDashboardOverviewFacade } from '../services/dashboard-overview.facade.js';
import { assertNoTenantIdQuery } from './assert-no-tenant-id-query.js';

export async function registerDashboardOverviewRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const overview = createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
    }),
    integrations: createContaAzulIntegrationRepository(prisma),
  });

  app.get('/dashboard/overview', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const body = await overview.getOverview(auth);
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });
}
