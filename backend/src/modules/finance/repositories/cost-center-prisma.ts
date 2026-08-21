import type { FinancialInstallmentStatus, Prisma, PrismaClient } from '../../../generated/prisma/client.js';

/**
 * Delegates CC1 esperados no Prisma client (schema/migration podem chegar em paralelo).
 * Após `prisma generate`, o cast alinha com `prisma.costCenter` /
 * `prisma.installmentCostCenterAllocation`.
 */
export type CostCenterRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly code: string | null;
  readonly name: string;
  readonly active: boolean;
  readonly syncedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type InstallmentCostCenterAllocationRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly costCenterId: string;
  readonly receivableId: string | null;
  readonly payableId: string | null;
  readonly amount: Prisma.Decimal;
  readonly syncedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type InstallmentJoinRow = {
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
  readonly categoryExternalIds: string[];
  readonly syncedAt: Date;
};

export type AllocationWithReceivableRow = InstallmentCostCenterAllocationRow & {
  readonly receivable: InstallmentJoinRow;
};

export type AllocationWithPayableRow = InstallmentCostCenterAllocationRow & {
  readonly payable: InstallmentJoinRow;
};

type CostCenterFindManyArgs = {
  readonly where?: { readonly tenantId?: string; readonly id?: string; readonly active?: boolean };
  readonly orderBy?: readonly Record<string, 'asc' | 'desc'>[] | Record<string, 'asc' | 'desc'>;
  readonly select?: Record<string, boolean>;
};

type CostCenterFindFirstArgs = {
  readonly where: {
    readonly id: string;
    readonly tenantId: string;
  };
  readonly select?: Record<string, boolean>;
};

type AllocationFindManyArgs = {
  readonly where: Record<string, unknown>;
  readonly include?: { readonly receivable?: boolean; readonly payable?: boolean };
  readonly orderBy?: readonly Record<string, 'asc' | 'desc'>[] | Record<string, 'asc' | 'desc'>;
};

export type CostCenterPrismaClient = {
  readonly costCenter: {
    findMany(args: CostCenterFindManyArgs): Promise<CostCenterRow[]>;
    findFirst(args: CostCenterFindFirstArgs): Promise<CostCenterRow | null>;
  };
  readonly installmentCostCenterAllocation: {
    findMany(args: AllocationFindManyArgs): Promise<
      | InstallmentCostCenterAllocationRow[]
      | AllocationWithReceivableRow[]
      | AllocationWithPayableRow[]
    >;
  };
};

export function asCostCenterPrisma(prisma: PrismaClient): CostCenterPrismaClient {
  return prisma as unknown as CostCenterPrismaClient;
}
