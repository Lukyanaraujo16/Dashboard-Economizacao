import type { BrandColorOverrides } from './branding.types';

export type {
  BrandColorOverrides,
  BrandColorToken,
  BrandingErrorDetail,
  BrandingRequestFailureKind,
} from './branding.types';
export { BrandingRequestError, ALLOWED_BRAND_COLOR_TOKENS } from './branding.types';

/** DTO público administrativo de Aparência da Plataforma. */
export type PlatformBranding = {
  readonly name: string | null;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly faviconUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export type UpdatePlatformBrandingInput = {
  readonly name?: string;
  readonly light?: BrandColorOverrides | null;
  readonly dark?: BrandColorOverrides | null;
};

/** Fallback visual quando não há configuração persistida. */
export const DEFAULT_PLATFORM_BRAND_NAME = 'Economização';

export const MAX_PLATFORM_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_PLATFORM_FAVICON_BYTES = 512 * 1024;

export const ALLOWED_PLATFORM_ASSET_ACCEPT = 'image/png,image/jpeg,image/webp';

export const ALLOWED_PLATFORM_ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
