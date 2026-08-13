import type { FastifyInstance } from 'fastify';

import { databaseHealthRoutes } from '../http/routes/database-health.js';
import { healthRoutes } from '../http/routes/health.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(databaseHealthRoutes);
}
