import type { ColorTokenName } from '../types/colors';
import { PROTECTED_COLOR_TOKEN_NAMES } from '../types/colors';

/**
 * Tokens de cor que o Branding Runtime pode sobrescrever.
 * Equivalentes documentados: onPrimary acompanha primary para contraste.
 */
export const ALLOWED_BRANDING_COLOR_TOKEN_NAMES = [
  'primary',
  'onPrimary',
  'secondary',
  'accent',
] as const satisfies readonly ColorTokenName[];

export type AllowedBrandingColorTokenName = (typeof ALLOWED_BRANDING_COLOR_TOKEN_NAMES)[number];

const allowedSet = new Set<string>(ALLOWED_BRANDING_COLOR_TOKEN_NAMES);
const protectedSet = new Set<string>(PROTECTED_COLOR_TOKEN_NAMES);

export function isAllowedBrandingColorToken(name: string): name is AllowedBrandingColorTokenName {
  return allowedSet.has(name);
}

export function isProtectedBrandingColorToken(name: string): boolean {
  return protectedSet.has(name);
}
