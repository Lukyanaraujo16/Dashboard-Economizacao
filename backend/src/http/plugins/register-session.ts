import type { FastifyInstance } from 'fastify';
import session from '@fastify/session';

import type { Environment } from '../../config/env.js';
import {
  SESSION_TTL_SECONDS,
  buildSessionCookieOptions,
} from '../../modules/auth/config/session-config.js';
import {
  buildSessionKeyPrefix,
  createRedisSessionStore,
} from '../../modules/auth/session/redis-session-store.js';

/**
 * Registra @fastify/session com store Redis (1.1B).
 * Não cria login nem identidade autenticada.
 */
export async function registerSessionPlugin(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  if (!app.redis) {
    throw new Error('Redis deve ser registrado antes da sessão.');
  }

  const store = createRedisSessionStore(app.redis, {
    keyPrefix: buildSessionKeyPrefix(environment.nodeEnv),
    ttlSeconds: SESSION_TTL_SECONDS,
  });

  await app.register(session, {
    ...buildSessionCookieOptions(environment),
    store,
  });
}
