/**
 * Allowlist alinhada ao Theme Engine (frontend/src/theme/branding/allowed-color-overrides.ts).
 */
export const ALLOWED_BRANDING_COLOR_TOKEN_NAMES = [
  'primary',
  'onPrimary',
  'secondary',
  'accent',
] as const;

export type BrandColorTokenName = (typeof ALLOWED_BRANDING_COLOR_TOKEN_NAMES)[number];

const allowedSet = new Set<string>(ALLOWED_BRANDING_COLOR_TOKEN_NAMES);

export function isAllowedBrandColorToken(name: string): name is BrandColorTokenName {
  return allowedSet.has(name);
}
