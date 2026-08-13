import type { UserRole } from './types.js';

/** Contexto autenticado persistido na sessão Redis após login (1.1D). */
export type AuthenticationContext = {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly lastAccess: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
};

/**
 * Contexto de request autenticado (1.1E).
 * Derivado da sessão server-side + validação de status no PostgreSQL.
 */
export type AuthenticatedRequestContext = {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
  readonly sessionId: string;
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
