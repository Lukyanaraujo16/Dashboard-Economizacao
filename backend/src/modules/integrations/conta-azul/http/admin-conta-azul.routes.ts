import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../../config/env.js';
import { getPrismaClient } from '../../../../infrastructure/database/prisma.js';
import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import { createContaAzulTokenClient } from '../connector/conta-azul-token-client.js';
import { parseTenantIdParam } from '../schemas/conta-azul.schemas.js';
import { createContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import { createContaAzulOAuthService } from '../services/conta-azul-oauth.service.js';
import { createContaAzulOAuthStateStore } from '../services/oauth-state.store.js';

export async function registerAdminContaAzulRoutes(app: FastifyInstance): Promise<void> {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];

  const contaAzul = environment.contaAzul;
  const tokenClient = contaAzul
    ? createContaAzulTokenClient({
        clientId: contaAzul.clientId,
        clientSecret: contaAzul.clientSecret,
      })
    : {
        exchangeAuthorizationCode: async () => {
          throw new IntegrationUnavailableError('Integração Conta Azul não configurada.');
        },
        refresh: async () => {
          throw new IntegrationUnavailableError('Integração Conta Azul não configurada.');
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

  app.get(
    '/admin/tenants/:tenantId/integrations/conta-azul',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      return reply.status(200).send(await oauth.getStatus(tenantId));
    },
  );

  app.post(
    '/admin/tenants/:tenantId/integrations/conta-azul/connect',
    { preHandler: adminGuard },
    async (request, reply) => {
      if (!contaAzul) {
        throw new IntegrationUnavailableError(
          'Integração Conta Azul não configurada neste ambiente.',
        );
      }
      const tenantId = parseTenantIdParam(request.params);
      const result = await oauth.startConnect(tenantId, request.auth!);
      request.log.info(
        { tenantId, actorUserId: request.auth?.userId },
        'conta_azul_oauth_connect_started',
      );
      return reply.status(200).send(result);
    },
  );

  app.post(
    '/admin/tenants/:tenantId/integrations/conta-azul/disconnect',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const status = await oauth.disconnect(tenantId);
      request.log.info(
        { tenantId, actorUserId: request.auth?.userId },
        'conta_azul_oauth_disconnected',
      );
      return reply.status(200).send(status);
    },
  );
}
