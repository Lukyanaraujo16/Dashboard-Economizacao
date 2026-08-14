import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import {
  parseCreateTenantRequestBody,
  parseListTenantsQuery,
  parseTenantIdParam,
  parseUpdateTenantRequestBody,
} from '../schemas/admin-tenant.schemas.js';
import { createAdminTenantService } from '../services/admin-tenant.service.js';
import { createTenantRepository } from '../repositories/tenant.repository.js';
import { toPublicTenantResponse } from './to-public-tenant-response.js';

/**
 * API administrativa de Empresas (Tenants) — operação de plataforma (1.2C).
 */
export async function registerAdminTenantRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminTenants = createAdminTenantService({ tenants });

  const adminGuard = [requireAuthentication, requirePlatformRole];

  app.get('/admin/tenants', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseListTenantsQuery(request.query);
    const result = await adminTenants.list(query);

    return reply.status(200).send({
      data: result.items.map(toPublicTenantResponse),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        hasMore: result.offset + result.items.length < result.total,
      },
    });
  });

  app.post('/admin/tenants', { preHandler: adminGuard }, async (request, reply) => {
    const body = parseCreateTenantRequestBody(request.body);
    const tenant = await adminTenants.create(body);

    return reply.status(201).send(toPublicTenantResponse(tenant));
  });

  app.get('/admin/tenants/:tenantId', { preHandler: adminGuard }, async (request, reply) => {
    const { tenantId } = { tenantId: parseTenantIdParam(request.params) };
    const tenant = await adminTenants.getById(tenantId);

    return reply.status(200).send(toPublicTenantResponse(tenant));
  });

  app.patch('/admin/tenants/:tenantId', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    const body = parseUpdateTenantRequestBody(request.body);
    const tenant = await adminTenants.update(tenantId, body);

    return reply.status(200).send(toPublicTenantResponse(tenant));
  });

  app.post(
    '/admin/tenants/:tenantId/disable',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const tenant = await adminTenants.disable(tenantId);

      return reply.status(200).send(toPublicTenantResponse(tenant));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/reactivate',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const tenant = await adminTenants.reactivate(tenantId);

      return reply.status(200).send(toPublicTenantResponse(tenant));
    },
  );

  app.delete('/admin/tenants/:tenantId', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    await adminTenants.delete(tenantId);

    return reply.status(204).send();
  });
}
