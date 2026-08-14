/**
 * Perfis de acesso da plataforma.
 * Mapeamento documental (docs/09.7): USER → tenant_user, ADMIN → admin, SUPER_ADMIN → superadmin.
 */
export const USER_ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED', 'DISABLED'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/** Leitura pública do usuário — nunca inclui passwordHash. */
export type UserRecord = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly name: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly role: UserRole;
  readonly lastLoginAt: Date | null;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly passwordConfiguredAt: Date | null;
  readonly firstAccessCompletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt: Date | null;
};

/** Uso interno apenas — não retornar em DTO/API. */
export type UserCredentialRecord = {
  readonly id: string;
  readonly userId: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateUserInput = {
  readonly name: string;
  readonly email: string;
  readonly status?: UserStatus;
  readonly role: UserRole;
  readonly tenantId?: string | null;
};
