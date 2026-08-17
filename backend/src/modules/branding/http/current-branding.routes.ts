import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createPlatformBrandingRepository } from '../repositories/platform-branding.repository.js';
import { createTenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import { createCurrentBrandingService } from '../services/current-branding.service.js';

/**
 * Runtime de branding (1.3F + 1.5E):
 * - GET /branding/platform — público (login)
 * - GET /branding/current — autenticado
 */
export async function registerCurrentBrandingRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const branding = createTenantBrandingRepository(prisma);
  const platformBranding = createPlatformBrandingRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const currentBranding = createCurrentBrandingService({
    tenants,
    branding,
    platformBranding,
  });

  app.get('/branding/platform', async (_request, reply) => {
    const response = await currentBranding.getPlatformPublic();
    return reply.status(200).send(response);
  });

  app.get('/branding/current', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }

    const response = await currentBranding.getForAuthenticatedSession(auth);
    return reply.status(200).send(response);
  });
}
