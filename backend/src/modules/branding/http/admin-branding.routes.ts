import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createFileStorage } from '../../../infrastructure/storage/index.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { AUDIT_ACTIONS, createAdminAuditRecorder, fieldNamesMetadata } from '../../audit/index.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { parseTenantIdParam } from '../../tenant/schemas/admin-tenant.schemas.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { MAX_LOGO_BYTES } from '../domain/logo-mime.js';
import { parsePatchTenantBrandingRequestBody } from '../schemas/admin-branding.schemas.js';
import { createAdminBrandingService } from '../services/admin-branding.service.js';
import { createStoredFileRepository } from '../repositories/stored-file.repository.js';
import { createTenantBrandingRepository } from '../repositories/tenant-branding.repository.js';

async function readNamedMultipart(
  request: {
    file: () => Promise<
      | {
          fieldname: string;
          mimetype: string;
          toBuffer: () => Promise<Buffer>;
        }
      | undefined
    >;
  },
  fieldName: 'logo' | 'icon',
): Promise<{ body: Buffer; declaredMimeType: string }> {
  const file = await request.file();
  if (!file) {
    throw new ValidationError(`Arquivo de ${fieldName} ausente.`, {
      details: [{ field: fieldName, issue: 'required' }],
    });
  }

  if (file.fieldname !== fieldName) {
    throw new ValidationError('Campo de upload inválido.', {
      details: [{ field: file.fieldname, issue: 'unknown_field' }],
    });
  }

  const body = await file.toBuffer();
  return { body, declaredMimeType: file.mimetype };
}

/**
 * API administrativa de Branding por Empresa — operação de plataforma (1.3C/1.3D).
 */
export async function registerAdminBrandingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_LOGO_BYTES,
      files: 1,
      fields: 0,
    },
  });

  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const branding = createTenantBrandingRepository(prisma);
  const files = createStoredFileRepository(prisma);
  const storage = createFileStorage(environment);
  const users = createUserRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminBranding = createAdminBrandingService({ tenants, branding, files, storage });
  const audit = createAdminAuditRecorder(prisma);

  const adminGuard = [requireAuthentication, requirePlatformRole];

  app.get(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const response = await adminBranding.getByTenantId(tenantId);

      return reply.status(200).send(response);
    },
  );

  app.patch(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const body = parsePatchTenantBrandingRequestBody(request.body);
      const response = await adminBranding.update(tenantId, body);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_UPDATED,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
        metadata: fieldNamesMetadata(body),
      });

      return reply.status(200).send(response);
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/branding',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      await adminBranding.reset(tenantId);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_RESET,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
      });

      return reply.status(204).send();
    },
  );

  app.post(
    '/admin/tenants/:tenantId/branding/logo',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const { body, declaredMimeType } = await readNamedMultipart(request, 'logo');
      const response = await adminBranding.uploadLogo(tenantId, body, declaredMimeType);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_LOGO_UPDATED,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
      });

      return reply.status(200).send(response);
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/branding/logo',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      await adminBranding.deleteLogo(tenantId);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_LOGO_REMOVED,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
      });

      return reply.status(204).send();
    },
  );

  app.post(
    '/admin/tenants/:tenantId/branding/icon',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      const { body, declaredMimeType } = await readNamedMultipart(request, 'icon');
      const response = await adminBranding.uploadIcon(tenantId, body, declaredMimeType);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_ICON_UPDATED,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
      });

      return reply.status(200).send(response);
    },
  );

  app.delete(
    '/admin/tenants/:tenantId/branding/icon',
    { preHandler: adminGuard },
    async (request, reply) => {
      const tenantId = parseTenantIdParam(request.params);
      await adminBranding.deleteIcon(tenantId);
      await audit(request, {
        action: AUDIT_ACTIONS.TENANT_BRANDING_ICON_REMOVED,
        tenantId,
        targetType: 'tenant_branding',
        targetId: tenantId,
      });

      return reply.status(204).send();
    },
  );
}
