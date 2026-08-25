import { isPlatformRole } from './platform-roles';
import type { AuthenticatedUser, SupportState } from './types';

/** Home financeira do tenant (USER ou operador em Support Mode). */
export const TENANT_HOME_PATH = '/';

/** Landing operacional da plataforma sem overlay de suporte. */
export const PLATFORM_LANDING_PATH = '/empresas';

/**
 * Superfícies financeiras de tenant (Dashboard / Relatórios).
 * USER do tenant, ou ADMIN/SUPER_ADMIN com Support Mode ativo.
 */
export function canUseTenantSurfaces(
  user: AuthenticatedUser | null,
  support: SupportState,
): boolean {
  if (!user) {
    return false;
  }
  if (support.active) {
    return true;
  }
  return user.role === 'USER';
}

/**
 * Destino pós-login e pós-hidratação em `/login`.
 * USER → `/`. Papel de plataforma sem Support Mode → `/empresas`.
 */
export function resolveAuthenticatedHomePath(
  user: AuthenticatedUser,
  support: SupportState,
): string {
  if (isPlatformRole(user.role) && !support.active) {
    return PLATFORM_LANDING_PATH;
  }
  return TENANT_HOME_PATH;
}
