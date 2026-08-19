import type { FinancialInstallmentStatus, Prisma } from '../../../generated/prisma/client.js';

export type InstallmentStockSnapshot = {
  readonly open: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
  readonly upcoming: Prisma.Decimal;
};

export type ReceivableDelinquency = {
  readonly overdueUnpaid: Prisma.Decimal;
  readonly openUnpaid: Prisma.Decimal;
  readonly rate: Prisma.Decimal | null;
};

export type FinancialStockSnapshot = {
  readonly tenantId: string;
  readonly today: Date;
  readonly receivables: InstallmentStockSnapshot;
  readonly payables: InstallmentStockSnapshot;
  readonly receivableDelinquency: ReceivableDelinquency;
};

export type GetFinancialStockSnapshotInput = {
  readonly tenantId: string;
  readonly now?: Date;
  readonly integrationId?: string;
};

export type GetUpcomingInstallmentsInput = GetFinancialStockSnapshotInput & {
  readonly nDays: number;
};

export type UpcomingInstallment = {
  readonly id: string;
  readonly dueDate: Date;
  readonly unpaid: Prisma.Decimal;
  readonly status: FinancialInstallmentStatus;
};

export type UpcomingInstallments = {
  readonly tenantId: string;
  readonly today: Date;
  readonly nDays: number;
  readonly from: Date;
  readonly to: Date;
  readonly items: readonly UpcomingInstallment[];
};

export type ForecastBucket = {
  readonly key: string;
  readonly inflows: Prisma.Decimal;
  readonly outflows: Prisma.Decimal;
  readonly net: Prisma.Decimal;
};

export type CashFlowForecast = {
  readonly tenantId: string;
  readonly today: Date;
  readonly horizonDays: number;
  readonly from: Date;
  readonly to: Date;
  readonly buckets: readonly ForecastBucket[];
};
