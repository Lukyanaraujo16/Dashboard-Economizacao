import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createRequireAuthentication } from './require-authentication.js';

/**
 * Rotas exclusivas de NODE_ENV=test para exercitar requireAuthentication (1.1E).
 * Não existem em produção.
 */
export async function registerProtectedTestRoutes(app: FastifyInstance): Promise<void> {
  const users = createUserRepository(getPrismaClient());
  const requireAuthentication = createRequireAuthentication({ users });

  app.get('/__test__/protected', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      // Invariante do guard; não deve ocorrer.
      throw new Error('request.auth ausente após requireAuthentication.');
    }

    return reply.status(200).send({
      authenticated: true as const,
      userId: auth.userId,
      tenantId: auth.tenantId,
      role: auth.role,
      sessionId: auth.sessionId,
      createdAt: auth.createdAt,
      lastAccess: auth.lastAccess,
      ip: auth.ip,
      userAgent: auth.userAgent,
    });
  });
}
