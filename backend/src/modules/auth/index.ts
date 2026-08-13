import type { FastifyInstance } from 'fastify';

import type { Environment } from '../../config/env.js';
import { registerCookiePlugin } from '../../http/plugins/register-cookie.js';
import { registerRedisPlugin } from '../../http/plugins/register-redis.js';
import { registerSessionPlugin } from '../../http/plugins/register-session.js';

export * from './domain/index.js';
export * from './repositories/index.js';

/**
 * Porta pública do módulo auth.
 * 1.1A: cookies + sessão.
 * 1.1B: Redis como store de sessão.
 * 1.1C: modelo persistente User/Tenant/UserCredential (sem login).
 * Login, middleware e autorização permanecem fora destas subfases.
 */
export async function registerAuthFoundation(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await registerCookiePlugin(app);
  await registerRedisPlugin(app, environment);
  await registerSessionPlugin(app, environment);
}
