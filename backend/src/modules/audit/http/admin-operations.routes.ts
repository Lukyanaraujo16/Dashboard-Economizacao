import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import {
  parseAiRunListQuery,
  parseAuditLogListQuery,
  parseOperationsPageQuery,
  parseSyncRunListQuery,
} from './admin-operations.schemas.js';
import { createAdminOperationsService } from '../services/admin-operations.service.js';

function paginationOf(result: { limit: number; offset: number; total: number; items: readonly unknown[] }) {
  return {
    limit: result.limit,
    offset: result.offset,
    total: result.total,
    hasMore: result.offset + result.items.length < result.total,
  };
}

/**
 * Leitura administrativa de operação (Fase 17).
 * ADMIN e SUPER_ADMIN, fora do modo suporte.
 */
export async function registerAdminOperationsRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const operations = createAdminOperationsService(prisma);

  app.get('/admin/operations/sync-runs', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseSyncRunListQuery(request.query);
    const result = await operations.listSyncRuns(query);
    return reply.status(200).send({ data: result.items, pagination: paginationOf(result) });
  });

  app.get('/admin/operations/failures', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseOperationsPageQuery(request.query);
    const result = await operations.listFailures(query);
    return reply.status(200).send({ data: result.items, pagination: paginationOf(result) });
  });

  app.get('/admin/operations/health', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseOperationsPageQuery(request.query);
    const result = await operations.listHealth(query);
    return reply.status(200).send({ data: result.items, pagination: paginationOf(result) });
  });

  app.get('/admin/operations/ai-runs', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseAiRunListQuery(request.query);
    const result = await operations.listAiRuns(query);
    return reply.status(200).send({ data: result.items, pagination: paginationOf(result) });
  });

  app.get('/admin/operations/audit-logs', { preHandler: adminGuard }, async (request, reply) => {
    const query = parseAuditLogListQuery(request.query);
    const result = await operations.listAuditLogs(query);
    return reply.status(200).send({ data: result.items, pagination: paginationOf(result) });
  });
}
