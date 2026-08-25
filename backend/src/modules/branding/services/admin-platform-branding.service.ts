import { createHash } from 'node:crypto';

import type { FileStorage } from '../../../infrastructure/storage/file-storage.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  detectAllowedLogoMimeType,
  MAX_FAVICON_BYTES,
  MAX_LOGO_BYTES,
  type AllowedLogoMimeType,
} from '../domain/logo-mime.js';
import {
  createPlatformFaviconStorageKey,
  createPlatformIconStorageKey,
  createPlatformLogoStorageKey,
} from '../domain/logo-storage-key.js';
import type { UpsertPlatformBrandingInput } from '../domain/types.js';
import { PLATFORM_BRAND_NAME } from '../http/to-current-branding-response.js';
import {
  toPublicPlatformBrandingResponse,
  type PublicPlatformBrandingResponse,
} from '../http/to-public-platform-branding-response.js';
import type { PlatformBrandingRepository } from '../repositories/platform-branding.repository.js';
import type { StoredFileRepository } from '../repositories/stored-file.repository.js';
import { withBrandingDomainError } from './map-branding-domain-error.js';

async function bestEffortDelete(storage: FileStorage, storageKey: string): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch {
    // cleanup futuro — não quebra branding já persistido
  }
}

function validateImagePayload(
  body: Buffer,
  declaredMimeType: string | undefined,
  options: {
    readonly field: 'logo' | 'icon' | 'favicon';
    readonly maxBytes: number;
    readonly maxLabel: string;
  },
): AllowedLogoMimeType {
  if (body.byteLength === 0) {
    throw new ValidationError(`Arquivo de ${options.field} ausente.`, {
      details: [{ field: options.field, issue: 'required' }],
    });
  }

  if (body.byteLength > options.maxBytes) {
    throw new ValidationError(`Arquivo de ${options.field} excede ${options.maxLabel}.`, {
      details: [{ field: options.field, issue: 'too_large' }],
    });
  }

  const detected = detectAllowedLogoMimeType(body);
  if (!detected) {
    throw new ValidationError(`Tipo de arquivo de ${options.field} não permitido.`, {
      details: [{ field: options.field, issue: 'invalid_mime' }],
    });
  }

  if (declaredMimeType && declaredMimeType !== detected) {
    throw new ValidationError('Tipo declarado do arquivo não corresponde ao conteúdo.', {
      details: [{ field: options.field, issue: 'mime_mismatch' }],
    });
  }

  return detected;
}

async function ensurePlatformBranding(branding: PlatformBrandingRepository): Promise<void> {
  const existing = await branding.get();
  if (!existing) {
    await withBrandingDomainError(() => branding.upsert({ name: PLATFORM_BRAND_NAME }));
  }
}

export type AdminPlatformBrandingService = {
  get(): Promise<PublicPlatformBrandingResponse>;
  update(input: UpsertPlatformBrandingInput): Promise<PublicPlatformBrandingResponse>;
  reset(): Promise<void>;
  uploadLogo(
    body: Buffer,
    declaredMimeType: string | undefined,
  ): Promise<PublicPlatformBrandingResponse>;
  deleteLogo(): Promise<void>;
  uploadFavicon(
    body: Buffer,
    declaredMimeType: string | undefined,
  ): Promise<PublicPlatformBrandingResponse>;
  deleteFavicon(): Promise<void>;
  uploadIcon(
    body: Buffer,
    declaredMimeType: string | undefined,
  ): Promise<PublicPlatformBrandingResponse>;
  deleteIcon(): Promise<void>;
};

/**
 * API administrativa de Platform Branding (1.5C).
 * Lifecycle de assets espelha tenant branding: put → DB → cleanup antigo; falha DB → compensação.
 */
export function createAdminPlatformBrandingService(deps: {
  branding: PlatformBrandingRepository;
  files: StoredFileRepository;
  storage: FileStorage;
}): AdminPlatformBrandingService {
  return {
    async get() {
      const record = await deps.branding.get();
      return toPublicPlatformBrandingResponse(record);
    },

    async update(input) {
      const record = await withBrandingDomainError(() => deps.branding.upsert(input));
      return toPublicPlatformBrandingResponse(record);
    },

    async reset() {
      const existing = await deps.branding.get();
      await withBrandingDomainError(() => deps.branding.reset());

      if (existing?.logoFile) {
        await deps.files.deleteById(existing.logoFile.id);
        await bestEffortDelete(deps.storage, existing.logoFile.storageKey);
      }
      if (existing?.faviconFile) {
        await deps.files.deleteById(existing.faviconFile.id);
        await bestEffortDelete(deps.storage, existing.faviconFile.storageKey);
      }
      if (existing?.iconFile) {
        await deps.files.deleteById(existing.iconFile.id);
        await bestEffortDelete(deps.storage, existing.iconFile.storageKey);
      }
    },

    async uploadLogo(body, declaredMimeType) {
      const mimeType = validateImagePayload(body, declaredMimeType, {
        field: 'logo',
        maxBytes: MAX_LOGO_BYTES,
        maxLabel: '2 MB',
      });
      await ensurePlatformBranding(deps.branding);

      const storageKey = createPlatformLogoStorageKey(mimeType);
      const checksum = createHash('sha256').update(body).digest('hex');
      const previous = await deps.branding.get();

      await deps.storage.put(storageKey, body);

      try {
        const file = await deps.files.create({
          fileType: 'PLATFORM_LOGO',
          storageKey,
          mimeType,
          size: body.byteLength,
          checksum,
        });
        const record = await withBrandingDomainError(() => deps.branding.attachLogo(file.id));

        if (previous?.logoFile) {
          await deps.files.deleteById(previous.logoFile.id);
          await bestEffortDelete(deps.storage, previous.logoFile.storageKey);
        }

        return toPublicPlatformBrandingResponse(record);
      } catch (error) {
        await bestEffortDelete(deps.storage, storageKey);
        throw error;
      }
    },

    async deleteLogo() {
      const existing = await deps.branding.get();
      if (!existing?.logoFile) {
        return;
      }

      await withBrandingDomainError(() => deps.branding.clearLogo());
      await deps.files.deleteById(existing.logoFile.id);
      await bestEffortDelete(deps.storage, existing.logoFile.storageKey);
    },

    async uploadFavicon(body, declaredMimeType) {
      const mimeType = validateImagePayload(body, declaredMimeType, {
        field: 'favicon',
        maxBytes: MAX_FAVICON_BYTES,
        maxLabel: '512 KB',
      });
      await ensurePlatformBranding(deps.branding);

      const storageKey = createPlatformFaviconStorageKey(mimeType);
      const checksum = createHash('sha256').update(body).digest('hex');
      const previous = await deps.branding.get();

      await deps.storage.put(storageKey, body);

      try {
        const file = await deps.files.create({
          fileType: 'PLATFORM_FAVICON',
          storageKey,
          mimeType,
          size: body.byteLength,
          checksum,
        });
        const record = await withBrandingDomainError(() => deps.branding.attachFavicon(file.id));

        if (previous?.faviconFile) {
          await deps.files.deleteById(previous.faviconFile.id);
          await bestEffortDelete(deps.storage, previous.faviconFile.storageKey);
        }

        return toPublicPlatformBrandingResponse(record);
      } catch (error) {
        await bestEffortDelete(deps.storage, storageKey);
        throw error;
      }
    },

    async deleteFavicon() {
      const existing = await deps.branding.get();
      if (!existing?.faviconFile) {
        return;
      }

      await withBrandingDomainError(() => deps.branding.clearFavicon());
      await deps.files.deleteById(existing.faviconFile.id);
      await bestEffortDelete(deps.storage, existing.faviconFile.storageKey);
    },

    async uploadIcon(body, declaredMimeType) {
      const mimeType = validateImagePayload(body, declaredMimeType, {
        field: 'icon',
        maxBytes: MAX_LOGO_BYTES,
        maxLabel: '2 MB',
      });
      await ensurePlatformBranding(deps.branding);

      const storageKey = createPlatformIconStorageKey(mimeType);
      const checksum = createHash('sha256').update(body).digest('hex');
      const previous = await deps.branding.get();

      await deps.storage.put(storageKey, body);

      try {
        const file = await deps.files.create({
          fileType: 'PLATFORM_ICON',
          storageKey,
          mimeType,
          size: body.byteLength,
          checksum,
        });
        const record = await withBrandingDomainError(() => deps.branding.attachIcon(file.id));

        if (previous?.iconFile) {
          await deps.files.deleteById(previous.iconFile.id);
          await bestEffortDelete(deps.storage, previous.iconFile.storageKey);
        }

        return toPublicPlatformBrandingResponse(record);
      } catch (error) {
        await bestEffortDelete(deps.storage, storageKey);
        throw error;
      }
    },

    async deleteIcon() {
      const existing = await deps.branding.get();
      if (!existing?.iconFile) {
        return;
      }

      await withBrandingDomainError(() => deps.branding.clearIcon());
      await deps.files.deleteById(existing.iconFile.id);
      await bestEffortDelete(deps.storage, existing.iconFile.storageKey);
    },
  };
}
