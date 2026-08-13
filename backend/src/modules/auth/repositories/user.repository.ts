import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { AUTH_MAX_FAILED_LOGIN_ATTEMPTS, computeLockoutUntil } from '../domain/auth-lockout.js';
import { normalizeEmail } from '../domain/email.js';
import { assertUserTenantRoleConsistency } from '../domain/user-invariants.js';
import type { CreateUserInput, UserRecord } from '../domain/types.js';
import { mapUserRecord } from './mappers.js';

export type UserRepository = {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
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
 * Repositório de leitura/escrita do usuário.
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

    async create(input) {
      const tenantId = input.tenantId ?? null;
      assertUserTenantRoleConsistency(input.role, tenantId);

      const row = await prisma.user.create({
        data: {
          name: input.name,
          email: normalizeEmail(input.email),
          status: input.status ?? 'PENDING',
          role: input.role,
          tenantId,
        },
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
