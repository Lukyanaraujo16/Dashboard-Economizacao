import type { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryType,
  FinancialInstallmentStatus,
} from '../../../generated/prisma/client.js';

export type FinanceReadScope = {
  readonly tenantId: string;
  readonly integrationId?: string;
};

export type DueDateRangeQuery = FinanceReadScope & {
  readonly from: Date;
  readonly to: Date;
};

export type CategoryLookupQuery = FinanceReadScope & {
  readonly externalIds: readonly string[];
};

export type FinancialInstallmentReadRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly description: string | null;
  readonly dueDate: Date;
  readonly competenceDate: Date | null;
  readonly upstreamCreatedAt: Date | null;
  readonly upstreamUpdatedAt: Date | null;
  readonly status: FinancialInstallmentStatus;
  readonly upstreamStatus: string | null;
  readonly total: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly categoryExternalIds: readonly string[];
  readonly syncedAt: Date;
};

export type FinancialCategoryReadRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly name: string;
  readonly type: FinancialCategoryType;
  readonly parentExternalId: string | null;
};
