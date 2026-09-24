import type { PrismaClient } from '../../../generated/prisma/client.js';
import { assertAiProviderId } from '../domain/ai-provider-models.js';
import type { AiPlatformCredentialRecord, AiProviderId } from '../domain/types.js';

function toRecord(row: {
  id: string;
  provider: AiProviderId;
  encryptedSecret: string;
  displayHint: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AiPlatformCredentialRecord {
  const hint = row.displayHint?.trim() ?? '';
  return {
    id: row.id,
    provider: row.provider,
    encryptedSecret: row.encryptedSecret,
    displayHint: hint.length === 0 ? null : hint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type UpsertAiPlatformCredentialInput = {
  readonly encryptedSecret: string;
  readonly displayHint: string;
};

export type AdvisorPlatformCredentialRepository = {
  findByProvider(provider: AiProviderId): Promise<AiPlatformCredentialRecord | null>;
  list(): Promise<readonly AiPlatformCredentialRecord[]>;
  upsert(provider: AiProviderId, input: UpsertAiPlatformCredentialInput): Promise<AiPlatformCredentialRecord>;
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

    async upsert(provider, input) {
      assertAiProviderId(provider);
      const ciphertext = input.encryptedSecret.trim();
      const displayHint = input.displayHint.trim();
      const row = await prisma.aiPlatformCredential.upsert({
        where: { provider },
        create: {
          provider,
          encryptedSecret: ciphertext,
          displayHint,
        },
        update: {
          encryptedSecret: ciphertext,
          displayHint,
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
