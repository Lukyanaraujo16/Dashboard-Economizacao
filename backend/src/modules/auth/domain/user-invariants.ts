import type { UserRole } from './types.js';

export class AuthDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthDomainError';
    this.code = code;
  }
}

/**
 * USER exige tenant; ADMIN e SUPER_ADMIN não possuem tenant próprio (docs/09.7, 09.9).
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
