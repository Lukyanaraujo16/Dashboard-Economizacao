import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createTenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import { createCurrentBrandingService } from '../services/current-branding.service.js';

/**
 * GET /branding/current — branding visual da sessão autenticada (1.3F).
 * Sem tenantId no client; resolução server-side por role + auth.tenantId.
 */
export async function registerCurrentBrandingRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const branding = createTenantBrandingRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const currentBranding = createCurrentBrandingService({ tenants, branding });

  app.get('/branding/current', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }

    const response = await currentBranding.getForAuthenticatedSession(auth);
    return reply.status(200).send(response);
  });
}
