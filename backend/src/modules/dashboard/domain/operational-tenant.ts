import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';

/**
 * Tenant operacional da Dashboard: sessão / Support Mode.
 * Nunca lê tenantId da URL ou da query.
 */
export function resolveOperationalTenantId(auth: AuthenticatedRequestContext): string | null {
  if (auth.support.active) {
    return auth.support.tenantId;
  }
  if (auth.role === 'USER') {
    return auth.tenantId;
  }
  return null;
}
