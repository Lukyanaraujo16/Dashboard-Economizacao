export type ApplicationErrorCategory =
  | 'dominio'
  | 'validacao'
  | 'autenticacao'
  | 'autorizacao'
  | 'integracao'
  | 'infraestrutura'
  | 'inesperado';

export type ApplicationErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTEGRATION_UNAVAILABLE'
  | 'SYNC_IN_PROGRESS'
  | 'INTERNAL_ERROR';

/**
 * Erro de aplicação com metadados para a fronteira HTTP (docs/09.10).
 */
export abstract class ApplicationError extends Error {
  abstract readonly category: ApplicationErrorCategory;
  abstract readonly code: ApplicationErrorCode;
  abstract readonly httpStatus: number;
  abstract readonly recoverable: boolean;

  readonly details?: ReadonlyArray<{ field: string; issue: string }>;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      details?: ReadonlyArray<{ field: string; issue: string }>;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options?.details;
  }
}

export class ValidationError extends ApplicationError {
  readonly category = 'validacao' as const;
  readonly code = 'VALIDATION_ERROR' as const;
  /** 400 malformado; 422 semanticamente inválido (docs/09.6 §6.4, docs/09.10 §4.1). */
  readonly httpStatus: 400 | 422;
  readonly recoverable = false;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      details?: ReadonlyArray<{ field: string; issue: string }>;
      httpStatus?: 400 | 422;
    },
  ) {
    super(message, options);
    this.httpStatus = options?.httpStatus ?? 422;
  }
}

export class UnauthenticatedError extends ApplicationError {
  readonly category = 'autenticacao' as const;
  readonly code = 'UNAUTHENTICATED' as const;
  readonly httpStatus = 401;
  readonly recoverable = false;

  constructor(
    message = 'Credenciais inválidas.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}

export class ForbiddenError extends ApplicationError {
  readonly category = 'autorizacao' as const;
  readonly code = 'FORBIDDEN' as const;
  readonly httpStatus = 403;
  readonly recoverable = false;

  constructor(
    message = 'Operação não permitida.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}

export class NotFoundError extends ApplicationError {
  readonly category = 'dominio' as const;
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;
  readonly recoverable = false;

  constructor(
    message = 'Registro não encontrado.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}

export class ConflictError extends ApplicationError {
  readonly category = 'dominio' as const;
  readonly code = 'CONFLICT' as const;
  readonly httpStatus = 409;
  readonly recoverable = false;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      details?: ReadonlyArray<{ field: string; issue: string }>;
    },
  ) {
    super(message, options);
  }
}

export class SyncInProgressError extends ApplicationError {
  readonly category = 'dominio' as const;
  readonly code = 'SYNC_IN_PROGRESS' as const;
  readonly httpStatus = 409;
  readonly recoverable = true;

  constructor(
    message = 'Já existe uma sincronização em andamento para esta empresa.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}

export class IntegrationUnavailableError extends ApplicationError {
  readonly category = 'integracao' as const;
  readonly code = 'INTEGRATION_UNAVAILABLE' as const;
  readonly httpStatus = 503;
  readonly recoverable = true;

  constructor(
    message = 'A integração não está disponível no momento.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}

export class RateLimitedError extends ApplicationError {
  readonly category = 'dominio' as const;
  readonly code = 'RATE_LIMITED' as const;
  readonly httpStatus = 429;
  readonly recoverable = true;

  constructor(
    message = 'Você atingiu o limite de mensagens do Consultor. Tente novamente em alguns minutos.',
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, options);
  }
}
