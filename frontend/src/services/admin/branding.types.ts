export type BrandColorToken = 'primary' | 'onPrimary' | 'secondary' | 'accent';

export type BrandColorOverrides = Partial<Record<BrandColorToken, string>>;

/** Resposta pública de branding (produto: Aparência). */
export type CompanyBranding = {
  readonly tenantId: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/** Alias de produto para a tela Aparência. */
export type CompanyAppearance = CompanyBranding;

export type UpdateCompanyBrandingInput = {
  readonly light?: BrandColorOverrides | null;
  readonly dark?: BrandColorOverrides | null;
};

export type BrandingErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type BrandingRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'bad_request'
  | 'payload_too_large'
  | 'unavailable';

export class BrandingRequestError extends Error {
  readonly kind: BrandingRequestFailureKind;
  readonly details?: ReadonlyArray<BrandingErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: BrandingRequestFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<BrandingErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'BrandingRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

export const ALLOWED_BRAND_COLOR_TOKENS = [
  'primary',
  'onPrimary',
  'secondary',
  'accent',
] as const satisfies readonly BrandColorToken[];

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';

export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
