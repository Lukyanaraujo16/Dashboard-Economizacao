import type { Session } from 'fastify';

import type { AuthenticationContext } from '../domain/authentication-context.js';
import { USER_ROLES, type UserRole } from '../domain/types.js';
import { assertUserTenantRoleConsistency } from '../domain/user-invariants.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Extrai e valida o shape do Authentication Context da sessão.
 * Inconsistências de role/tenant ou campos ausentes → null (sessão inválida).
 */
export function parseSessionAuthenticationContext(session: Session): AuthenticationContext | null {
  if (!isNonEmptyString(session.userId)) {
    return null;
  }
  if (!isUserRole(session.role)) {
    return null;
  }
  if (!isNonEmptyString(session.createdAt)) {
    return null;
  }
  if (!isNonEmptyString(session.lastAccess)) {
    return null;
  }

  const tenantId = session.tenantId === undefined ? null : session.tenantId;
  if (tenantId !== null && typeof tenantId !== 'string') {
    return null;
  }

  try {
    assertUserTenantRoleConsistency(session.role, tenantId);
  } catch {
    return null;
  }

  return {
    userId: session.userId,
    tenantId,
    role: session.role,
    createdAt: session.createdAt,
    lastAccess: session.lastAccess,
    ip: session.ip ?? null,
    userAgent: session.userAgent ?? null,
  };
}
