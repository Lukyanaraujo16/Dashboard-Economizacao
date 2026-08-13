/**
 * Configuração mínima de acesso à API interna.
 *
 * Em desenvolvimento e produção same-origin, o browser chama caminhos relativos
 * (ex.: `/auth/login`). O Next.js faz rewrite para o Fastify via `API_URL`.
 */

/** Prefixo same-origin das rotas de autenticação. */
export const AUTH_API_PREFIX = '/auth';

export function authLoginPath(): string {
  return `${AUTH_API_PREFIX}/login`;
}

export function authMePath(): string {
  return `${AUTH_API_PREFIX}/me`;
}

export function authLogoutPath(): string {
  return `${AUTH_API_PREFIX}/logout`;
}
