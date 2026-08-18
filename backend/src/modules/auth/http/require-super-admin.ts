import type { preHandlerAsyncHookHandler } from 'fastify';

import { ForbiddenError, UnauthenticatedError } from '../../../shared/errors/application-error.js';

export function createRequireSuperAdmin(): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!request.auth) {
      throw new UnauthenticatedError();
    }
    if (request.auth.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError();
    }
  };
}
