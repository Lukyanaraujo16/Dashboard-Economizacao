import type { FileStorage } from '../../../infrastructure/storage/file-storage.js';
import type { PlatformBrandingRepository } from '../../branding/repositories/platform-branding.repository.js';
import type { TenantBrandingRepository } from '../../branding/repositories/tenant-branding.repository.js';
import type { StoredFileRecord } from '../../branding/domain/types.js';
import type { ReportPdfBranding } from './report-pdf-presentation.js';

/**
 * Logo principal do relatório: tenant operacional → plataforma → ausente.
 * Nunca usa ícone compacto. Nunca expõe storageKey. Falha de asset → null.
 */
export async function resolveReportPdfBranding(input: {
  readonly tenantId: string | null;
  readonly tenantBranding: Pick<TenantBrandingRepository, 'findByTenantId'>;
  readonly platformBranding: Pick<PlatformBrandingRepository, 'get'>;
  readonly storage: Pick<FileStorage, 'get'>;
}): Promise<ReportPdfBranding> {
  try {
    const tenantRecord =
      input.tenantId === null ? null : await input.tenantBranding.findByTenantId(input.tenantId);
    const platformRecord = await input.platformBranding.get();
    const principalLogo = tenantRecord?.logoFile ?? platformRecord?.logoFile ?? null;
    return { logo: await readPrincipalLogoBytes(input.storage, principalLogo) };
  } catch {
    return { logo: null };
  }
}

async function readPrincipalLogoBytes(
  storage: Pick<FileStorage, 'get'>,
  file: StoredFileRecord | null,
): Promise<Buffer | null> {
  if (!file) {
    return null;
  }
  try {
    const body = await storage.get(file.storageKey);
    if (!body || body.length === 0) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}
