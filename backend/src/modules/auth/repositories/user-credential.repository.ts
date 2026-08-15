import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { UserCredentialRecord } from '../domain/types.js';
import { mapUserCredentialRecord } from './mappers.js';

export type CreateUserCredentialInput = {
  readonly userId: string;
  /** Hash já computado — nunca senha em texto puro. */
  readonly passwordHash: string;
};

/**
 * Acesso interno ao hash. Não usar em leituras públicas / DTO.
 */
export type UserCredentialRepository = {
  create(input: CreateUserCredentialInput): Promise<UserCredentialRecord>;
  findByUserId(userId: string): Promise<UserCredentialRecord | null>;
  /** Atualiza ou cria credencial com hash já computado (redefinição administrativa). */
  upsertPasswordHash(userId: string, passwordHash: string): Promise<UserCredentialRecord>;
};

export function createUserCredentialRepository(prisma: PrismaClient): UserCredentialRepository {
  return {
    async create(input) {
      if (input.passwordHash.length === 0) {
        throw new Error('passwordHash não pode ser vazio.');
      }

      const row = await prisma.userCredential.create({
        data: {
          userId: input.userId,
          passwordHash: input.passwordHash,
        },
      });

      return mapUserCredentialRecord(row);
    },

    async findByUserId(userId) {
      const row = await prisma.userCredential.findUnique({ where: { userId } });
      return row ? mapUserCredentialRecord(row) : null;
    },

    async upsertPasswordHash(userId, passwordHash) {
      if (passwordHash.length === 0) {
        throw new Error('passwordHash não pode ser vazio.');
      }

      const row = await prisma.userCredential.upsert({
        where: { userId },
        create: { userId, passwordHash },
        update: { passwordHash },
      });

      return mapUserCredentialRecord(row);
    },
  };
}
