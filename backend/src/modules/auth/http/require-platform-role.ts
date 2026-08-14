import type { preHandlerAsyncHookHandler } from 'fastify';

import { ForbiddenError, UnauthenticatedError } from '../../../shared/errors/application-error.js';
import type { UserRole } from '../domain/types.js';

const PLATFORM_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const satisfies readonly UserRole[];

function isPlatformRole(role: UserRole): role is (typeof PLATFORM_ROLES)[number] {
  return PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]);
}

/**
 * Guard mínimo para operações administrativas de plataforma (docs/09.9 §3.7).
 * Deve ser encadeado após requireAuthentication.
 */
export function createRequirePlatformRole(): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }

    if (!isPlatformRole(auth.role)) {
      throw new ForbiddenError();
    }
  };
}
