import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createSupportSessionRepository } from '../repositories/support-session.repository.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { parseEnterSupportRequestBody } from '../schemas/support.schemas.js';
import { createSupportModeService } from '../services/support-mode.service.js';
import { toAuthMeResponse } from './public-authenticated-user.js';
import { createRequireAuthentication } from './require-authentication.js';
import { createRequirePlatformOperator } from './require-platform-role.js';

function readUserAgent(header: string | string[] | undefined): string | null {
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return Array.isArray(header) && header[0] ? header[0] : null;
}

export async function registerSupportRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const supportSessions = createSupportSessionRepository(prisma);
  const supportMode = createSupportModeService({ tenants, supportSessions });
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformOperator = createRequirePlatformOperator();
  const guards = [requireAuthentication, requirePlatformOperator];

  app.post('/auth/support/enter', { preHandler: guards }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    const user = await users.findById(auth.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError();
    }

    const body = parseEnterSupportRequestBody(request.body);
    const support = await supportMode.enter(request.session, auth, body.tenantId, {
      ip: request.ip ?? null,
      userAgent: readUserAgent(request.headers['user-agent']),
    });
    return reply.status(200).send(toAuthMeResponse(user, support));
  });

  app.post('/auth/support/exit', { preHandler: guards }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    const user = await users.findById(auth.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError();
    }

    await supportMode.exit(request.session);
    return reply.status(200).send(toAuthMeResponse(user, { active: false }));
  });
}
