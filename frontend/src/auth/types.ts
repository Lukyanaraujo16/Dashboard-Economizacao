export type AuthenticatedUserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

/** Identidade pública hidratada via GET /auth/me. */
export type AuthenticatedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AuthenticatedUserRole;
  readonly tenantId: string | null;
};

export type SupportState =
  | { readonly active: false }
  | {
      readonly active: true;
      readonly tenantId: string;
      readonly tenantDisplayName: string;
      readonly startedAt: string;
      readonly supportSessionId: string;
    };

export type AuthMeResponse = {
  readonly user: AuthenticatedUser;
  readonly support: SupportState;
};

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';
