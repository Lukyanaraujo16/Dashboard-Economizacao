import { TenantDomainError } from '../../tenant/domain/tenant-domain-error.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { mapTenantDomainError } from '../../tenant/services/map-tenant-domain-error.js';
import { toPublicBrandingResponse } from '../http/to-public-branding-response.js';
import type { PublicTenantBrandingResponse } from '../http/to-public-branding-response.js';
import type { UpsertTenantBrandingInput } from '../domain/types.js';
import type { TenantBrandingRepository } from '../repositories/tenant-branding.repository.js';
import { withBrandingDomainError } from './map-branding-domain-error.js';

export type AdminBrandingService = {
  getByTenantId(tenantId: string): Promise<PublicTenantBrandingResponse>;
  update(tenantId: string, input: UpsertTenantBrandingInput): Promise<PublicTenantBrandingResponse>;
  reset(tenantId: string): Promise<void>;
};

async function assertTenantExists(tenants: TenantRepository, tenantId: string): Promise<void> {
  const tenant = await tenants.findById(tenantId);
  if (!tenant) {
    throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
  }
}

export function createAdminBrandingService(deps: {
  tenants: TenantRepository;
  branding: TenantBrandingRepository;
}): AdminBrandingService {
  return {
    async getByTenantId(tenantId) {
      await assertTenantExists(deps.tenants, tenantId).catch((error) => {
        if (error instanceof TenantDomainError) {
          mapTenantDomainError(error);
        }
        throw error;
      });

      const record = await deps.branding.findByTenantId(tenantId);
      return toPublicBrandingResponse(tenantId, record);
    },

    async update(tenantId, input) {
      await assertTenantExists(deps.tenants, tenantId).catch((error) => {
        if (error instanceof TenantDomainError) {
          mapTenantDomainError(error);
        }
        throw error;
      });

      const record = await withBrandingDomainError(() => deps.branding.upsert(tenantId, input));
      return toPublicBrandingResponse(tenantId, record);
    },

    async reset(tenantId) {
      await assertTenantExists(deps.tenants, tenantId).catch((error) => {
        if (error instanceof TenantDomainError) {
          mapTenantDomainError(error);
        }
        throw error;
      });

      await withBrandingDomainError(() => deps.branding.deleteByTenantId(tenantId));
    },
  };
}
