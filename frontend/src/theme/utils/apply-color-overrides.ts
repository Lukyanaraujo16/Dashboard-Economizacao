import {
  COLOR_TOKEN_NAMES,
  PROTECTED_COLOR_TOKEN_NAMES,
  type ColorTokenName,
  type ColorTokens,
} from '../types/colors';

const protectedColorSet = new Set<string>(PROTECTED_COLOR_TOKEN_NAMES);

/**
 * Aplica overrides de branding apenas em tokens permitidos.
 * success/warning/danger/info nunca são sobrescritos pelo tenant.
 */
export function applyColorOverrides(
  base: ColorTokens,
  overrides: Partial<ColorTokens> | undefined,
): ColorTokens {
  if (!overrides) {
    return base;
  }

  const next = { ...base };

  for (const key of COLOR_TOKEN_NAMES) {
    const value = overrides[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    if (protectedColorSet.has(key)) {
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function isColorTokenName(value: string): value is ColorTokenName {
  return (COLOR_TOKEN_NAMES as readonly string[]).includes(value);
}
