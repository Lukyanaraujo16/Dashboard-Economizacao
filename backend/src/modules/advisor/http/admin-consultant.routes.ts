import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import {
  IntegrationUnavailableError,
  UnauthenticatedError,
} from '../../../shared/errors/application-error.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { createAdvisorKnowledgeRepository } from '../repositories/advisor-knowledge.repository.js';
import { createAdvisorPlatformCredentialRepository } from '../repositories/advisor-platform-credential.repository.js';
import { createAdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import { createAdminConsultantProvidersService } from '../services/admin-consultant-providers.service.js';
import { createResolveProviderApiKey } from './create-advisor-runtime.js';
import { createAdminConsultantService } from '../services/admin-consultant.service.js';
import {
  parseCreateAdminKnowledgeRequestBody,
  parseKnowledgeEntryIdParam,
  parseProviderParam,
  parsePutAdminConsultantRequestBody,
  parsePutAdminProviderCredentialBody,
  parseUpdateAdminKnowledgeRequestBody,
} from './admin-consultant.schemas.js';

/**
 * API administrativa do Consultor (F13.4).
 * Configuração e conhecimento por tenant — somente ADMIN | SUPER_ADMIN.
 */
export async function registerAdminConsultantRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminGuard = [requireAuthentication, requirePlatformRole];
  const environment = loadEnvironment();
  const encryptionKey = environment.integrationEncryptionKey;
  const platformCredentials = createAdvisorPlatformCredentialRepository(prisma);
  const resolveProviderApiKey = createResolveProviderApiKey({
    findEncryptedSecret: async (provider) => {
      const stored = await platformCredentials.findByProvider(provider);
      return stored?.encryptedSecret ?? null;
    },
    encryptionKey,
    envOpenAi: environment.openaiApiKey,
    envAnthropic: environment.anthropicApiKey,
  });
  const adminConsultant = createAdminConsultantService({
    tenants,
    settings: createAdvisorSettingsRepository(prisma),
    knowledge: createAdvisorKnowledgeRepository(prisma),
    nodeEnv: environment.nodeEnv,
    resolveProviderApiKey,
  });
  const adminProviders = createAdminConsultantProvidersService({
    credentials: createAdvisorPlatformCredentialRepository(prisma),
    encryptionKey,
    envOpenAi: environment.openaiApiKey,
    envAnthropic: environment.anthropicApiKey,
  });

  app.get('/admin/consultant/options', { preHandler: adminGuard }, async (_request, reply) => {
    return reply.status(200).send(adminConsultant.listOptions());
  });

  app.get('/admin/consultant/providers', { preHandler: adminGuard }, async (_request, reply) => {
    return reply.status(200).send({ data: await adminProviders.listProviders() });
  });

  app.put(
    '/admin/consultant/providers/:provider/credential',
    { preHandler: adminGuard },
    async (request, reply) => {
      if (encryptionKey === null) {
        throw new IntegrationUnavailableError(
          'Criptografia de credenciais da plataforma está indisponível.',
        );
      }
      const provider = parseProviderParam(request.params);
      const body = parsePutAdminProviderCredentialBody(request.body);
      return reply.status(200).send(await adminProviders.upsertCredential(provider, body.credential));
    },
  );

  app.delete(
    '/admin/consultant/providers/:provider/credential',
    { preHandler: adminGuard },
    async (request, reply) => {
      const provider = parseProviderParam(request.params);
      return reply.status(200).send(await adminProviders.deleteCredential(provider));
    },
  );

  app.get('/admin/tenants/:tenantId/consultant', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    return reply.status(200).send(await adminConsultant.getSettings(tenantId));
  });

  app.put('/admin/tenants/:tenantId/consultant', { preHandler: adminGuard }, async (request, reply) => {
    const tenantId = parseTenantIdParam(request.params);
    const body = parsePutAdminConsultantRequestBody(request.body);
    return reply.status(200).send(await adminConsultant.upsertSettings(tenantId, body));
  });

  app.get(
    '/admin/tenants/:tenantId/consultant/knowledge',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const data = await adminConsultant.listKnowledge(tenantId);
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/admin/tenants/:tenantId/consultant/knowledge',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const body = parseCreateAdminKnowledgeRequestBody(request.body);
      const auth = request.auth;
      if (!auth) {
        throw new UnauthenticatedError();
      }
      return reply
        .status(201)
        .send(await adminConsultant.createKnowledge(tenantId, body, auth.userId));
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/consultant/knowledge/:entryId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const entryId = parseKnowledgeEntryIdParam(request.params);
      const body = parseUpdateAdminKnowledgeRequestBody(request.body);
      return reply.status(200).send(await adminConsultant.updateKnowledge(tenantId, entryId, body));
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/consultant/knowledge/:entryId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const entryId = parseKnowledgeEntryIdParam(request.params);
      await adminConsultant.deleteKnowledge(tenantId, entryId);
      return reply.status(204).send();
    },
  );
}
