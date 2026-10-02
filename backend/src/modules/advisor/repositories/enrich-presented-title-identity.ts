import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  blankToNull,
  mergeOfficialTitleIdentity,
  readOfficialTitleIdentity,
  type OfficialTitleIdentity,
} from '../domain/title-official-identity.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Completa a identificação humana a partir do ledger local do tenant.
 * Não chama a Conta Azul e não inventa campo ausente.
 */
export async function enrichPresentedTitleSupportingData(
  prisma: PrismaClient,
  tenantId: string,
  supportingData: unknown,
): Promise<unknown> {
  if (!isRecord(supportingData)) {
    return supportingData;
  }
  const kind = supportingData.titleKind;
  const externalId = blankToNull(supportingData.externalId);
  if ((kind !== 'PAYABLE' && kind !== 'RECEIVABLE') || externalId === null) {
    return supportingData;
  }
  const current = readOfficialTitleIdentity(supportingData);
  if (
    current.counterpartyName &&
    current.description &&
    current.categoryName &&
    current.documentNumber
  ) {
    return supportingData;
  }

  const rows =
    kind === 'RECEIVABLE'
      ? await prisma.receivable.findMany({
          where: { tenantId, externalId },
          select: {
            description: true,
            partyId: true,
            categoryExternalIds: true,
          },
          take: 2,
        })
      : await prisma.payable.findMany({
          where: { tenantId, externalId },
          select: {
            description: true,
            partyId: true,
            categoryExternalIds: true,
          },
          take: 2,
        });
  const row = rows.length === 1 ? rows[0] : undefined;
  if (!row) {
    return supportingData;
  }

  const party = row.partyId
    ? await prisma.party.findFirst({
        where: { id: row.partyId, tenantId },
        select: { name: true, document: true },
      })
    : null;
  const categoryExternalId = row.categoryExternalIds.find((id) => id.trim() !== '') ?? null;
  const category = categoryExternalId
    ? await prisma.financialCategory.findFirst({
        where: { tenantId, externalId: categoryExternalId },
        select: { name: true },
      })
    : null;
  const found: OfficialTitleIdentity = {
    counterpartyName: blankToNull(party?.name),
    description: blankToNull(row.description),
    categoryName: blankToNull(category?.name),
    documentNumber: blankToNull(party?.document),
  };
  return mergeOfficialTitleIdentity(supportingData, found);
}
