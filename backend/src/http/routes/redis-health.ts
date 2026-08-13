import type { FastifyInstance } from 'fastify';

import { isRedisHealthy } from '../../infrastructure/redis/redis-health.js';

export async function redisHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/redis', async (_request, reply) => {
    const isHealthy = await isRedisHealthy(app.redis);

    if (!isHealthy) {
      return reply.status(503).send({ status: 'unavailable' as const });
    }

    return { status: 'ok' as const };
  });
}
