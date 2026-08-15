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
  normalizeUpsertPlatformBrandingInput,
  normalizeUpsertTenantBrandingInput,
  resolveUpsertBrandColorSchemes,
  shouldPersistTenantBranding,
} from './domain/branding-normalization.js';
export {
  PLATFORM_BRANDING_SINGLETON_KEY,
  normalizePlatformBrandName,
} from './domain/platform-brand-name.js';
export type {
  BrandColorOverrides,
  PlatformBrandingRecord,
  StoredFileRecord,
  StoredFileType,
  TenantBrandingRecord,
  UpsertPlatformBrandingInput,
  UpsertTenantBrandingInput,
} from './domain/types.js';
export { createTenantBrandingRepository } from './repositories/tenant-branding.repository.js';
export type { TenantBrandingRepository } from './repositories/tenant-branding.repository.js';
export { createPlatformBrandingRepository } from './repositories/platform-branding.repository.js';
export type { PlatformBrandingRepository } from './repositories/platform-branding.repository.js';
export { createStoredFileRepository } from './repositories/stored-file.repository.js';
export type { StoredFileRepository } from './repositories/stored-file.repository.js';
export { registerAdminBrandingRoutes } from './http/admin-branding.routes.js';
export { registerCurrentBrandingRoutes } from './http/current-branding.routes.js';
export type { PublicTenantBrandingResponse } from './http/to-public-branding-response.js';
export { toPublicBrandingResponse } from './http/to-public-branding-response.js';
export type { PublicCurrentBrandingResponse } from './http/to-current-branding-response.js';
export {
  PLATFORM_BRAND_NAME,
  toPlatformCurrentBrandingResponse,
  toTenantCurrentBrandingResponse,
} from './http/to-current-branding-response.js';
export { MAX_LOGO_BYTES, detectAllowedLogoMimeType } from './domain/logo-mime.js';
