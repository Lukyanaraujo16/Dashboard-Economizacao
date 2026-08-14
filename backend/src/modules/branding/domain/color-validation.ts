import { isAllowedBrandColorToken } from './allowed-color-tokens.js';
import { BrandingDomainError } from './branding-domain-error.js';
import type { BrandColorOverrides } from './types.js';
import type { BrandColorTokenName } from './allowed-color-tokens.js';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    throw new BrandingDomainError(
      'BRANDING_INVALID_COLOR_FORMAT',
      'Cor de branding deve estar no formato #RRGGBB.',
    );
  }
  return trimmed.toUpperCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida e normaliza overrides parciais de cor.
 * Rejeita chaves desconhecidas e tokens protegidos/fora da allowlist.
 */
export function parseBrandColorOverrides(
  input: unknown,
  fieldLabel: string,
): BrandColorOverrides | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (!isPlainObject(input)) {
    throw new BrandingDomainError(
      'BRANDING_INVALID_COLOR_OVERRIDES',
      `${fieldLabel} deve ser um objeto de tokens de cor.`,
    );
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    return null;
  }

  const next: Partial<Record<BrandColorTokenName, string>> = {};

  for (const [key, value] of entries) {
    if (!isAllowedBrandColorToken(key)) {
      throw new BrandingDomainError(
        'BRANDING_INVALID_COLOR_TOKEN',
        `Token de cor "${key}" não é permitido para branding de tenant.`,
      );
    }

    if (typeof value !== 'string') {
      throw new BrandingDomainError(
        'BRANDING_INVALID_COLOR_FORMAT',
        `Valor de "${key}" deve ser uma string hexadecimal.`,
      );
    }

    next[key] = normalizeHexColor(value);
  }

  return next;
}

export function mergeBrandColorOverrides(
  base: BrandColorOverrides | null,
  patch: BrandColorOverrides | null,
): BrandColorOverrides | null {
  if (patch === null) {
    return null;
  }

  if (!base && !patch) {
    return null;
  }

  const merged = { ...(base ?? {}), ...patch };
  return Object.keys(merged).length > 0 ? merged : null;
}

export function hasAnyBrandColorOverrides(
  lightColors: BrandColorOverrides | null,
  darkColors: BrandColorOverrides | null,
): boolean {
  return (
    (lightColors !== null && Object.keys(lightColors).length > 0) ||
    (darkColors !== null && Object.keys(darkColors).length > 0)
  );
}
