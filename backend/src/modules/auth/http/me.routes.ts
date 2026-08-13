import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createRequireAuthentication } from './require-authentication.js';
import { toPublicAuthenticatedUser } from './public-authenticated-user.js';

/**
 * GET /auth/me — identidade pública da sessão atual (1.1F-E.3).
 * Protegido por requireAuthentication; sliding inactivity aplicado pelo guard.
 */
export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  const users = createUserRepository(getPrismaClient());
  const requireAuthentication = createRequireAuthentication({ users });

  app.get('/auth/me', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }

    const user = await users.findById(auth.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError();
    }

    if (user.role !== auth.role || user.tenantId !== auth.tenantId) {
      throw new UnauthenticatedError();
    }

    return reply.status(200).send({
      user: toPublicAuthenticatedUser(user),
    });
  });
}
