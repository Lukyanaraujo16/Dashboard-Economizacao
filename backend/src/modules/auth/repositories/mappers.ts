import type { Tenant, User, UserCredential } from '../../../generated/prisma/client.js';
import type {
  TenantRecord,
  TenantStatus,
  UserCredentialRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from '../domain/types.js';

export function mapTenantRecord(row: Tenant): TenantRecord {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    status: row.status as TenantStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deactivatedAt: row.deactivatedAt,
  };
}

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
