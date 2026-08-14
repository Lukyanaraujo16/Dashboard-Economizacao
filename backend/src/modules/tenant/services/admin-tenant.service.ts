import { TenantDomainError } from '../domain/tenant-domain-error.js';
import type { TenantRepository } from '../repositories/tenant.repository.js';
import type {
  CreateTenantInput,
  ListTenantsFilter,
  ListTenantsResult,
  TenantRecord,
  UpdateTenantInput,
} from '../domain/types.js';
import { withTenantDomainError } from './map-tenant-domain-error.js';

export type AdminTenantService = {
  create(input: CreateTenantInput): Promise<TenantRecord>;
  list(filter: ListTenantsFilter): Promise<ListTenantsResult>;
  getById(id: string): Promise<TenantRecord>;
  update(id: string, input: UpdateTenantInput): Promise<TenantRecord>;
  disable(id: string): Promise<TenantRecord>;
  reactivate(id: string): Promise<TenantRecord>;
};

export function createAdminTenantService(deps: {
  readonly tenants: TenantRepository;
}): AdminTenantService {
  return {
    async create(input) {
      return withTenantDomainError(() =>
        deps.tenants.create({
          name: input.name,
          displayName: input.displayName,
          status: 'ACTIVE',
        }),
      );
    },

    async list(filter) {
      return deps.tenants.list(filter);
    },

    async getById(id) {
      return withTenantDomainError(async () => {
        const tenant = await deps.tenants.findById(id);
        if (!tenant) {
          throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
        }
        return tenant;
      });
    },

    async update(id, input) {
      return withTenantDomainError(() => deps.tenants.update(id, input));
    },

    async disable(id) {
      return withTenantDomainError(() => deps.tenants.disable(id));
    },

    async reactivate(id) {
      return withTenantDomainError(() => deps.tenants.reactivate(id));
    },
  };
}
