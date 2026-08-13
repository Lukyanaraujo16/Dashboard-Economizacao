import type { FastifyInstance } from 'fastify';

import { databaseHealthRoutes } from '../http/routes/database-health.js';
import { healthRoutes } from '../http/routes/health.js';
import { redisHealthRoutes } from '../http/routes/redis-health.js';
import { registerTestSessionRoutes } from '../http/routes/test-session.js';
import { loadEnvironment } from '../config/env.js';
import { registerAuthHttpRoutes } from '../modules/auth/index.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(databaseHealthRoutes);
  await app.register(redisHealthRoutes);
  await registerAuthHttpRoutes(app);

  const environment = loadEnvironment();
  if (environment.nodeEnv === 'test') {
    await app.register(registerTestSessionRoutes);
  }
}
