export { TenantDomainError } from './domain/tenant-domain-error.js';
export {
  assertCanDisableTenant,
  assertCanReactivateTenant,
  assertTenantRecordConsistency,
  assertTenantStatusDeactivatedAtConsistency,
  buildActiveTenantFields,
  buildDisabledTenantFields,
  canRoleUseTenantOperationalContext,
} from './domain/tenant-invariants.js';
export type { TenantOperationalRole } from './domain/tenant-invariants.js';
export {
  normalizeCreateTenantInput,
  normalizeDisplayName,
  normalizeTenantName,
  normalizeUpdateTenantInput,
} from './domain/tenant-normalization.js';
export type {
  CreateTenantInput,
  ListTenantsFilter,
  ListTenantsResult,
  TenantContaAzulSummary,
  TenantRecord,
  TenantStatus,
  UpdateTenantInput,
} from './domain/types.js';
export { TENANT_STATUSES } from './domain/types.js';
export { createTenantRepository } from './repositories/tenant.repository.js';
export type { TenantRepository } from './repositories/tenant.repository.js';
export { registerAdminTenantRoutes } from './http/admin-tenant.routes.js';
export type { PublicTenantResponse } from './http/to-public-tenant-response.js';
export { toPublicTenantResponse } from './http/to-public-tenant-response.js';
