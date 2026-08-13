export type AuthenticatedUserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

/** Identidade pública hidratada via GET /auth/me. */
export type AuthenticatedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AuthenticatedUserRole;
  readonly tenantId: string | null;
};

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';
