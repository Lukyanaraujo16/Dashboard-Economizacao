import { canUseTenantSurfaces } from '../../auth';
import type { AuthenticatedUser, SupportState } from '../../auth/types';

export type ConsultantUiState = 'CLOSED' | 'OPEN' | 'LOADING' | 'ERROR' | 'UNAVAILABLE';

export const CONSULTANT_UNAVAILABLE_MESSAGE = 'O Consultor está temporariamente indisponível.';

function isExcludedConsultantPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/empresas' ||
    pathname.startsWith('/empresas/') ||
    pathname === '/administradores' ||
    pathname.startsWith('/administradores/') ||
    pathname === '/configuracoes' ||
    pathname.startsWith('/configuracoes/')
  );
}

/** Superfícies tenant do Consultor: home e relatórios. */
export function isConsultantTenantSurfacePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/relatorios' || pathname.startsWith('/relatorios/');
}

export function shouldShowConsultantHost(
  pathname: string,
  user: AuthenticatedUser | null,
  support: SupportState,
): boolean {
  if (!canUseTenantSurfaces(user, support)) {
    return false;
  }
  if (isExcludedConsultantPath(pathname)) {
    return false;
  }
  return isConsultantTenantSurfacePath(pathname);
}

export function resolveOperationalConsultantTenantId(
  user: AuthenticatedUser | null,
  support: SupportState,
): string | null {
  if (support.active) {
    return support.tenantId;
  }
  if (user?.tenantId) {
    return user.tenantId;
  }
  return null;
}
