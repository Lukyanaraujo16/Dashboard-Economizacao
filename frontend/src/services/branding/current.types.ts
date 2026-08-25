/**
 * Branding visual da sessão autenticada (GET /branding/current).
 * Separado dos tipos administrativos de empresa.
 */

export type CurrentBrandingScope = 'platform' | 'tenant';

export type CurrentBrandColorToken = 'primary' | 'onPrimary' | 'secondary' | 'accent';

export type CurrentBrandColorOverrides = Partial<Record<CurrentBrandColorToken, string>>;

export type CurrentBranding = {
  readonly scope: CurrentBrandingScope;
  readonly tenantId: string | null;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly faviconUrl: string | null;
  readonly light: CurrentBrandColorOverrides | null;
  readonly dark: CurrentBrandColorOverrides | null;
  readonly updatedAt: string | null;
};

export type BrandingCurrentErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class BrandingCurrentRequestError extends Error {
  readonly kind: BrandingCurrentErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: BrandingCurrentErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'BrandingCurrentRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
