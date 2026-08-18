import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../../config/env.js';
import { getPrismaClient } from '../../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../../auth/http/require-authentication.js';
import { createUserRepository } from '../../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import { parseCallbackQuery } from '../schemas/conta-azul.schemas.js';
import { createContaAzulRuntime } from '../services/conta-azul-runtime.js';
import { buildContaAzulReturnUrl } from './conta-azul-return-url.js';

export async function registerContaAzulCallbackRoutes(app: FastifyInstance): Promise<void> {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const { oauth } = createContaAzulRuntime(app);

  app.get('/integrations/conta-azul/callback', async (request, reply) => {
    const query = parseCallbackQuery(request.query);
    let auth = null;
    try {
      await requireAuthentication.call(app, request, reply);
      auth = request.auth ?? null;
    } catch (error) {
      if (!(error instanceof UnauthenticatedError)) {
        throw error;
      }
    }

    const result = await oauth.handleCallback({
      code: query.code,
      state: query.state,
      oauthError: query.oauthError,
      auth,
    });

    if (result.signal === 'connected') {
      request.log.info({ tenantId: result.tenantId }, 'conta_azul_oauth_connected');
    } else {
      request.log.info(
        { tenantId: result.tenantId, signal: result.signal },
        'conta_azul_oauth_callback_rejected',
      );
    }

    const location = buildContaAzulReturnUrl(environment.appUrl, result.tenantId, result.signal);
    return reply.redirect(location);
  });
}
