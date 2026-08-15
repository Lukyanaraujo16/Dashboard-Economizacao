import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AUTH_MAX_FAILED_LOGIN_ATTEMPTS, computeLockoutUntil } from '../domain/auth-lockout.js';
import { normalizeEmail } from '../domain/email.js';
import {
  AuthDomainError,
  assertCanBlockUser,
  assertCanDisableUser,
  assertCanEnableUser,
  assertCanUnblockUser,
  assertNotRemovingLastActiveAdmin,
  assertUserStatusDeactivatedAtConsistency,
  assertUserTenantRoleConsistency,
  buildBlockedUserFields,
  buildDisabledUserFields,
  buildEnabledUserFields,
  buildUnblockedUserFields,
  isOperationalActiveAdmin,
} from '../domain/user-invariants.js';
import {
  normalizeCreateUserInput,
  normalizeUpdateUserInput,
} from '../domain/user-normalization.js';
import type {
  CreateUserInput,
  ListUsersFilter,
  ListUsersResult,
  UpdateUserInput,
  UserRecord,
} from '../domain/types.js';
import { mapUserRecord } from './mappers.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

function resolveListPagination(filter: ListUsersFilter): { limit: number; offset: number } {
  const limit =
    filter.limit === undefined
      ? DEFAULT_LIST_LIMIT
      : Math.min(Math.max(filter.limit, 1), MAX_LIST_LIMIT);
  const offset = filter.offset === undefined ? 0 : Math.max(filter.offset, 0);
  return { limit, offset };
}

function buildListWhere(filter: ListUsersFilter): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (filter.roles && filter.roles.length > 0) {
    where.role = { in: [...filter.roles] };
  } else if (filter.role !== undefined) {
    where.role = filter.role;
  }

  if (filter.statuses && filter.statuses.length > 0) {
    where.status = { in: [...filter.statuses] };
  } else if (filter.status !== undefined) {
    where.status = filter.status;
  }

  if (filter.tenantId !== undefined) {
    where.tenantId = filter.tenantId;
  }

  if (filter.email !== undefined) {
    where.email = { contains: normalizeEmail(filter.email), mode: 'insensitive' };
  }

  return where;
}

export type UserRepository = {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  existsByEmail(email: string, excludeId?: string): Promise<boolean>;
  /** Existe ao menos um usuário vinculado ao tenant (qualquer status/role USER). */
  existsByTenantId(tenantId: string): Promise<boolean>;
  /**
   * Contagem de ADMINs com status ACTIVE (docs/16 §9.1).
   * SUPER_ADMIN não entra. Enforcement do último ADMIN fica para 1.4C.
   */
  countActiveAdmins(): Promise<number>;
  list(filter?: ListUsersFilter): Promise<ListUsersResult>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, input: UpdateUserInput): Promise<UserRecord>;
  block(id: string): Promise<UserRecord>;
  unblock(id: string): Promise<UserRecord>;
  disable(id: string, at?: Date): Promise<UserRecord>;
  enable(id: string): Promise<UserRecord>;
  setPasswordConfiguredAt(id: string, at?: Date): Promise<UserRecord>;
  /** Recupera bloqueio temporário expirado de forma determinística (SELECT FOR UPDATE). */
  recoverExpiredTemporaryLockout(userId: string, now: Date): Promise<UserRecord>;
  /** Incrementa falhas e aplica bloqueio na 5ª tentativa sob lock de linha. */
  registerFailedPasswordAttempt(userId: string, now: Date): Promise<UserRecord>;
  /** Após login bem-sucedido: zera lockout e atualiza lastLoginAt. */
  registerSuccessfulLogin(userId: string, now: Date): Promise<UserRecord>;
};

async function lockUserRow(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE
  `;
}

/**
 * Trava todos os ADMINs ACTIVE em ordem estável (FOR UPDATE).
 * Usado antes de mutações que possam reduzir a contagem operacional (1.4C).
 */
async function lockActiveAdminRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM users
    WHERE role = 'ADMIN' AND status = 'ACTIVE'
    ORDER BY id
    FOR UPDATE
  `;
}

async function requireUser(tx: Prisma.TransactionClient, id: string): Promise<UserRecord> {
  const row = await tx.user.findUnique({ where: { id } });
  if (!row) {
    throw new AuthDomainError('USER_NOT_FOUND', 'Usuário não encontrado.');
  }
  return mapUserRecord(row);
}

async function assertLastActiveAdminGuard(
  tx: Prisma.TransactionClient,
  user: UserRecord,
): Promise<void> {
  if (!isOperationalActiveAdmin(user)) {
    return;
  }
  const activeAdminCount = await tx.user.count({
    where: { role: 'ADMIN', status: 'ACTIVE' },
  });
  assertNotRemovingLastActiveAdmin(user, activeAdminCount);
}

/**
 * Repositório de leitura/escrita do usuário (auth + administração 1.4B).
 * Leituras comuns nunca incluem passwordHash (credencial é tabela separada).
 */
export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findById(id) {
      const row = await prisma.user.findUnique({ where: { id } });
      return row ? mapUserRecord(row) : null;
    },

    async findByEmail(email) {
      const normalized = normalizeEmail(email);
      const row = await prisma.user.findUnique({ where: { email: normalized } });
      return row ? mapUserRecord(row) : null;
    },

    async existsByEmail(email, excludeId) {
      const normalized = normalizeEmail(email);
      const row = await prisma.user.findFirst({
        where: {
          email: normalized,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      return row !== null;
    },

    async existsByTenantId(tenantId) {
      const row = await prisma.user.findFirst({
        where: { tenantId },
        select: { id: true },
      });
      return row !== null;
    },

    async countActiveAdmins() {
      return prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE' },
      });
    },

    async list(filter = {}) {
      const { limit, offset } = resolveListPagination(filter);
      const where = buildListWhere(filter);

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
        }),
        prisma.user.count({ where }),
      ]);

      return {
        items: rows.map(mapUserRecord),
        total,
        limit,
        offset,
      };
    },

    async create(input) {
      const normalized = normalizeCreateUserInput(input);
      const tenantId = normalized.tenantId ?? null;
      assertUserTenantRoleConsistency(normalized.role, tenantId);

      const status = normalized.status ?? 'PENDING';
      const deactivatedAt = status === 'DISABLED' ? new Date() : null;
      assertUserStatusDeactivatedAtConsistency(status, deactivatedAt);

      const row = await prisma.user.create({
        data: {
          name: normalized.name,
          email: normalized.email,
          status,
          role: normalized.role,
          tenantId,
          deactivatedAt,
        },
      });

      return mapUserRecord(row);
    },

    async update(id, input) {
      const normalized = normalizeUpdateUserInput(input);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        throw new AuthDomainError('USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      const row = await prisma.user.update({
        where: { id },
        data: {
          ...(normalized.name !== undefined ? { name: normalized.name } : {}),
          ...(normalized.email !== undefined ? { email: normalized.email } : {}),
        },
      });
      return mapUserRecord(row);
    },

    async block(id) {
      return prisma.$transaction(async (tx) => {
        // Ordem estável: ADMINs ACTIVE primeiro (anti-deadlock), depois o alvo.
        await lockActiveAdminRows(tx);
        await lockUserRow(tx, id);
        const user = await requireUser(tx, id);
        assertCanBlockUser(user);
        await assertLastActiveAdminGuard(tx, user);
        const fields = buildBlockedUserFields();
        const updated = await tx.user.update({
          where: { id },
          data: fields,
        });
        return mapUserRecord(updated);
      });
    },

    async unblock(id) {
      return prisma.$transaction(async (tx) => {
        await lockUserRow(tx, id);
        const user = await requireUser(tx, id);
        assertCanUnblockUser(user);
        const fields = buildUnblockedUserFields();
        const updated = await tx.user.update({
          where: { id },
          data: fields,
        });
        return mapUserRecord(updated);
      });
    },

    async disable(id, at = new Date()) {
      return prisma.$transaction(async (tx) => {
        await lockActiveAdminRows(tx);
        await lockUserRow(tx, id);
        const user = await requireUser(tx, id);
        assertCanDisableUser(user);
        await assertLastActiveAdminGuard(tx, user);
        const fields = buildDisabledUserFields(at);
        assertUserStatusDeactivatedAtConsistency(fields.status, fields.deactivatedAt);
        const updated = await tx.user.update({
          where: { id },
          data: fields,
        });
        return mapUserRecord(updated);
      });
    },

    async enable(id) {
      return prisma.$transaction(async (tx) => {
        await lockUserRow(tx, id);
        const user = await requireUser(tx, id);
        assertCanEnableUser(user);
        const fields = buildEnabledUserFields();
        assertUserStatusDeactivatedAtConsistency(fields.status, fields.deactivatedAt);
        const updated = await tx.user.update({
          where: { id },
          data: fields,
        });
        return mapUserRecord(updated);
      });
    },

    async setPasswordConfiguredAt(id, at = new Date()) {
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        throw new AuthDomainError('USER_NOT_FOUND', 'Usuário não encontrado.');
      }
      const row = await prisma.user.update({
        where: { id },
        data: { passwordConfiguredAt: at },
      });
      return mapUserRecord(row);
    },

    async recoverExpiredTemporaryLockout(userId, now) {
      return prisma.$transaction(async (tx) => {
        await lockUserRow(tx, userId);
        const row = await tx.user.findUnique({ where: { id: userId } });
        if (!row) {
          throw new Error('Usuário não encontrado durante recuperação de lockout.');
        }

        if (
          row.status === 'BLOCKED' &&
          row.lockedUntil !== null &&
          row.lockedUntil.getTime() <= now.getTime()
        ) {
          const updated = await tx.user.update({
            where: { id: userId },
            data: {
              status: 'ACTIVE',
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });
          return mapUserRecord(updated);
        }

        return mapUserRecord(row);
      });
    },

    async registerFailedPasswordAttempt(userId, now) {
      return prisma.$transaction(async (tx) => {
        await lockUserRow(tx, userId);
        const row = await tx.user.findUnique({ where: { id: userId } });
        if (!row) {
          throw new Error('Usuário não encontrado durante registro de falha.');
        }

        const attempts = row.failedLoginAttempts + 1;
        const shouldLock = attempts >= AUTH_MAX_FAILED_LOGIN_ATTEMPTS;

        const updated = await tx.user.update({
          where: { id: userId },
          data: shouldLock
            ? {
                failedLoginAttempts: attempts,
                status: 'BLOCKED',
                lockedUntil: computeLockoutUntil(now),
              }
            : {
                failedLoginAttempts: attempts,
              },
        });

        return mapUserRecord(updated);
      });
    },

    async registerSuccessfulLogin(userId, now) {
      return prisma.$transaction(async (tx) => {
        await lockUserRow(tx, userId);
        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        });
        return mapUserRecord(updated);
      });
    },
  };
}
