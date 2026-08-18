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

export function authSupportEnterPath(): string {
  return `${AUTH_API_PREFIX}/support/enter`;
}

export function authSupportExitPath(): string {
  return `${AUTH_API_PREFIX}/support/exit`;
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

export function adminTenantBrandingPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/branding`;
}

export function adminTenantBrandingLogoPath(tenantId: string): string {
  return `${adminTenantBrandingPath(tenantId)}/logo`;
}

export function adminTenantContaAzulPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/integrations/conta-azul`;
}

export function adminTenantContaAzulConnectPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/connect`;
}

export function adminTenantContaAzulDisconnectPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/disconnect`;
}

export function adminTenantContaAzulVerifyPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/verify`;
}

export function adminTenantContaAzulSyncPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/sync`;
}

export function adminTenantContaAzulSyncCurrentPath(tenantId: string): string {
  return `${adminTenantContaAzulSyncPath(tenantId)}/current`;
}

/** Branding global da plataforma (1.5C/1.5D). */
export function adminPlatformBrandingPath(): string {
  return `${ADMIN_API_PREFIX}/platform/branding`;
}

export function adminPlatformBrandingLogoPath(): string {
  return `${adminPlatformBrandingPath()}/logo`;
}

export function adminPlatformBrandingFaviconPath(): string {
  return `${adminPlatformBrandingPath()}/favicon`;
}

/** Prefixo same-origin dos administradores da plataforma (1.4C). */
export function adminAdministratorsPath(): string {
  return `${ADMIN_API_PREFIX}/administrators`;
}

export function adminAdministratorPath(userId: string): string {
  return `${adminAdministratorsPath()}/${userId}`;
}

export function adminAdministratorBlockPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/block`;
}

export function adminAdministratorUnblockPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/unblock`;
}

export function adminAdministratorDisablePath(userId: string): string {
  return `${adminAdministratorPath(userId)}/disable`;
}

export function adminAdministratorEnablePath(userId: string): string {
  return `${adminAdministratorPath(userId)}/enable`;
}

export function adminAdministratorResetPasswordPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/reset-password`;
}

/** Prefixo same-origin dos usuários de uma empresa (1.4C). */
export function adminTenantUsersPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/users`;
}

export function adminTenantUserPath(tenantId: string, userId: string): string {
  return `${adminTenantUsersPath(tenantId)}/${userId}`;
}

export function adminTenantUserBlockPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/block`;
}

export function adminTenantUserUnblockPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/unblock`;
}

export function adminTenantUserDisablePath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/disable`;
}

export function adminTenantUserEnablePath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/enable`;
}

export function adminTenantUserResetPasswordPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/reset-password`;
}

/** Prefixo same-origin do branding da sessão autenticada. */
export const BRANDING_API_PREFIX = '/branding';

export function brandingCurrentPath(): string {
  return `${BRANDING_API_PREFIX}/current`;
}

/** Branding público da plataforma (login / bootstrap sem sessão). */
export function brandingPlatformPath(): string {
  return `${BRANDING_API_PREFIX}/platform`;
}
