export class BrandingDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BrandingDomainError';
    this.code = code;
  }
}
