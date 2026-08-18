import type { UserRecord, UserRole } from '../domain/types.js';
import type { SupportState } from '../domain/support-mode.js';

/** DTO público de usuário para GET /auth/me (1.1F-E.3). */
export type PublicAuthenticatedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly tenantId: string | null;
};

export type AuthMeResponse = {
  readonly user: PublicAuthenticatedUser;
  readonly support: SupportState;
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

export function toAuthMeResponse(user: UserRecord, support: SupportState): AuthMeResponse {
  return {
    user: toPublicAuthenticatedUser(user),
    support,
  };
}
