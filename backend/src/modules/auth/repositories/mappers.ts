import type { User, UserCredential } from '../../../generated/prisma/client.js';
import type { UserCredentialRecord, UserRecord, UserRole, UserStatus } from '../domain/types.js';

export function mapUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    email: row.email,
    status: row.status as UserStatus,
    role: row.role as UserRole,
    lastLoginAt: row.lastLoginAt,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    passwordConfiguredAt: row.passwordConfiguredAt,
    firstAccessCompletedAt: row.firstAccessCompletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deactivatedAt: row.deactivatedAt,
  };
}

export function mapUserCredentialRecord(row: UserCredential): UserCredentialRecord {
  return {
    id: row.id,
    userId: row.userId,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
