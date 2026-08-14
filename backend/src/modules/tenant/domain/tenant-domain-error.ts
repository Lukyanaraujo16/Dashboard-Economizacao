export class TenantDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TenantDomainError';
    this.code = code;
  }
}
