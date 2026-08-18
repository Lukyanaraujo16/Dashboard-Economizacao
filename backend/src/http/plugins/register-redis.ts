import type { FastifyInstance } from 'fastify';
import redis from '@fastify/redis';

import type { Environment } from '../../config/env.js';

/**
 * Registra a conexão Redis compartilhada do backend (@fastify/redis).
 * Sessão HTTP e state OAuth usam este cliente. BullMQ da sync manual usa
 * uma conexão ioredis própria (`infrastructure/jobs`).
 */
export async function registerRedisPlugin(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await app.register(redis, {
    url: environment.redisUrl,
  });
}
