import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createAdvisorKnowledgeRepository } from '../repositories/advisor-knowledge.repository.js';
import { createAdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import { createAdminConsultantService } from '../services/admin-consultant.service.js';
import {
  parseCreateAdminKnowledgeRequestBody,
  parseKnowledgeEntryIdParam,
  parsePutAdminConsultantRequestBody,
  parseUpdateAdminKnowledgeRequestBody,
} from './admin-consultant.schemas.js';

/**
 * API administrativa do Consultor (F13.4).
 * Configuração e conhecimento por tenant — somente ADMIN | SUPER_ADMIN.
 */
export async function registerAdminConsultantRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const adminConsultant = createAdminConsultantService({
    tenants,
    settings: createAdvisorSettingsRepository(prisma),
    knowledge: createAdvisorKnowledgeRepository(prisma),
  });

  app.get('/admin/consultant/options', { preHandler: adminGuard }, async (_request, reply) => {
    return reply.status(200).send(adminConsultant.listOptions());
  });

  app.get('/admin/tenants/:tenantId/consultant', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    return reply.status(200).send(await adminConsultant.getSettings(tenantId));
  });

  app.put('/admin/tenants/:tenantId/consultant', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    const body = parsePutAdminConsultantRequestBody(request.body);
    return reply.status(200).send(await adminConsultant.upsertSettings(tenantId, body));
  });

  app.get(
    '/admin/tenants/:tenantId/consultant/knowledge',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const data = await adminConsultant.listKnowledge(tenantId);
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/admin/tenants/:tenantId/consultant/knowledge',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const body = parseCreateAdminKnowledgeRequestBody(request.body);
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      return reply
        .status(201)
        .send(await adminConsultant.createKnowledge(tenantId, body, auth.userId));
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/consultant/knowledge/:entryId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const entryId = parseKnowledgeEntryIdParam(request.params);
      const body = parseUpdateAdminKnowledgeRequestBody(request.body);
      return reply.status(200).send(await adminConsultant.updateKnowledge(tenantId, entryId, body));
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/consultant/knowledge/:entryId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const entryId = parseKnowledgeEntryIdParam(request.params);
      await adminConsultant.deleteKnowledge(tenantId, entryId);
      return reply.status(204).send();
    },
  );
}
