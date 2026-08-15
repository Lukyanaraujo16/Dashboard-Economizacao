/**
 * Tipos compartilhados do DTO público de usuário administrativo (1.4C).
 * Usado por Administradores e Usuários da Empresa — sem misturar Companies/Branding.
 */

export type ManagedUserStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DISABLED';

export type ManagedUserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export type ManagedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: ManagedUserRole;
  readonly status: ManagedUserStatus;
  readonly tenantId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deactivatedAt: string | null;
};

export type ManagedUserPagination = {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export type ManagedUserListResult = {
  readonly data: ReadonlyArray<ManagedUser>;
  readonly pagination: ManagedUserPagination;
};

export type CreateManagedUserInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type UpdateManagedUserInput = {
  readonly name?: string;
  readonly email?: string;
};

export type ListManagedUsersParams = {
  readonly status?: ManagedUserStatus;
  readonly limit?: number;
  readonly offset?: number;
};

export type ManagedUserErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type ManagedUserRequestFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unavailable';

export class ManagedUsersRequestError extends Error {
  readonly kind: ManagedUserRequestFailureKind;
  readonly details?: ReadonlyArray<ManagedUserErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: ManagedUserRequestFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<ManagedUserErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ManagedUsersRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

export function isManagedUser(value: unknown): value is ManagedUser {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    (record.role === 'USER' || record.role === 'ADMIN' || record.role === 'SUPER_ADMIN') &&
    (record.status === 'PENDING' ||
      record.status === 'ACTIVE' ||
      record.status === 'BLOCKED' ||
      record.status === 'DISABLED') &&
    (record.tenantId === null || typeof record.tenantId === 'string') &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.deactivatedAt === null || typeof record.deactivatedAt === 'string') &&
    !('passwordHash' in record) &&
    !('credential' in record)
  );
}

export function isManagedUserListResult(value: unknown): value is ManagedUserListResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.data) ||
    typeof record.pagination !== 'object' ||
    record.pagination === null
  ) {
    return false;
  }
  const pagination = record.pagination as Record<string, unknown>;
  return (
    record.data.every(isManagedUser) &&
    typeof pagination.limit === 'number' &&
    typeof pagination.offset === 'number' &&
    typeof pagination.total === 'number' &&
    typeof pagination.hasMore === 'boolean'
  );
}
