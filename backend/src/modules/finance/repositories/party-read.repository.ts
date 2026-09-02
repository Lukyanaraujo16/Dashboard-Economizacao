import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { FinanceReadScope } from '../domain/types.js';
import { assertTenantId } from './read-query.js';

export type PartyReadRepository = {
  findNamesByIds(
    scope: FinanceReadScope,
    partyIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
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
  };
}
