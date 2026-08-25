import type { Tenant } from '../../../generated/prisma/client.js';
import { assertTenantRecordConsistency } from '../domain/tenant-invariants.js';
import type { TenantContaAzulSummary, TenantRecord, TenantStatus } from '../domain/types.js';

export type TenantContaAzulRow = {
  readonly status: TenantContaAzulSummary['status'];
  readonly lastSuccessfulSyncAt: Date | null;
};

export function mapContaAzulSummary(
  rows: readonly TenantContaAzulRow[],
): TenantContaAzulSummary | null {
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    status: row.status,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
  };
}

export function mapTenantRecord(
  row: Tenant,
  contaAzul: TenantContaAzulSummary | null = null,
): TenantRecord {
  const record: TenantRecord = {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    status: row.status as TenantStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deactivatedAt: row.deactivatedAt,
    contaAzul,
  };

  assertTenantRecordConsistency(record);
  return record;
}
