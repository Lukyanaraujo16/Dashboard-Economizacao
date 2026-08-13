import type { FastifyInstance } from 'fastify';

import { loadEnvironment } from '../../config/env.js';
import { isDatabaseHealthy } from '../../infrastructure/database/database-health.js';

export async function databaseHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/db', async (_request, reply) => {
    const environment = loadEnvironment();
    const isHealthy = await isDatabaseHealthy(environment.databaseUrl);

    if (!isHealthy) {
      return reply.status(503).send({ status: 'unavailable' as const });
    }

    return { status: 'ok' as const };
  });
}
