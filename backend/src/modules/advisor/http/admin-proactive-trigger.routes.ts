import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { ProactiveActor } from '../domain/proactive-trigger-access.js';
import type { ProactiveTriggerConfigurationRecord } from '../repositories/proactive-trigger.repository.js';
import { createProactiveTriggerRepository } from '../repositories/proactive-trigger.repository.js';
import { withAdvisorDomainError } from '../services/map-advisor-http-error.js';
import { createProactiveTriggerService } from '../services/proactive-trigger.service.js';
import {
  parseCreateProactiveTriggerRequestBody,
  parseProactiveTriggerConfigurationIdParam,
  parseSetProactiveTriggerActiveRequestBody,
  parseUpdateProactiveTriggerRequestBody,
} from './admin-proactive-trigger.schemas.js';

function actorFromRequest(request: FastifyRequest): ProactiveActor {
  const auth = request.auth;
  if (!auth) {
    throw new UnauthenticatedError();
  }

  return {
    role: auth.role,
    supportSession: auth.support.active,
  };
}

function toPublicConfiguration(record: ProactiveTriggerConfigurationRecord) {
  return {
    id: record.id,
    triggerType: record.triggerType,
    parameterKey: record.parameterKey,
    percentage: record.percentage,
    daysAhead: record.daysAhead,
    minimumAmount: record.minimumAmount,
    titleKind: record.titleKind,
    active: record.active,
  };
}

/**
 * Administração dos gatilhos proativos (F14.3).
 * Somente ADMIN | SUPER_ADMIN, fora do modo suporte.
 * Não avalia métricas nem grava ocorrência.
 */
export async function registerAdminProactiveTriggerRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const triggers = createProactiveTriggerService(createProactiveTriggerRepository(prisma));

  app.get('/admin/proactive-triggers/catalog', { preHandler: adminGuard }, async (_request, reply) => {
    return reply.status(200).send({
      types: triggers.listCertifiedTypes(),
      suggestedDefaults: triggers.suggestedDefaults(),
    });
  });

  app.get(
    '/admin/tenants/:tenantId/proactive-triggers',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const actor = actorFromRequest(request);
      const data = await withAdvisorDomainError(() => triggers.listConfigurations(actor, tenantId));
      return reply.status(200).send({ data: data.map(toPublicConfiguration) });
    },
  );

  app.post(
    '/admin/tenants/:tenantId/proactive-triggers',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const body = parseCreateProactiveTriggerRequestBody(request.body);
      const actor = actorFromRequest(request);
      const created = await withAdvisorDomainError(() =>
        triggers.createConfiguration(actor, tenantId, body.triggerType, body.parameters),
      );
      return reply.status(201).send(toPublicConfiguration(created));
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/proactive-triggers/:configurationId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const configurationId = parseProactiveTriggerConfigurationIdParam(request.params);
      const body = parseUpdateProactiveTriggerRequestBody(request.body);
      const actor = actorFromRequest(request);
      const updated = await withAdvisorDomainError(() =>
        triggers.updateConfiguration(actor, tenantId, configurationId, body.parameters),
      );
      return reply.status(200).send(toPublicConfiguration(updated));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/proactive-triggers/:configurationId/active',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const configurationId = parseProactiveTriggerConfigurationIdParam(request.params);
      const body = parseSetProactiveTriggerActiveRequestBody(request.body);
      const actor = actorFromRequest(request);
      const updated = await withAdvisorDomainError(() =>
        triggers.setConfigurationActive(actor, tenantId, configurationId, body.active),
      );
      return reply.status(200).send(toPublicConfiguration(updated));
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/proactive-triggers/:configurationId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const configurationId = parseProactiveTriggerConfigurationIdParam(request.params);
      const actor = actorFromRequest(request);
      await withAdvisorDomainError(() =>
        triggers.deleteConfiguration(actor, tenantId, configurationId),
      );
      return reply.status(204).send();
    },
  );
}
