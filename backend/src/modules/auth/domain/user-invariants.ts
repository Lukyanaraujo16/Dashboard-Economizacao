import type { UserRole, UserStatus } from './types.js';
import type { UserRecord } from './types.js';

export class AuthDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthDomainError';
    this.code = code;
  }
}

/**
 * Significado de `UserStatus` no domínio de administração (docs/16 §9).
 * Enum Prisma existente — não criar status novos.
 *
 * - PENDING: conta criada, ainda não apta ao uso normal (ex.: sem senha/convite).
 * - ACTIVE: utilizável; autentica quando há credencial válida e demais regras.
 * - BLOCKED: bloqueio administrativo ou lockout temporário (`lockedUntil`).
 * - DISABLED: desativado administrativamente; dados preservados; não autentica.
 */
export const USER_STATUS_DOMAIN_NOTES = {
  PENDING: 'Conta criada; ainda não apta ao uso normal.',
  ACTIVE: 'Conta utilizável para autenticação.',
  BLOCKED: 'Bloqueio administrativo ou lockout temporário.',
  DISABLED: 'Desativado administrativamente; dados preservados.',
} as const satisfies Record<UserStatus, string>;

/**
 * USER exige tenant; ADMIN e SUPER_ADMIN não possuem tenant próprio (docs/09.7, 09.9, ADR-047).
 */
export function assertUserTenantRoleConsistency(
  role: UserRole,
  tenantId: string | null | undefined,
): void {
  const hasTenant = tenantId != null && tenantId.length > 0;

  if (role === 'USER' && !hasTenant) {
    throw new AuthDomainError(
      'USER_REQUIRES_TENANT',
      'Usuário com perfil USER deve pertencer a um tenant.',
    );
  }

  if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && hasTenant) {
    throw new AuthDomainError(
      'PLATFORM_ROLE_MUST_NOT_HAVE_TENANT',
      `Perfil ${role} não possui tenant próprio.`,
    );
  }
}

/** Coerência status ↔ deactivatedAt (espelha TENANT-003 no domínio User). */
export function assertUserStatusDeactivatedAtConsistency(
  status: UserStatus,
  deactivatedAt: Date | null | undefined,
): void {
  const hasDeactivatedAt = deactivatedAt != null;

  if (status === 'DISABLED' && !hasDeactivatedAt) {
    throw new AuthDomainError(
      'USER_DISABLED_REQUIRES_DEACTIVATED_AT',
      'Usuário DISABLED deve possuir deactivatedAt preenchido.',
    );
  }

  if (status !== 'DISABLED' && hasDeactivatedAt) {
    throw new AuthDomainError(
      'USER_ACTIVE_LIKE_REQUIRES_NULL_DEACTIVATED_AT',
      'Usuário não DISABLED não pode possuir deactivatedAt preenchido.',
    );
  }
}

export function assertUserRecordConsistency(user: UserRecord): void {
  assertUserTenantRoleConsistency(user.role, user.tenantId);
  assertUserStatusDeactivatedAtConsistency(user.status, user.deactivatedAt);
}

/**
 * ADMIN operacional ativo (docs/15 §5 / docs/16 §9.1).
 * SUPER_ADMIN não conta. Preparação para invariante do último ADMIN (enforcement na 1.4C).
 */
export function isOperationalActiveAdmin(user: {
  readonly role: UserRole;
  readonly status: UserStatus;
}): boolean {
  return user.role === 'ADMIN' && user.status === 'ACTIVE';
}

/**
 * Proteção do último ADMIN operacional (docs/15 §5).
 * `activeAdminCount` deve ser lido sob lock na mesma transação.
 */
export function assertNotRemovingLastActiveAdmin(user: UserRecord, activeAdminCount: number): void {
  if (!isOperationalActiveAdmin(user)) {
    return;
  }
  if (activeAdminCount <= 1) {
    throw new AuthDomainError(
      'LAST_ACTIVE_ADMIN_PROTECTED',
      'A plataforma deve preservar ao menos um administrador operacional ativo.',
    );
  }
}

export function assertCanBlockUser(user: UserRecord): void {
  assertUserRecordConsistency(user);
  if (user.status === 'BLOCKED') {
    throw new AuthDomainError('USER_ALREADY_BLOCKED', 'Usuário já está bloqueado.');
  }
  if (user.status === 'DISABLED') {
    throw new AuthDomainError(
      'USER_DISABLED_CANNOT_BLOCK',
      'Usuário desativado não pode ser bloqueado; reative antes se necessário.',
    );
  }
}

export function assertCanUnblockUser(user: UserRecord): void {
  assertUserRecordConsistency(user);
  if (user.status !== 'BLOCKED') {
    throw new AuthDomainError('USER_NOT_BLOCKED', 'Usuário não está bloqueado.');
  }
}

export function assertCanDisableUser(user: UserRecord): void {
  assertUserRecordConsistency(user);
  if (user.status === 'DISABLED') {
    throw new AuthDomainError('USER_ALREADY_DISABLED', 'Usuário já está desativado.');
  }
}

export function assertCanEnableUser(user: UserRecord): void {
  assertUserRecordConsistency(user);
  if (user.status !== 'DISABLED') {
    throw new AuthDomainError('USER_NOT_DISABLED', 'Usuário não está desativado.');
  }
}

export function buildBlockedUserFields(): {
  status: 'BLOCKED';
  lockedUntil: null;
  failedLoginAttempts: number;
} {
  return {
    status: 'BLOCKED',
    lockedUntil: null,
    failedLoginAttempts: 0,
  };
}

export function buildUnblockedUserFields(): {
  status: 'ACTIVE';
  lockedUntil: null;
  failedLoginAttempts: number;
} {
  return {
    status: 'ACTIVE',
    lockedUntil: null,
    failedLoginAttempts: 0,
  };
}

export function buildDisabledUserFields(at: Date): {
  status: 'DISABLED';
  deactivatedAt: Date;
  lockedUntil: null;
  failedLoginAttempts: number;
} {
  return {
    status: 'DISABLED',
    deactivatedAt: at,
    lockedUntil: null,
    failedLoginAttempts: 0,
  };
}

export function buildEnabledUserFields(): {
  status: 'ACTIVE';
  deactivatedAt: null;
  lockedUntil: null;
  failedLoginAttempts: number;
} {
  return {
    status: 'ACTIVE',
    deactivatedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
  };
}
