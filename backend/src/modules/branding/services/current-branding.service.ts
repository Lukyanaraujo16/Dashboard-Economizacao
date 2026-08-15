import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { TenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import {
  toPlatformCurrentBrandingResponse,
  toTenantCurrentBrandingResponse,
  type PublicCurrentBrandingResponse,
} from '../http/to-current-branding-response.js';

export type CurrentBrandingServiceDependencies = {
  readonly tenants: TenantRepository;
  readonly branding: TenantBrandingRepository;
};

/**
 * Resolve branding visual da sessão atual (1.3F).
 * USER → tenant ACTIVE + overrides; ADMIN/SUPER_ADMIN → plataforma.
 */
export function createCurrentBrandingService(deps: CurrentBrandingServiceDependencies) {
  return {
    async getForAuthenticatedSession(
      auth: AuthenticatedRequestContext,
    ): Promise<PublicCurrentBrandingResponse> {
      if (auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN') {
        return toPlatformCurrentBrandingResponse();
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
      });
    },
  };
}

export type CurrentBrandingService = ReturnType<typeof createCurrentBrandingService>;
