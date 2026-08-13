export {
  ALLOWED_BRANDING_COLOR_TOKEN_NAMES,
  isAllowedBrandingColorToken,
  isProtectedBrandingColorToken,
} from './allowed-color-overrides';
export type { AllowedBrandingColorTokenName } from './allowed-color-overrides';
export { mergeBrandingColors } from './merge-branding-colors';
export { getMockTenantBranding, MOCK_TENANT_BRANDINGS } from './mocks/mock-tenant-brandings';
export type { MockTenantBranding, MockTenantBrandingId } from './mocks/mock-tenant-brandings';
export { normalizeBrandingInput } from './normalize-branding';
