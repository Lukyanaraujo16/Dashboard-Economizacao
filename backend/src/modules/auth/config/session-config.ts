import type { Environment } from '../../../config/env.js';

export const SESSION_COOKIE_NAME = 'dashboard.sid';

/** Duração centralizada da sessão em desenvolvimento/fundação (1 dia). */
export const SESSION_MAX_AGE_MILLISECONDS = 60 * 60 * 24 * 1000;

export const SESSION_TTL_SECONDS = SESSION_MAX_AGE_MILLISECONDS / 1000;

/**
 * Opções base de cookie/sessão.
 * O store Redis é injetado em register-session (1.1B).
 */
export function buildSessionCookieOptions(environment: Environment) {
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
      maxAge: SESSION_MAX_AGE_MILLISECONDS,
    },
  };
}
