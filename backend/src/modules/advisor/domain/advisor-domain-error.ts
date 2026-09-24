export class AdvisorDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AdvisorDomainError';
    this.code = code;
  }
}
