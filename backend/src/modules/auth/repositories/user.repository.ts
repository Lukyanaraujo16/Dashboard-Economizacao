import type { PrismaClient } from '../../../generated/prisma/client.js';
import { normalizeEmail } from '../domain/email.js';
import { assertUserTenantRoleConsistency } from '../domain/user-invariants.js';
import type { CreateUserInput, UserRecord } from '../domain/types.js';
import { mapUserRecord } from './mappers.js';

export type UserRepository = {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
};

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
  };
}
