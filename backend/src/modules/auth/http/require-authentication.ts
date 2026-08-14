import type { preHandlerAsyncHookHandler } from 'fastify';

import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { canRoleUseTenantOperationalContext } from '../../tenant/domain/tenant-invariants.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { SESSION_MAX_AGE_MILLISECONDS } from '../config/session-config.js';
import { isTemporaryLockoutExpired } from '../domain/auth-lockout.js';
import type { AuthenticatedRequestContext } from '../domain/authentication-context.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { parseSessionAuthenticationContext } from './parse-session-authentication.js';

export type RequireAuthenticationDependencies = {
  readonly users: UserRepository;
  readonly tenants: TenantRepository;
  readonly clock?: () => Date;
};

/**
 * Guard reutilizável de autenticação (1.1E).
 * Resolve sessão → valida usuário ACTIVE no PostgreSQL → request.auth → sliding inactivity.
 *
 * Sliding (rolling permanece false globalmente):
 * - atualiza lastAccess;
 * - renova cookie.maxAge via Session#options (config central em ms);
 * - session.save() persiste no Redis (TTL 24h) e marca isSaved();
 * - @fastify/session onSend emite Set-Cookie quando isSaved()===true,
 *   sem renovar requests públicas/anônimas (rolling: false + sessão não salva).
 *
 * Custo típico: 1 SELECT em users (+ recovery de lockout expirado quando aplicável).
 */
export function createRequireAuthentication(
  deps: RequireAuthenticationDependencies,
): preHandlerAsyncHookHandler {
  const now = deps.clock ?? (() => new Date());

  return async (request) => {
    const session = request.session;
    if (!session) {
      throw new UnauthenticatedError();
    }

    const sessionAuth = parseSessionAuthenticationContext(session);
    if (!sessionAuth) {
      throw new UnauthenticatedError();
    }

    let user = await deps.users.findById(sessionAuth.userId);

    if (!user) {
      throw new UnauthenticatedError();
    }

    const at = now();

    if (user.status === 'BLOCKED' && isTemporaryLockoutExpired(user.lockedUntil, at)) {
      user = await deps.users.recoverExpiredTemporaryLockout(user.id, at);
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthenticatedError();
    }

    // Sessão não pode divergir do estado persistido (role/tenant).
    if (user.role !== sessionAuth.role || user.tenantId !== sessionAuth.tenantId) {
      throw new UnauthenticatedError();
    }

    if (user.role === 'USER') {
      if (user.tenantId === null) {
        throw new UnauthenticatedError();
      }

      const tenant = await deps.tenants.findById(user.tenantId);
      if (!canRoleUseTenantOperationalContext(user.role, tenant)) {
        throw new UnauthenticatedError();
      }
    }

    const lastAccess = at.toISOString();
    session.lastAccess = lastAccess;
    // Renova Expires do cookie a partir da config central (ms), sem rolling global.
    session.options({ maxAge: SESSION_MAX_AGE_MILLISECONDS });
    await session.save();

    const auth: AuthenticatedRequestContext = Object.freeze({
      userId: sessionAuth.userId,
      tenantId: sessionAuth.tenantId,
      role: sessionAuth.role,
      sessionId: session.sessionId,
      createdAt: sessionAuth.createdAt,
      lastAccess,
      ip: sessionAuth.ip,
      userAgent: sessionAuth.userAgent,
    });

    request.auth = auth;
  };
}
