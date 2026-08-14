import type { Tenant } from '../../../generated/prisma/client.js';
import { assertTenantRecordConsistency } from '../domain/tenant-invariants.js';
import type { TenantRecord, TenantStatus } from '../domain/types.js';

export function mapTenantRecord(row: Tenant): TenantRecord {
  const record: TenantRecord = {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    status: row.status as TenantStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deactivatedAt: row.deactivatedAt,
  };

  assertTenantRecordConsistency(record);
  return record;
}
