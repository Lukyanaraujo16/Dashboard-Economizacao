import type { AuthenticatedUserRole } from './types';

const PLATFORM_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const satisfies readonly AuthenticatedUserRole[];

export function isPlatformRole(
  role: AuthenticatedUserRole,
): role is (typeof PLATFORM_ROLES)[number] {
  return PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]);
}
