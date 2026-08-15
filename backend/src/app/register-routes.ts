import type { FastifyInstance } from 'fastify';

import { databaseHealthRoutes } from '../http/routes/database-health.js';
import { healthRoutes } from '../http/routes/health.js';
import { redisHealthRoutes } from '../http/routes/redis-health.js';
import { registerTestSessionRoutes } from '../http/routes/test-session.js';
import { loadEnvironment } from '../config/env.js';
import { registerAuthHttpRoutes } from '../modules/auth/index.js';
import { registerAdminAdministratorsRoutes } from '../modules/auth/http/admin-administrators.routes.js';
import { registerAdminTenantUsersRoutes } from '../modules/auth/http/admin-tenant-users.routes.js';
import { registerProtectedTestRoutes } from '../modules/auth/http/protected-test.routes.js';
import {
  registerAdminBrandingRoutes,
  registerAdminPlatformBrandingRoutes,
  registerCurrentBrandingRoutes,
} from '../modules/branding/index.js';
import { registerPublicFileRoutes } from '../modules/branding/http/public-file.routes.js';
import { registerAdminTenantRoutes } from '../modules/tenant/index.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(databaseHealthRoutes);
  await app.register(redisHealthRoutes);
  await registerAuthHttpRoutes(app);
  await app.register(registerAdminTenantRoutes);
  await app.register(registerAdminAdministratorsRoutes);
  await app.register(registerAdminTenantUsersRoutes);
  await app.register(registerAdminBrandingRoutes);
  await app.register(registerAdminPlatformBrandingRoutes);
  await app.register(registerCurrentBrandingRoutes);
  await app.register(registerPublicFileRoutes);

  const environment = loadEnvironment();
  if (environment.nodeEnv === 'test') {
    await app.register(registerTestSessionRoutes);
    await app.register(registerProtectedTestRoutes);
  }
}
