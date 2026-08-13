import type { FastifyInstance } from 'fastify';

import type { Environment } from '../../config/env.js';
import { registerCookiePlugin } from '../../http/plugins/register-cookie.js';
import { registerSessionPlugin } from '../../http/plugins/register-session.js';

/**
 * Porta pública do módulo auth na fundação 1.1A.
 * Apenas registra a infraestrutura de cookies/sessão.
 * Login, middleware e autorização permanecem fora desta subfase.
 */
export async function registerAuthFoundation(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await registerCookiePlugin(app);
  await registerSessionPlugin(app, environment);
}
