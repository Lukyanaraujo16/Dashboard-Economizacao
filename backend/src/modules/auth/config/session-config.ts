import type { Environment } from '../../../config/env.js';

const SESSION_COOKIE_NAME = 'dashboard.sid';
const ONE_DAY_IN_MILLISECONDS = 60 * 60 * 24 * 1000;

/**
 * Opções base de sessão para a fundação da autenticação.
 * Store em memória é apenas temporário para a fase 1.1A; persistência
 * definitiva será definida nas subfases seguintes.
 */
export function buildSessionOptions(environment: Environment) {
  const isProduction = environment.nodeEnv === 'production';

  return {
    secret: environment.authSecret,
    cookieName: SESSION_COOKIE_NAME,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: ONE_DAY_IN_MILLISECONDS,
    },
  };
}
