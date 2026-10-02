import type { PartyProfile, PrismaClient } from '../../../generated/prisma/client.js';
import type { FinanceReadScope } from '../domain/types.js';
import { assertTenantId } from './read-query.js';

export type PartyIdentityReadRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly name: string;
  readonly profiles: readonly PartyProfile[];
};

export type PartyOfficialLabel = {
  readonly name: string;
  readonly document: string | null;
};

export type PartyReadRepository = {
  findNamesByIds(
    scope: FinanceReadScope,
    partyIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
  findIdentitiesByIds(
    scope: FinanceReadScope,
    partyIds: readonly string[],
  ): Promise<readonly PartyIdentityReadRecord[]>;
  findOfficialLabelsByIds(
    scope: FinanceReadScope,
    partyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PartyOfficialLabel>>;
};

export function createPartyReadRepository(prisma: PrismaClient): PartyReadRepository {
  return {
    async findNamesByIds(scope, partyIds) {
      assertTenantId(scope.tenantId);
      const unique = [...new Set(partyIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return new Map();
      }
      const where = {
        tenantId: scope.tenantId,
        id: { in: unique },
        ...(scope.integrationId !== undefined && scope.integrationId.trim() !== ''
          ? { integrationId: scope.integrationId }
          : {}),
      };
      const rows = await prisma.party.findMany({
        where,
        select: { id: true, name: true },
      });
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    async findIdentitiesByIds(scope, partyIds) {
      assertTenantId(scope.tenantId);
      const unique = [...new Set(partyIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const where = {
        tenantId: scope.tenantId,
        id: { in: unique },
        ...(scope.integrationId !== undefined && scope.integrationId.trim() !== ''
          ? { integrationId: scope.integrationId }
          : {}),
      };
      const rows = await prisma.party.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          integrationId: true,
          name: true,
          profiles: true,
        },
      });
      return rows;
    },

    async findOfficialLabelsByIds(scope, partyIds) {
      assertTenantId(scope.tenantId);
      const unique = [...new Set(partyIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return new Map();
      }
      const where = {
        tenantId: scope.tenantId,
        id: { in: unique },
        ...(scope.integrationId !== undefined && scope.integrationId.trim() !== ''
          ? { integrationId: scope.integrationId }
          : {}),
      };
      const rows = await prisma.party.findMany({
        where,
        select: { id: true, name: true, document: true },
      });
      return new Map(
        rows.map((row) => [
          row.id,
          {
            name: row.name,
            document: row.document?.trim() ? row.document.trim() : null,
          },
        ]),
      );
    },
  };
}
