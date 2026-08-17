import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { PlatformBrandingRepository } from '../repositories/platform-branding.repository.js';
import type { TenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import {
  toPlatformCurrentBrandingResponse,
  toTenantCurrentBrandingResponse,
  type PublicCurrentBrandingResponse,
} from '../http/to-current-branding-response.js';

export type CurrentBrandingServiceDependencies = {
  readonly tenants: TenantRepository;
  readonly branding: TenantBrandingRepository;
  readonly platformBranding: PlatformBrandingRepository;
};

/**
 * Resolve branding visual da sessão atual (1.3F + 1.5E).
 * ADMIN/SUPER_ADMIN → Platform Branding persistido.
 * USER → Tenant → Platform → Theme Default.
 */
export function createCurrentBrandingService(deps: CurrentBrandingServiceDependencies) {
  async function loadPlatform(): Promise<PublicCurrentBrandingResponse> {
    const record = await deps.platformBranding.get();
    return toPlatformCurrentBrandingResponse(record);
  }

  return {
    async getPlatformPublic(): Promise<PublicCurrentBrandingResponse> {
      return loadPlatform();
    },

    async getForAuthenticatedSession(
      auth: AuthenticatedRequestContext,
    ): Promise<PublicCurrentBrandingResponse> {
      const platform = await loadPlatform();

      if (auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN') {
        return platform;
      }

      if (auth.role !== 'USER' || auth.tenantId === null) {
        throw new UnauthenticatedError();
      }

      const tenant = await deps.tenants.findById(auth.tenantId);
      if (!tenant || tenant.status !== 'ACTIVE') {
        throw new UnauthenticatedError();
      }

      const record = await deps.branding.findByTenantId(tenant.id);
      return toTenantCurrentBrandingResponse({
        tenantId: tenant.id,
        displayName: tenant.displayName,
        record,
        platform,
      });
    },
  };
}

export type CurrentBrandingService = ReturnType<typeof createCurrentBrandingService>;
