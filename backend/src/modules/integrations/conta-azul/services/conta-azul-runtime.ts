import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../../config/env.js';
import { createBullmqRedisOptions } from '../../../../infrastructure/jobs/bullmq-connection.js';
import { createContaAzulManualSyncPublisher } from '../../../../infrastructure/jobs/conta-azul-manual-sync.queue.js';
import { getPrismaClient } from '../../../../infrastructure/database/prisma.js';
import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';
import { createTenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import { createContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from '../connector/conta-azul-token-client.js';
import { createContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from '../repositories/sync-run.repository.js';
import {
  createContaAzulIdentityService,
  type ContaAzulIdentityService,
} from './conta-azul-identity.service.js';
import {
  createContaAzulOAuthService,
  type ContaAzulOAuthService,
} from './conta-azul-oauth.service.js';
import { createContaAzulOAuthStateStore } from './oauth-state.store.js';
import {
  createContaAzulSyncService,
  type ContaAzulSyncService,
} from './conta-azul-sync.service.js';

export type ContaAzulRuntime = {
  readonly configured: boolean;
  readonly oauth: ContaAzulOAuthService;
  readonly identity: ContaAzulIdentityService;
  readonly sync: ContaAzulSyncService;
};

export function createContaAzulRuntime(app: FastifyInstance): ContaAzulRuntime {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const integrations = createContaAzulIntegrationRepository(prisma);
  const syncRuns = createContaAzulSyncRunRepository(prisma);
  const contaAzul = environment.contaAzul;
  const configured = Boolean(contaAzul);
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

  const apiClient = createContaAzulApiClient();
  const identityRef: { service: ContaAzulIdentityService | null } = { service: null };
  const syncRef: { service: ContaAzulSyncService | null } = { service: null };

  const publisher = createContaAzulManualSyncPublisher({
    connection: createBullmqRedisOptions(environment.redisUrl),
    nodeEnv: environment.nodeEnv,
  });
  app.addHook('onClose', async () => {
    await publisher.close();
  });

  const oauth = createContaAzulOAuthService({
    tenants,
    integrations,
    stateStore: createContaAzulOAuthStateStore(app.redis, environment.nodeEnv),
    tokenClient,
    contaAzul: contaAzul ?? {
      clientId: 'unconfigured',
      clientSecret: 'unconfigured',
      redirectUri: 'http://127.0.0.1:3000/integrations/conta-azul/callback',
    },
    encryptionKey: environment.integrationEncryptionKey,
    identifyConnectedAccount: async (tenantId) => {
      const service = identityRef.service;
      if (!service) {
        return;
      }
      await service.identify(tenantId, 'callback');
    },
    assertCanDisconnect: async (tenantId) => {
      const service = syncRef.service;
      if (!service) {
        return;
      }
      await service.assertCanDisconnect(tenantId);
    },
  });

  const identity = createContaAzulIdentityService({
    integrations,
    apiClient,
    getValidAccessToken: (tenantId) => oauth.getValidAccessToken(tenantId),
  });
  identityRef.service = identity;

  const sync = createContaAzulSyncService({
    tenants,
    integrations,
    syncRuns,
    publisher,
  });
  syncRef.service = sync;

  return { configured, oauth, identity, sync };
}
