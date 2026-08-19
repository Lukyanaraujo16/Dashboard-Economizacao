import type { Prisma } from '../../../generated/prisma/client.js';

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
