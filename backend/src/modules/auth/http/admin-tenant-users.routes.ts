import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createArgon2idPasswordHasher } from '../crypto/password-hasher.js';
import { createRequireAuthentication } from './require-authentication.js';
import { createRequirePlatformRole } from './require-platform-role.js';
import { toPublicUserResponse } from './to-public-user-response.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createUserCredentialRepository } from '../repositories/user-credential.repository.js';
import { createUserRepository } from '../repositories/user.repository.js';
import {
  parseCreateAdminUserRequestBody,
  parseListUsersQuery,
  parseResetPasswordRequestBody,
  parseUpdateAdminUserRequestBody,
  parseUserIdParam,
} from '../schemas/admin-user.schemas.js';
import { createAdminTenantUsersService } from '../services/admin-tenant-users.service.js';
import { buildSessionKeyPrefix } from '../session/redis-session-store.js';
import { destroySessionsForUser } from '../session/destroy-sessions-for-user.js';

/**
 * API administrativa — Usuários da Empresa (1.4C / 1.4E).
 * Prefixo: /admin/tenants/:tenantId/users — somente role USER do tenant.
 */
export async function registerAdminTenantUsersRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const environment = loadEnvironment();
  const users = createUserRepository(prisma);
  const credentials = createUserCredentialRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const sessionPrefix = buildSessionKeyPrefix(environment.nodeEnv);
  const tenantUsers = createAdminTenantUsersService({
    users,
    credentials,
    tenants,
    passwordHasher: createArgon2idPasswordHasher(),
    sessions: {
      destroyForUser: (userId) => destroySessionsForUser(app.redis, sessionPrefix, userId),
    },
  });

  app.get('/admin/tenants/:tenantId/users', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    const query = parseListUsersQuery(request.query);
    const result = await tenantUsers.list(tenantId, query);
    return reply.status(200).send({
      data: result.items.map(toPublicUserResponse),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        hasMore: result.offset + result.items.length < result.total,
      },
    });
  });

  app.post('/admin/tenants/:tenantId/users', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    const body = parseCreateAdminUserRequestBody(request.body);
    const user = await tenantUsers.create(tenantId, body);
    return reply.status(201).send(toPublicUserResponse(user));
  });

  app.get(
    '/admin/tenants/:tenantId/users/:userId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const user = await tenantUsers.getById(tenantId, userId);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/users/:userId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const body = parseUpdateAdminUserRequestBody(request.body);
      const user = await tenantUsers.update(tenantId, userId, body);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/users/:userId/block',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const user = await tenantUsers.block(tenantId, userId);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/users/:userId/unblock',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const user = await tenantUsers.unblock(tenantId, userId);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/users/:userId/disable',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const user = await tenantUsers.disable(tenantId, userId);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/users/:userId/enable',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const user = await tenantUsers.enable(tenantId, userId);
      return reply.status(200).send(toPublicUserResponse(user));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/users/:userId/reset-password',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const userId = parseUserIdParam(request.params);
      const body = parseResetPasswordRequestBody(request.body);
      const user = await tenantUsers.resetPassword(tenantId, userId, {
        password: body.password,
      });
      return reply.status(200).send({
        status: 'ok' as const,
        user: toPublicUserResponse(user),
      });
    },
  );
}
