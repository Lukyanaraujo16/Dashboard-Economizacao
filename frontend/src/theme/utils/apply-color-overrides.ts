import type { ColorTokenName, ColorTokens } from '../types/colors';
import { COLOR_TOKEN_NAMES } from '../types/colors';
import { mergeBrandingColors } from '../branding/merge-branding-colors';

/**
 * Aplica overrides de branding apenas em tokens allowlisted.
 * Delega ao merge seguro do Branding Runtime / Theme Engine.
 */
export function applyColorOverrides(
  base: ColorTokens,
  overrides: Partial<ColorTokens> | undefined,
): ColorTokens {
  return mergeBrandingColors(base, overrides);
}

export function isColorTokenName(value: string): value is ColorTokenName {
  return (COLOR_TOKEN_NAMES as readonly string[]).includes(value);
}
