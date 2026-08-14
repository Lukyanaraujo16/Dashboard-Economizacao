import type { FastifyInstance } from 'fastify';

import type { Environment } from '../../config/env.js';
import { registerCookiePlugin } from '../../http/plugins/register-cookie.js';
import { registerRedisPlugin } from '../../http/plugins/register-redis.js';
import { registerSessionPlugin } from '../../http/plugins/register-session.js';
import { registerLoginRoutes } from './http/login.routes.js';
import { registerLogoutRoutes } from './http/logout.routes.js';
import { registerMeRoutes } from './http/me.routes.js';

export * from './domain/index.js';
export * from './repositories/index.js';
export { createArgon2idPasswordHasher } from './crypto/password-hasher.js';
export type { PasswordHasher } from './crypto/password-hasher.js';
export { createLoginService } from './services/login.service.js';
export type { LoginInput, LoginService } from './services/login.service.js';
export { createRequireAuthentication } from './http/require-authentication.js';
export type { RequireAuthenticationDependencies } from './http/require-authentication.js';
export { createRequirePlatformRole } from './http/require-platform-role.js';
export { parseSessionAuthenticationContext } from './http/parse-session-authentication.js';
export type { PublicAuthenticatedUser } from './http/public-authenticated-user.js';

/**
 * Porta pública do módulo auth.
 * 1.1A–1.1D: cookies, Redis session, modelo User, POST /auth/login.
 * 1.1E: requireAuthentication + request.auth + sliding inactivity.
 * 1.1F-E.3: GET /auth/me, POST /auth/logout.
 * Sem middleware global em todas as rotas ou guards de role.
 */
export async function registerAuthFoundation(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await registerCookiePlugin(app);
  await registerRedisPlugin(app, environment);
  await registerSessionPlugin(app, environment);

  if (!app.hasRequestDecorator('auth')) {
    app.decorateRequest('auth', null);
  }
}

export async function registerAuthHttpRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerLoginRoutes);
  await app.register(registerMeRoutes);
  await app.register(registerLogoutRoutes);
}
