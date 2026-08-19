import type { FinancialCategory, Payable, Receivable } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';

function mapInstallmentReadRecord(row: Receivable | Payable): FinancialInstallmentReadRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    externalId: row.externalId,
    description: row.description,
    dueDate: row.dueDate,
    competenceDate: row.competenceDate,
    upstreamCreatedAt: row.upstreamCreatedAt,
    upstreamUpdatedAt: row.upstreamUpdatedAt,
    status: row.status,
    upstreamStatus: row.upstreamStatus,
    total: row.total,
    paid: row.paid,
    unpaid: row.unpaid,
    categoryExternalIds: row.categoryExternalIds,
    syncedAt: row.syncedAt,
  };
}

export function mapReceivableReadRecord(row: Receivable): FinancialInstallmentReadRecord {
  return mapInstallmentReadRecord(row);
}

export function mapPayableReadRecord(row: Payable): FinancialInstallmentReadRecord {
  return mapInstallmentReadRecord(row);
}

export function mapFinancialCategoryReadRecord(
  row: FinancialCategory,
): FinancialCategoryReadRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    externalId: row.externalId,
    name: row.name,
    type: row.type,
    parentExternalId: row.parentExternalId,
  };
}
