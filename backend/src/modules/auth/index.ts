import type { FastifyInstance } from 'fastify';

import type { Environment } from '../../config/env.js';
import { registerCookiePlugin } from '../../http/plugins/register-cookie.js';
import { registerRedisPlugin } from '../../http/plugins/register-redis.js';
import { registerSessionPlugin } from '../../http/plugins/register-session.js';
import { registerLoginRoutes } from './http/login.routes.js';

export * from './domain/index.js';
export * from './repositories/index.js';
export { createArgon2idPasswordHasher } from './crypto/password-hasher.js';
export type { PasswordHasher } from './crypto/password-hasher.js';
export { createLoginService } from './services/login.service.js';
export type { LoginInput, LoginService } from './services/login.service.js';

/**
 * Porta pública do módulo auth.
 * 1.1A: cookies + sessão.
 * 1.1B: Redis como store de sessão.
 * 1.1C: modelo persistente User/Tenant/UserCredential.
 * 1.1D: POST /auth/login (sem logout, /me ou middleware global).
 */
export async function registerAuthFoundation(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await registerCookiePlugin(app);
  await registerRedisPlugin(app, environment);
  await registerSessionPlugin(app, environment);
}

export async function registerAuthHttpRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerLoginRoutes);
}
