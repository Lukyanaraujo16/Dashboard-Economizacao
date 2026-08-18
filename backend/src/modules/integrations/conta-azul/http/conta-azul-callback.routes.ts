import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../../config/env.js';
import { getPrismaClient } from '../../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../../auth/http/require-authentication.js';
import { createUserRepository } from '../../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import { createContaAzulTokenClient } from '../connector/conta-azul-token-client.js';
import { parseCallbackQuery } from '../schemas/conta-azul.schemas.js';
import { createContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import { createContaAzulOAuthService } from '../services/conta-azul-oauth.service.js';
import { createContaAzulOAuthStateStore } from '../services/oauth-state.store.js';
import { buildContaAzulReturnUrl } from './conta-azul-return-url.js';

export async function registerContaAzulCallbackRoutes(app: FastifyInstance): Promise<void> {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const contaAzul = environment.contaAzul;
  const tokenClient = contaAzul
    ? createContaAzulTokenClient({
        clientId: contaAzul.clientId,
        clientSecret: contaAzul.clientSecret,
      })
    : {
        exchangeAuthorizationCode: async () => {
          throw new Error('unconfigured');
        },
        refresh: async () => {
          throw new Error('unconfigured');
        },
      };

  const oauth = createContaAzulOAuthService({
    tenants,
    integrations: createContaAzulIntegrationRepository(prisma),
    stateStore: createContaAzulOAuthStateStore(app.redis, environment.nodeEnv),
    tokenClient,
    contaAzul: contaAzul ?? {
      clientId: 'unconfigured',
      clientSecret: 'unconfigured',
      redirectUri: 'http://127.0.0.1:3000/integrations/conta-azul/callback',
    },
    encryptionKey: environment.integrationEncryptionKey,
  });

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
