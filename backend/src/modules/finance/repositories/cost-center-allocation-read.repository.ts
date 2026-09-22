import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  CompetenceDateRangeQuery,
  DueDateRangeQuery,
  FinanceReadScope,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';
import { mapPayableReadRecord, mapReceivableReadRecord } from './mappers.js';
import {
  asCostCenterPrisma,
  type AllocationWithPayableRow,
  type AllocationWithReceivableRow,
  type InstallmentJoinRow,
} from './cost-center-prisma.js';
import {
  assertTenantId,
  buildActiveInstallmentWhereForConfirmedCostCenterAllocation,
  buildMonthlyCompetenceWhereForConfirmedCostCenterAllocation,
} from './read-query.js';
import type { Prisma } from '../../../generated/prisma/client.js';

export type CostCenterAllocationInstallment = {
  readonly amount: Prisma.Decimal;
  readonly installment: FinancialInstallmentReadRecord;
};

export type CostCenterAllocationReadRepository = {
  /** CURRENT competência — só rateio com detalhe confirmado (FETCHED). */
  findReceivableAllocationsForCompetence(
    query: CompetenceDateRangeQuery & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  findPayableAllocationsForCompetence(
    query: CompetenceDateRangeQuery & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  /** CURRENT/stock — ACTIVE + detalhe confirmado. */
  findActiveReceivableAllocations(
    scope: FinanceReadScope & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  findActivePayableAllocations(
    scope: FinanceReadScope & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  /** CURRENT/forecast por dueDate — ACTIVE + detalhe confirmado. */
  findActiveReceivableAllocationsByDueDate(
    query: DueDateRangeQuery & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  findActivePayableAllocationsByDueDate(
    query: DueDateRangeQuery & { readonly costCenterId: string },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  /**
   * REALIZED/HISTORICAL (CASH-4B): último rateio persistido por externalId.
   * Não exige FETCHED nem lifecycle ACTIVE — classificação histórica do ledger.
   */
  findHistoricalReceivableAllocationsByExternalIds(
    query: FinanceReadScope & {
      readonly costCenterId: string;
      readonly externalIds: readonly string[];
    },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
  findHistoricalPayableAllocationsByExternalIds(
    query: FinanceReadScope & {
      readonly costCenterId: string;
      readonly externalIds: readonly string[];
    },
  ): Promise<readonly CostCenterAllocationInstallment[]>;
};

export function createCostCenterAllocationReadRepository(
  prisma: PrismaClient,
): CostCenterAllocationReadRepository {
  const client = asCostCenterPrisma(prisma);
  return {
    async findReceivableAllocationsForCompetence(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          receivableId: { not: null },
          receivable: buildMonthlyCompetenceWhereForConfirmedCostCenterAllocation(
            query,
            query.from,
            query.to,
          ),
        },
        include: { receivable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithReceivableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapReceivableReadRecord(asReceivable(row.receivable)),
      }));
    },

    async findPayableAllocationsForCompetence(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          payableId: { not: null },
          payable: buildMonthlyCompetenceWhereForConfirmedCostCenterAllocation(
            query,
            query.from,
            query.to,
          ),
        },
        include: { payable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithPayableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapPayableReadRecord(asPayable(row.payable)),
      }));
    },

    async findActiveReceivableAllocations(scope) {
      assertTenantId(scope.tenantId);
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: scope.tenantId,
          costCenterId: scope.costCenterId,
          receivableId: { not: null },
          receivable: buildActiveInstallmentWhereForConfirmedCostCenterAllocation(scope),
        },
        include: { receivable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithReceivableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapReceivableReadRecord(asReceivable(row.receivable)),
      }));
    },

    async findActivePayableAllocations(scope) {
      assertTenantId(scope.tenantId);
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: scope.tenantId,
          costCenterId: scope.costCenterId,
          payableId: { not: null },
          payable: buildActiveInstallmentWhereForConfirmedCostCenterAllocation(scope),
        },
        include: { payable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithPayableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapPayableReadRecord(asPayable(row.payable)),
      }));
    },

    async findActiveReceivableAllocationsByDueDate(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          receivableId: { not: null },
          receivable: {
            ...buildActiveInstallmentWhereForConfirmedCostCenterAllocation(query),
            dueDate: { gte: query.from, lte: query.to },
          },
        },
        include: { receivable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithReceivableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapReceivableReadRecord(asReceivable(row.receivable)),
      }));
    },

    async findActivePayableAllocationsByDueDate(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          payableId: { not: null },
          payable: {
            ...buildActiveInstallmentWhereForConfirmedCostCenterAllocation(query),
            dueDate: { gte: query.from, lte: query.to },
          },
        },
        include: { payable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithPayableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapPayableReadRecord(asPayable(row.payable)),
      }));
    },

    async findHistoricalReceivableAllocationsByExternalIds(query) {
      assertTenantId(query.tenantId);
      const unique = [...new Set(query.externalIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const receivableWhere: Prisma.ReceivableWhereInput = {
        tenantId: query.tenantId,
        externalId: { in: unique },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        receivableWhere.integrationId = query.integrationId;
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          receivableId: { not: null },
          receivable: receivableWhere,
        },
        include: { receivable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithReceivableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapReceivableReadRecord(asReceivable(row.receivable)),
      }));
    },

    async findHistoricalPayableAllocationsByExternalIds(query) {
      assertTenantId(query.tenantId);
      const unique = [...new Set(query.externalIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const payableWhere: Prisma.PayableWhereInput = {
        tenantId: query.tenantId,
        externalId: { in: unique },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        payableWhere.integrationId = query.integrationId;
      }
      const rows = (await client.installmentCostCenterAllocation.findMany({
        where: {
          tenantId: query.tenantId,
          costCenterId: query.costCenterId,
          payableId: { not: null },
          payable: payableWhere,
        },
        include: { payable: true },
        orderBy: [{ id: 'asc' }],
      })) as AllocationWithPayableRow[];
      return rows.map((row) => ({
        amount: row.amount,
        installment: mapPayableReadRecord(asPayable(row.payable)),
      }));
    },
  };
}

/** Mapper Prisma espera o model tipado; InstallmentJoinRow carrega os mesmos campos. */
function asReceivable(row: InstallmentJoinRow) {
  return row as unknown as Parameters<typeof mapReceivableReadRecord>[0];
}

function asPayable(row: InstallmentJoinRow) {
  return row as unknown as Parameters<typeof mapPayableReadRecord>[0];
}
