import type { UserRecord } from '../domain/types.js';

export type PublicUserResponse = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  readonly status: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DISABLED';
  readonly tenantId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deactivatedAt: string | null;
};

export function toPublicUserResponse(user: UserRecord): PublicUserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    tenantId: user.tenantId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
  };
}
