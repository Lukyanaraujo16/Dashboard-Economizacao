import { createHash } from 'node:crypto';

import type { FileStorage } from '../../../infrastructure/storage/file-storage.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/application-error.js';
import { TenantDomainError } from '../../tenant/domain/tenant-domain-error.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { mapTenantDomainError } from '../../tenant/services/map-tenant-domain-error.js';
import {
  detectAllowedLogoMimeType,
  MAX_LOGO_BYTES,
  type AllowedLogoMimeType,
} from '../domain/logo-mime.js';
import { createTenantLogoStorageKey } from '../domain/logo-storage-key.js';
import type { UpsertTenantBrandingInput } from '../domain/types.js';
import { toPublicBrandingResponse } from '../http/to-public-branding-response.js';
import type { PublicTenantBrandingResponse } from '../http/to-public-branding-response.js';
import type { StoredFileRepository } from '../repositories/stored-file.repository.js';
import type { TenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import { withBrandingDomainError } from './map-branding-domain-error.js';

export type AdminBrandingService = {
  getByTenantId(tenantId: string): Promise<PublicTenantBrandingResponse>;
  update(tenantId: string, input: UpsertTenantBrandingInput): Promise<PublicTenantBrandingResponse>;
  reset(tenantId: string): Promise<void>;
  uploadLogo(
    tenantId: string,
    body: Buffer,
    declaredMimeType: string | undefined,
  ): Promise<PublicTenantBrandingResponse>;
  deleteLogo(tenantId: string): Promise<void>;
  collectStorageKeys(tenantId: string): Promise<readonly string[]>;
  deleteStoredObjects(keys: readonly string[]): Promise<void>;
};

async function assertTenantExists(tenants: TenantRepository, tenantId: string): Promise<void> {
  const tenant = await tenants.findById(tenantId);
  if (!tenant) {
    throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
  }
}

function withTenantNotFound<T>(operation: Promise<T>): Promise<T> {
  return operation.catch((error: unknown) => {
    if (error instanceof TenantDomainError) {
      mapTenantDomainError(error);
    }
    throw error;
  });
}

async function bestEffortDelete(storage: FileStorage, storageKey: string): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch {
    // cleanup futuro — não quebra branding já persistido
  }
}

function validateLogoPayload(
  body: Buffer,
  declaredMimeType: string | undefined,
): AllowedLogoMimeType {
  if (body.byteLength === 0) {
    throw new ValidationError('Arquivo de logo ausente.', {
      details: [{ field: 'logo', issue: 'required' }],
    });
  }

  if (body.byteLength > MAX_LOGO_BYTES) {
    throw new ValidationError('Arquivo de logo excede 2 MB.', {
      details: [{ field: 'logo', issue: 'too_large' }],
    });
  }

  const detected = detectAllowedLogoMimeType(body);
  if (!detected) {
    throw new ValidationError('Tipo de arquivo de logo não permitido.', {
      details: [{ field: 'logo', issue: 'invalid_mime' }],
    });
  }

  if (declaredMimeType && declaredMimeType !== detected) {
    throw new ValidationError('Tipo declarado do arquivo não corresponde ao conteúdo.', {
      details: [{ field: 'logo', issue: 'mime_mismatch' }],
    });
  }

  return detected;
}

export function createAdminBrandingService(deps: {
  tenants: TenantRepository;
  branding: TenantBrandingRepository;
  files: StoredFileRepository;
  storage: FileStorage;
}): AdminBrandingService {
  return {
    async getByTenantId(tenantId) {
      await withTenantNotFound(assertTenantExists(deps.tenants, tenantId));
      const record = await deps.branding.findByTenantId(tenantId);
      return toPublicBrandingResponse(tenantId, record);
    },

    async update(tenantId, input) {
      await withTenantNotFound(assertTenantExists(deps.tenants, tenantId));
      const record = await withBrandingDomainError(() => deps.branding.upsert(tenantId, input));
      return toPublicBrandingResponse(tenantId, record);
    },

    async reset(tenantId) {
      await withTenantNotFound(assertTenantExists(deps.tenants, tenantId));
      const existing = await deps.branding.findByTenantId(tenantId);
      await withBrandingDomainError(() => deps.branding.deleteByTenantId(tenantId));
      if (existing?.logoFile) {
        await deps.files.deleteById(existing.logoFile.id);
        await bestEffortDelete(deps.storage, existing.logoFile.storageKey);
      }
    },

    async uploadLogo(tenantId, body, declaredMimeType) {
      await withTenantNotFound(assertTenantExists(deps.tenants, tenantId));
      const mimeType = validateLogoPayload(body, declaredMimeType);
      const storageKey = createTenantLogoStorageKey(tenantId, mimeType);
      const checksum = createHash('sha256').update(body).digest('hex');
      const previous = await deps.branding.findByTenantId(tenantId);

      await deps.storage.put(storageKey, body);

      try {
        const file = await deps.files.create({
          tenantId,
          fileType: 'TENANT_LOGO',
          storageKey,
          mimeType,
          size: body.byteLength,
          checksum,
        });
        const record = await withBrandingDomainError(() =>
          deps.branding.setLogo(tenantId, file.id),
        );

        if (previous?.logoFile) {
          await deps.files.deleteById(previous.logoFile.id);
          await bestEffortDelete(deps.storage, previous.logoFile.storageKey);
        }

        return toPublicBrandingResponse(tenantId, record);
      } catch (error) {
        await bestEffortDelete(deps.storage, storageKey);
        throw error;
      }
    },

    async deleteLogo(tenantId) {
      await withTenantNotFound(assertTenantExists(deps.tenants, tenantId));
      const existing = await deps.branding.findByTenantId(tenantId);
      if (!existing?.logoFile) {
        return;
      }

      await withBrandingDomainError(() => deps.branding.clearLogo(tenantId));
      await deps.files.deleteById(existing.logoFile.id);
      await bestEffortDelete(deps.storage, existing.logoFile.storageKey);
    },

    async collectStorageKeys(tenantId) {
      return deps.files.listStorageKeysByTenantId(tenantId);
    },

    async deleteStoredObjects(keys) {
      for (const key of keys) {
        await bestEffortDelete(deps.storage, key);
      }
    },
  };
}

export function createPublicFileService(deps: {
  files: StoredFileRepository;
  storage: FileStorage;
}) {
  return {
    async getById(fileId: string): Promise<{ body: Buffer; mimeType: string }> {
      const file = await deps.files.findById(fileId);
      if (!file) {
        throw new NotFoundError('Arquivo não encontrado.');
      }

      try {
        const body = await deps.storage.get(file.storageKey);
        return { body, mimeType: file.mimeType };
      } catch {
        throw new NotFoundError('Arquivo não encontrado.');
      }
    },
  };
}
