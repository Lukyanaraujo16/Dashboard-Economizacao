export { AuthProvider, useAuth } from './auth-provider';
export type { AuthContextValue, RefreshSessionResult } from './auth-provider';
export { RequireSession } from './require-session';
export { RequirePlatformRole } from './require-platform-role';
export { RequireTenantSurface } from './require-tenant-surface';
export { isPlatformRole } from './platform-roles';
export {
  PLATFORM_LANDING_PATH,
  TENANT_HOME_PATH,
  canUseTenantSurfaces,
  resolveAuthenticatedHomePath,
} from './tenant-surfaces';
export type {
  AuthMeResponse,
  AuthenticatedUser,
  AuthenticatedUserRole,
  AuthStatus,
  SupportState,
} from './types';
