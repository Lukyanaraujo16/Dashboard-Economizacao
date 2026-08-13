import type { ColorTokens } from '../types/colors';
import {
  isAllowedBrandingColorToken,
  isProtectedBrandingColorToken,
} from './allowed-color-overrides';

/**
 * Merge seguro: Theme Default + overrides permitidos.
 * Tokens protegidos e não allowlisted são ignorados.
 * Branding parcial completa com o default (nunca quebra o tema).
 */
export function mergeBrandingColors(
  base: ColorTokens,
  overrides: Partial<ColorTokens> | undefined,
): ColorTokens {
  if (!overrides) {
    return base;
  }

  const next = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    if (isProtectedBrandingColorToken(key)) {
      continue;
    }
    if (!isAllowedBrandingColorToken(key)) {
      continue;
    }
    next[key] = value.trim();
  }

  return next;
}
