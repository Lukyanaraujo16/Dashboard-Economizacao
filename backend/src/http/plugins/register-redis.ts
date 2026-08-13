import type { FastifyInstance } from 'fastify';
import redis from '@fastify/redis';

import type { Environment } from '../../config/env.js';

/**
 * Registra a conexão Redis compartilhada do backend (@fastify/redis).
 * Primeiro uso: persistência de sessão. Não configura BullMQ.
 */
export async function registerRedisPlugin(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await app.register(redis, {
    url: environment.redisUrl,
  });
}
