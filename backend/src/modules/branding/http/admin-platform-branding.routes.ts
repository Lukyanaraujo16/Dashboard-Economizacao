import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createFileStorage } from '../../../infrastructure/storage/index.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { AUDIT_ACTIONS, createAdminAuditRecorder, fieldNamesMetadata } from '../../audit/index.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createRequirePlatformRole } from '../../auth/http/require-platform-role.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { MAX_LOGO_BYTES } from '../domain/logo-mime.js';
import { createPlatformBrandingRepository } from '../repositories/platform-branding.repository.js';
import { createStoredFileRepository } from '../repositories/stored-file.repository.js';
import { parsePatchPlatformBrandingRequestBody } from '../schemas/admin-platform-branding.schemas.js';
import { createAdminPlatformBrandingService } from '../services/admin-platform-branding.service.js';

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
  fieldName: 'logo' | 'icon' | 'favicon',
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
 * API administrativa de Branding da Plataforma (1.5C).
 * Escopo global — sem tenantId. ADMIN | SUPER_ADMIN.
 */
export async function registerAdminPlatformBrandingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_LOGO_BYTES,
      files: 1,
      fields: 0,
    },
  });

  const environment = loadEnvironment();
  const prisma = getPrismaClient();
  const branding = createPlatformBrandingRepository(prisma);
  const files = createStoredFileRepository(prisma);
  const storage = createFileStorage(environment);
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const requirePlatformRole = createRequirePlatformRole();
  const adminPlatformBranding = createAdminPlatformBrandingService({
    branding,
    files,
    storage,
  });
  const audit = createAdminAuditRecorder(prisma);

  const adminGuard = [requireAuthentication, requirePlatformRole];

  app.get('/admin/platform/branding', { preHandler: adminGuard }, async (_request, reply) => {
    const response = await adminPlatformBranding.get();
    return reply.status(200).send(response);
  });

  app.patch('/admin/platform/branding', { preHandler: adminGuard }, async (request, reply) => {
    const body = parsePatchPlatformBrandingRequestBody(request.body);
    const response = await adminPlatformBranding.update(body);
    await audit(request, {
      action: AUDIT_ACTIONS.PLATFORM_BRANDING_UPDATED,
      tenantId: null,
      targetType: 'platform_branding',
      targetId: null,
      metadata: fieldNamesMetadata(body),
    });
    return reply.status(200).send(response);
  });

  app.delete('/admin/platform/branding', { preHandler: adminGuard }, async (request, reply) => {
    await adminPlatformBranding.reset();
    await audit(request, {
      action: AUDIT_ACTIONS.PLATFORM_BRANDING_RESET,
      tenantId: null,
      targetType: 'platform_branding',
      targetId: null,
    });
    return reply.status(204).send();
  });

  app.post('/admin/platform/branding/logo', { preHandler: adminGuard }, async (request, reply) => {
    const { body, declaredMimeType } = await readNamedMultipart(request, 'logo');
    const response = await adminPlatformBranding.uploadLogo(body, declaredMimeType);
    await audit(request, {
      action: AUDIT_ACTIONS.PLATFORM_BRANDING_LOGO_UPDATED,
      tenantId: null,
      targetType: 'platform_branding',
      targetId: null,
    });
    return reply.status(200).send(response);
  });

  app.delete(
    '/admin/platform/branding/logo',
    { preHandler: adminGuard },
    async (request, reply) => {
      await adminPlatformBranding.deleteLogo();
      await audit(request, {
        action: AUDIT_ACTIONS.PLATFORM_BRANDING_LOGO_REMOVED,
        tenantId: null,
        targetType: 'platform_branding',
        targetId: null,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/admin/platform/branding/favicon',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { body, declaredMimeType } = await readNamedMultipart(request, 'favicon');
      const response = await adminPlatformBranding.uploadFavicon(body, declaredMimeType);
      await audit(request, {
        action: AUDIT_ACTIONS.PLATFORM_BRANDING_FAVICON_UPDATED,
        tenantId: null,
        targetType: 'platform_branding',
        targetId: null,
      });
      return reply.status(200).send(response);
    },
  );

  app.delete(
    '/admin/platform/branding/favicon',
    { preHandler: adminGuard },
    async (request, reply) => {
      await adminPlatformBranding.deleteFavicon();
      await audit(request, {
        action: AUDIT_ACTIONS.PLATFORM_BRANDING_FAVICON_REMOVED,
        tenantId: null,
        targetType: 'platform_branding',
        targetId: null,
      });
      return reply.status(204).send();
    },
  );

  app.post('/admin/platform/branding/icon', { preHandler: adminGuard }, async (request, reply) => {
    const { body, declaredMimeType } = await readNamedMultipart(request, 'icon');
    const response = await adminPlatformBranding.uploadIcon(body, declaredMimeType);
    await audit(request, {
      action: AUDIT_ACTIONS.PLATFORM_BRANDING_ICON_UPDATED,
      tenantId: null,
      targetType: 'platform_branding',
      targetId: null,
    });
    return reply.status(200).send(response);
  });

  app.delete(
    '/admin/platform/branding/icon',
    { preHandler: adminGuard },
    async (request, reply) => {
      await adminPlatformBranding.deleteIcon();
      await audit(request, {
        action: AUDIT_ACTIONS.PLATFORM_BRANDING_ICON_REMOVED,
        tenantId: null,
        targetType: 'platform_branding',
        targetId: null,
      });
      return reply.status(204).send();
    },
  );
}
