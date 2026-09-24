import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import {
  ForbiddenError,
  UnauthenticatedError,
} from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { resolveOperationalTenantId } from '../../dashboard/domain/operational-tenant.js';
import { assertNoTenantIdQuery } from '../../dashboard/http/assert-no-tenant-id-query.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createConsultantService } from '../services/consultant.service.js';
import {
  parseConversationIdParam,
  parseCreateConversationBody,
  parseListConversationsQuery,
  parseSendMessageBody,
} from './consultant.schemas.js';
import { createAdvisorRuntime, type AdvisorRuntime } from './create-advisor-runtime.js';

export type RegisterConsultantRoutesOptions = {
  readonly runtime?: AdvisorRuntime;
};

function requireOperationalTenant(request: FastifyRequest): {
  readonly userId: string;
  readonly tenantId: string;
} {
  const auth = request.auth;
  if (!auth) {
    throw new UnauthenticatedError();
  }

  const tenantId = resolveOperationalTenantId(auth);
  if (tenantId === null) {
    throw new ForbiddenError('Sem contexto de empresa para o Consultor.');
  }

  return { userId: auth.userId, tenantId };
}

export async function registerConsultantRoutes(
  app: FastifyInstance,
  options: RegisterConsultantRoutesOptions = {},
): Promise<void> {
  const prisma = getPrismaClient();
  const requireAuthentication = createRequireAuthentication({
    users: createUserRepository(prisma),
    tenants: createTenantRepository(prisma),
  });
  const runtime = options.runtime ?? createAdvisorRuntime({ redis: app.redis });
  const consultant = createConsultantService(runtime);

  app.get('/consultant/status', { preHandler: requireAuthentication }, async (request, reply) => {
    assertNoTenantIdQuery(request.query);
    const { tenantId } = requireOperationalTenant(request);
    const body = await consultant.getStatus(tenantId);
    return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
  });

  app.get(
    '/consultant/conversations',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const query = parseListConversationsQuery(request.query);
      const body = await consultant.listConversations(tenantId, userId, query);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.post(
    '/consultant/conversations',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const body = parseCreateConversationBody(request.body);
      const created = await consultant.createConversation(tenantId, userId, body);
      return reply.status(201).header('Cache-Control', 'private, no-store').send(created);
    },
  );

  app.get(
    '/consultant/conversations/:conversationId',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const conversationId = parseConversationIdParam(request.params);
      const body = await consultant.getConversation(tenantId, userId, conversationId);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    },
  );

  app.post(
    '/consultant/conversations/:conversationId/messages',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const conversationId = parseConversationIdParam(request.params);
      const body = parseSendMessageBody(request.body);
      const result = await consultant.sendMessage(tenantId, userId, conversationId, body);
      return reply.status(200).header('Cache-Control', 'private, no-store').send(result);
    },
  );
}
