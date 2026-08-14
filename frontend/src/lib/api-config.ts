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

/** Prefixo same-origin das rotas administrativas de plataforma. */
export const ADMIN_API_PREFIX = '/admin';

export function adminTenantsPath(): string {
  return `${ADMIN_API_PREFIX}/tenants`;
}

export function adminTenantPath(tenantId: string): string {
  return `${adminTenantsPath()}/${tenantId}`;
}

export function adminTenantDisablePath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/disable`;
}

export function adminTenantReactivatePath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/reactivate`;
}
