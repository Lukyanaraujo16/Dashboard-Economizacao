import {
  hasAnyBrandColorOverrides,
  mergeBrandColorOverrides,
  parseBrandColorOverrides,
} from './color-validation.js';
import { normalizePlatformBrandName } from './platform-brand-name.js';
import type {
  BrandColorOverrides,
  UpsertPlatformBrandingInput,
  UpsertTenantBrandingInput,
} from './types.js';

export type NormalizedUpsertTenantBrandingInput = {
  readonly lightColors?: BrandColorOverrides | null;
  readonly darkColors?: BrandColorOverrides | null;
};

export type NormalizedUpsertPlatformBrandingInput = {
  readonly name?: string;
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

export function normalizeUpsertPlatformBrandingInput(
  input: UpsertPlatformBrandingInput,
): NormalizedUpsertPlatformBrandingInput {
  const normalized: {
    name?: string;
    lightColors?: BrandColorOverrides | null;
    darkColors?: BrandColorOverrides | null;
  } = {};

  if ('name' in input && input.name !== undefined) {
    normalized.name = normalizePlatformBrandName(input.name);
  }

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
  input: {
    readonly lightColors?: BrandColorOverrides | null;
    readonly darkColors?: BrandColorOverrides | null;
  },
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
