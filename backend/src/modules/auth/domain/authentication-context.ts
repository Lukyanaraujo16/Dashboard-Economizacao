import type { UserRole } from './types.js';

/** Contexto autenticado persistido na sessão Redis após login. */
export type AuthenticationContext = {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly lastAccess: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
};

export type AuthenticatedPrincipal = {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
};
