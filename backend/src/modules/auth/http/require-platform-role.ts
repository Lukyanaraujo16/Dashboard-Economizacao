import type { preHandlerAsyncHookHandler } from 'fastify';

import { ForbiddenError, UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { isPlatformRole } from '../domain/types.js';

/**
 * Guard mínimo para operações administrativas de plataforma (docs/09.9 §3.7).
 * Deve ser encadeado após requireAuthentication.
 * Bloqueia durante modo suporte — mutações /admin ficam na plataforma, não no tenant suportado.
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

    if (auth.support.active) {
      throw new ForbiddenError('Saia do modo suporte para acessar operações administrativas.');
    }
  };
}

/**
 * ADMIN | SUPER_ADMIN, inclusive com modo suporte ativo.
 * Usado em enter/exit de suporte — createRequirePlatformRole bloquearia o exit.
 */
export function createRequirePlatformOperator(): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!request.auth) {
      throw new UnauthenticatedError();
    }
    if (!isPlatformRole(request.auth.role)) {
      throw new ForbiddenError();
    }
  };
}
