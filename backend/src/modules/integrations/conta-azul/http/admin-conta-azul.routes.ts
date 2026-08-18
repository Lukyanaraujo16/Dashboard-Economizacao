import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../../config/env.js';
import { getPrismaClient } from '../../../../infrastructure/database/prisma.js';
import {
  IntegrationUnavailableError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import { parseTenantIdParam } from '../schemas/conta-azul.schemas.js';
import { createContaAzulRuntime } from '../services/conta-azul-runtime.js';

export async function registerAdminContaAzulRoutes(app: FastifyInstance): Promise<void> {
  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const { configured, oauth, identity, sync } = createContaAzulRuntime(app);

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
      if (!configured) {
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
    '/admin/tenants/:tenantId/integrations/conta-azul/verify',
    { preHandler: adminGuard },
    async (request, reply) => {
      if (!configured) {
        throw new IntegrationUnavailableError(
          'Integração Conta Azul não configurada neste ambiente.',
        );
      }
      if (!environment.integrationEncryptionKey) {
        throw new IntegrationUnavailableError(
          'Cifração de integrações não configurada neste ambiente.',
        );
      }
      const tenantId = parseTenantIdParam(request.params);
      const tenant = await tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      if (tenant.status !== 'ACTIVE') {
        throw new ValidationError('Empresa inativa não pode verificar a Conta Azul.');
      }
      const status = await identity.identify(tenantId, 'verify');
      request.log.info(
        { tenantId, actorUserId: request.auth?.userId, integrationStatus: status.status },
        'conta_azul_identity_verified',
      );
      return reply.status(200).send(status);
    },
  );

  app.post(
    '/admin/tenants/:tenantId/integrations/conta-azul/sync',
    { preHandler: adminGuard },
    async (request, reply) => {
      if (!configured) {
        throw new IntegrationUnavailableError(
          'Integração Conta Azul não configurada neste ambiente.',
        );
      }
      if (!environment.integrationEncryptionKey) {
        throw new IntegrationUnavailableError(
          'Cifração de integrações não configurada neste ambiente.',
        );
      }
      const tenantId = parseTenantIdParam(request.params);
      const accepted = await sync.start(tenantId, request.auth!);
      request.log.info(
        { tenantId, actorUserId: request.auth?.userId, syncRunId: accepted.syncRunId },
        'conta_azul_manual_sync_accepted',
      );
      return reply.status(202).send(accepted);
    },
  );

  app.get(
    '/admin/tenants/:tenantId/integrations/conta-azul/sync/current',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const current = await sync.current(tenantId);
      return reply.status(200).send({ run: current });
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
