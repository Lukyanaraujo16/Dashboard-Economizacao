import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { parsePatchTenantBrandingRequestBody } from '../schemas/admin-branding.schemas.js';
import { createAdminBrandingService } from '../services/admin-branding.service.js';
import { createTenantBrandingRepository } from '../repositories/tenant-branding.repository.js';

/**
 * API administrativa de Branding por Empresa — operação de plataforma (1.3C).
 */
export async function registerAdminBrandingRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const branding = createTenantBrandingRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminBranding = createAdminBrandingService({ tenants, branding });

  const adminGuard = [requireAuthentication, requirePlatformRole];

  app.get(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const response = await adminBranding.getByTenantId(tenantId);

      return reply.status(200).send(response);
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const body = parsePatchTenantBrandingRequestBody(request.body);
      const response = await adminBranding.update(tenantId, body);

      return reply.status(200).send(response);
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      await adminBranding.reset(tenantId);

      return reply.status(204).send();
    },
  );
}
