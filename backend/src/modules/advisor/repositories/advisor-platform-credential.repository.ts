import type { PrismaClient } from '../../../generated/prisma/client.js';
import { assertAiProviderId } from '../domain/ai-provider-models.js';
import type { AiPlatformCredentialRecord, AiProviderId } from '../domain/types.js';

function toRecord(row: {
  id: string;
  provider: AiProviderId;
  encryptedSecret: string;
  createdAt: Date;
  updatedAt: Date;
}): AiPlatformCredentialRecord {
  return {
    id: row.id,
    provider: row.provider,
    encryptedSecret: row.encryptedSecret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AdvisorPlatformCredentialRepository = {
  findByProvider(provider: AiProviderId): Promise<AiPlatformCredentialRecord | null>;
  list(): Promise<readonly AiPlatformCredentialRecord[]>;
  upsert(provider: AiProviderId, encryptedSecret: string): Promise<AiPlatformCredentialRecord>;
  deleteByProvider(provider: AiProviderId): Promise<boolean>;
};

export function createAdvisorPlatformCredentialRepository(
  prisma: PrismaClient,
): AdvisorPlatformCredentialRepository {
  return {
    async findByProvider(provider) {
      assertAiProviderId(provider);
      const row = await prisma.aiPlatformCredential.findUnique({
        where: { provider },
      });
      return row === null ? null : toRecord(row);
    },

    async list() {
      const rows = await prisma.aiPlatformCredential.findMany({
        orderBy: { provider: 'asc' },
      });
      return rows.map(toRecord);
    },

    async upsert(provider, encryptedSecret) {
      assertAiProviderId(provider);
      const ciphertext = encryptedSecret.trim();
      const row = await prisma.aiPlatformCredential.upsert({
        where: { provider },
        create: {
          provider,
          encryptedSecret: ciphertext,
        },
        update: {
          encryptedSecret: ciphertext,
        },
      });
      return toRecord(row);
    },

    async deleteByProvider(provider) {
      assertAiProviderId(provider);
      const existing = await prisma.aiPlatformCredential.findUnique({
        where: { provider },
        select: { id: true },
      });
      if (existing === null) {
        return false;
      }
      await prisma.aiPlatformCredential.delete({
        where: { provider },
      });
      return true;
    },
  };
}
