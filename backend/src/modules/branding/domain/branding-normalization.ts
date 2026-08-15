import {
  hasAnyBrandColorOverrides,
  mergeBrandColorOverrides,
  parseBrandColorOverrides,
} from './color-validation.js';
import type { BrandColorOverrides, UpsertTenantBrandingInput } from './types.js';

export type NormalizedUpsertTenantBrandingInput = {
  readonly lightColors?: BrandColorOverrides | null;
  readonly darkColors?: BrandColorOverrides | null;
};

export function normalizeUpsertTenantBrandingInput(
  input: UpsertTenantBrandingInput,
): NormalizedUpsertTenantBrandingInput {
  const normalized: {
    lightColors?: BrandColorOverrides | null;
    darkColors?: BrandColorOverrides | null;
  } = {};

  if ('lightColors' in input) {
    normalized.lightColors =
      input.lightColors === null
        ? null
        : parseBrandColorOverrides(input.lightColors, 'lightColors');
  }

  if ('darkColors' in input) {
    normalized.darkColors =
      input.darkColors === null ? null : parseBrandColorOverrides(input.darkColors, 'darkColors');
  }

  return normalized;
}

export function resolveUpsertBrandColorSchemes(
  existing: {
    readonly lightColors: BrandColorOverrides | null;
    readonly darkColors: BrandColorOverrides | null;
  },
  input: NormalizedUpsertTenantBrandingInput,
): { lightColors: BrandColorOverrides | null; darkColors: BrandColorOverrides | null } {
  const lightColors =
    input.lightColors === undefined
      ? existing.lightColors
      : mergeBrandColorOverrides(existing.lightColors, input.lightColors);

  const darkColors =
    input.darkColors === undefined
      ? existing.darkColors
      : mergeBrandColorOverrides(existing.darkColors, input.darkColors);

  return { lightColors, darkColors };
}

export function shouldPersistTenantBranding(
  lightColors: BrandColorOverrides | null,
  darkColors: BrandColorOverrides | null,
  logoFileId?: string | null,
): boolean {
  return hasAnyBrandColorOverrides(lightColors, darkColors) || Boolean(logoFileId);
}
