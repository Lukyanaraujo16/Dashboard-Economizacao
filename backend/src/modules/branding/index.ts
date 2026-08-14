export { BrandingDomainError } from './domain/branding-domain-error.js';
export {
  ALLOWED_BRANDING_COLOR_TOKEN_NAMES,
  isAllowedBrandColorToken,
} from './domain/allowed-color-tokens.js';
export type { BrandColorTokenName } from './domain/allowed-color-tokens.js';
export {
  hasAnyBrandColorOverrides,
  mergeBrandColorOverrides,
  parseBrandColorOverrides,
} from './domain/color-validation.js';
export {
  normalizeUpsertTenantBrandingInput,
  resolveUpsertBrandColorSchemes,
  shouldPersistTenantBranding,
} from './domain/branding-normalization.js';
export type {
  BrandColorOverrides,
  TenantBrandingRecord,
  UpsertTenantBrandingInput,
} from './domain/types.js';
export { createTenantBrandingRepository } from './repositories/tenant-branding.repository.js';
export type { TenantBrandingRepository } from './repositories/tenant-branding.repository.js';
export { registerAdminBrandingRoutes } from './http/admin-branding.routes.js';
export type { PublicTenantBrandingResponse } from './http/to-public-branding-response.js';
export { toPublicBrandingResponse } from './http/to-public-branding-response.js';
