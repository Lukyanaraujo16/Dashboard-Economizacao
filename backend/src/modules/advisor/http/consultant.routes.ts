import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { isPlatformRole } from '../../auth/domain/types.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import { resolveOperationalTenantId } from '../../dashboard/domain/operational-tenant.js';
import type { AdvisorConversationActor } from '../repositories/advisor-conversation.repository.js';
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
import { createAdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import { createProactiveInsightRepository } from '../repositories/proactive-insight.repository.js';
import { createProactiveTriggerRepository } from '../repositories/proactive-trigger.repository.js';
import { createProactiveInsightDelivery } from '../services/proactive-insight-delivery.service.js';

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

/**
 * Operador de suporte só quando a sessão do servidor já aponta para este tenant.
 * Papel de plataforma fora do suporte não recebe este ator.
 */
function resolveConversationActor(
  auth: AuthenticatedRequestContext,
  tenantId: string,
): AdvisorConversationActor {
  if (
    auth.support.active &&
    auth.support.tenantId === tenantId &&
    isPlatformRole(auth.role)
  ) {
    return 'support-operator';
  }
  return 'tenant-member';
}

function parsePresentBody(body: unknown): { readonly conversationId: string | null } {
  if (body === undefined || body === null) {
    return { conversationId: null };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo inválido.');
  }
  const record = body as Record<string, unknown>;
  if ('tenantId' in record) {
    throw new ValidationError('O tenant não vem no corpo da requisição.');
  }
  if (record.conversationId === undefined || record.conversationId === null) {
    return { conversationId: null };
  }
  if (typeof record.conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.conversationId)) {
    throw new ValidationError('Conversa inválida.');
  }
  return { conversationId: record.conversationId };
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
  const conversations = createAdvisorConversationRepository(prisma);
  const delivery = createProactiveInsightDelivery({
    insights: createProactiveInsightRepository(prisma),
    conversations,
    reads: createProactiveTriggerRepository(prisma),
  });

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
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      const { tenantId, userId } = requireOperationalTenant(request);
      const body = parseCreateConversationBody(request.body);
      const created = await consultant.createConversation(
        tenantId,
        userId,
        body,
        resolveConversationActor(auth, tenantId),
      );
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

  app.delete(
    '/consultant/conversations/:conversationId',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const conversationId = parseConversationIdParam(request.params);
      await consultant.deleteConversation(tenantId, userId, conversationId);
      return reply.status(204).header('Cache-Control', 'private, no-store').send();
    },
  );

  app.get(
    '/consultant/proactive-insights/unread',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      const { tenantId, userId } = requireOperationalTenant(request);
      const actor = resolveConversationActor(auth, tenantId);
      if (actor === 'support-operator') {
        return reply
          .status(200)
          .header('Cache-Control', 'private, no-store')
          .send({ count: 0, insightIds: [] });
      }
      const items = await delivery.listEligible({ tenantId, userId });
      return reply.status(200).header('Cache-Control', 'private, no-store').send({
        count: items.length,
        insightIds: items.map((item) => item.id),
      });
    },
  );

  app.get(
    '/consultant/proactive-insights',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const { tenantId, userId } = requireOperationalTenant(request);
      const items = await delivery.listEligible({ tenantId, userId });
      return reply.status(200).header('Cache-Control', 'private, no-store').send({
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          detectedAt: item.detectedAt.toISOString(),
        })),
      });
    },
  );

  app.post(
    '/consultant/proactive-insights/present',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      assertNoTenantIdQuery(request.query);
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      const { tenantId, userId } = requireOperationalTenant(request);
      const body = parsePresentBody(request.body);
      const presented = await delivery.present({
        tenantId,
        userId,
        actor: resolveConversationActor(auth, tenantId),
        conversationId: body.conversationId,
      });
      if (!presented.conversation) {
        return reply.status(200).header('Cache-Control', 'private, no-store').send({ conversation: null });
      }
      const messages = await conversations.listMessages(tenantId, presented.conversation.id);
      return reply.status(200).header('Cache-Control', 'private, no-store').send({
        conversation: {
          id: presented.conversation.id,
          title: presented.conversation.title,
          status: presented.conversation.status,
          startedAt: presented.conversation.startedAt.toISOString(),
          lastMessageAt: presented.conversation.lastMessageAt.toISOString(),
          messages: messages.map((message) => ({
            id: message.id,
            senderType: message.senderType,
            content: message.content,
            createdAt: message.createdAt.toISOString(),
          })),
        },
      });
    },
  );
}
