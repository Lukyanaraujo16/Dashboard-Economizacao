import type { Environment } from '../../../config/env.js';

export const SESSION_COOKIE_NAME = 'dashboard.sid';

/** Duração centralizada da sessão em desenvolvimento/fundação (1 dia). */
export const SESSION_MAX_AGE_MILLISECONDS = 60 * 60 * 24 * 1000;

export const SESSION_TTL_SECONDS = SESSION_MAX_AGE_MILLISECONDS / 1000;

/**
 * Cookie Secure em production, exceto o modo HTTP temporário explícito do piloto.
 * HTTPS nunca desliga Secure, mesmo se ALLOW_INSECURE_HTTP_SESSION estiver no env.
 */
export function isSessionCookieSecure(environment: Environment): boolean {
  if (environment.nodeEnv !== 'production') {
    return false;
  }
  return !environment.allowInsecureHttpSession;
}

/**
 * Opções base de cookie/sessão.
 * O store Redis é injetado em register-session (1.1B).
 */
export function buildSessionCookieOptions(environment: Environment) {
  return {
    secret: environment.authSecret,
    cookieName: SESSION_COOKIE_NAME,
    saveUninitialized: false,
    // Sliding inactivity é aplicado apenas em requireAuthentication (1.1E),
    // via Session#options({ maxAge }) + save(). Não usar rolling:true:
    // renovaria cookie também em requests públicas que carregam a sessão.
    rolling: false,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: isSessionCookieSecure(environment),
      sameSite: 'lax' as const,
      maxAge: SESSION_MAX_AGE_MILLISECONDS,
    },
  };
}
