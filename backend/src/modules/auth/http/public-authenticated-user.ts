import type { UserRecord, UserRole } from '../domain/types.js';

/** DTO público de usuário para GET /auth/me (1.1F-E.3). */
export type PublicAuthenticatedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly tenantId: string | null;
};

export function toPublicAuthenticatedUser(user: UserRecord): PublicAuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };
}
