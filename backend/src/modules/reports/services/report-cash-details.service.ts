import { assertTenantId } from '../../finance/repositories/read-query.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { collectCashCategoryExternalIds } from '../../analytics/domain/cash-realized-category-composition.js';
import { civilMonthBoundsFromKey } from '../../analytics/domain/civil-calendar.js';
import type { DashboardCategoryFilter } from '../../analytics/domain/dashboard-home-filters.js';
import type { CalculateMonthlyCashFlowInput } from '../../analytics/domain/monthly-cash-flow.js';
import {
  buildReportCashDetails,
  clampReportCashDetailsLimit,
  clampReportCashDetailsOffset,
  collectReportCashDetailUniverse,
  type ReportCashDetails,
  type ReportCashDetailsUniverse,
  type ReportDetailDirection,
  type ReportDetailSituation,
} from '../domain/report-cash-details.js';

export type GetReportCashDetailsInput = {
  readonly tenantId: string;
  readonly direction: ReportDetailDirection;
  readonly fromKey: string;
  readonly toKey: string;
  readonly situation: ReportDetailSituation;
  readonly costCenterId?: string;
  readonly categoryFilter?: DashboardCategoryFilter | null;
  readonly limit?: number;
  readonly offset?: number;
  readonly now?: Date;
};

export type ReportCashDetailsService = {
  getReportCashDetails(input: GetReportCashDetailsInput): Promise<ReportCashDetails>;
  /** Universo sem paginação — fonte canônica para exporters futuros. */
  listAllReportCashDetails(
    input: Omit<GetReportCashDetailsInput, 'limit' | 'offset'>,
  ): Promise<ReportCashDetailsUniverse>;
};

export type ReportCashDetailsServiceDependencies = {
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  readonly parties: PartyReadRepository;
  readonly costCenters: CostCenterReadRepository;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
};

function installmentMap(
  kind: 'RECEIVABLE' | 'PAYABLE',
  rows: readonly FinancialInstallmentReadRecord[],
): Map<string, FinancialInstallmentReadRecord> {
  const map = new Map<string, FinancialInstallmentReadRecord>();
  for (const row of rows) {
    map.set(`${kind}:${row.externalId}`, row);
  }
  return map;
}

function requireAllocations(
  deps: ReportCashDetailsServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

async function loadCashFlowInput(
  deps: ReportCashDetailsServiceDependencies,
  input: GetReportCashDetailsInput,
): Promise<{
  readonly cashFlowInput: CalculateMonthlyCashFlowInput;
  readonly partyNames: ReadonlyMap<string, string>;
  readonly costCenterNamesByInstallment: ReadonlyMap<string, readonly string[]>;
  readonly filteredCostCenterName: string | null;
}> {
  assertTenantId(input.tenantId);
  const today = civilTodayInSaoPaulo(input.now ?? new Date());
  const from = civilMonthBoundsFromKey(input.fromKey).from;
  const to = civilMonthBoundsFromKey(input.toKey).to;
  const tenantId = input.tenantId.trim();
  const scope = { tenantId };
  const categoryFilter = input.categoryFilter ?? null;
  const costCenterId = input.costCenterId;

  const [settlements, receivables, payables] = await Promise.all([
    deps.ledger.listActiveByOccurredOn({ ...scope, from, to }),
    deps.receivables.findActiveByTenant(scope),
    deps.payables.findActiveByTenant(scope),
  ]);

  const settlementSources = settlements.map((row) => ({
    settlementExternalId: row.externalId,
    installmentExternalId: row.installmentExternalId,
    installmentKind: row.installmentKind,
    transactionType: row.transactionType,
    occurredOn: row.occurredOn,
    netAmount: row.netAmount,
  }));

  const receivableIds = [
    ...new Set(
      settlements
        .filter((row) => row.installmentKind === 'RECEIVABLE')
        .map((row) => row.installmentExternalId),
    ),
  ];
  const payableIds = [
    ...new Set(
      settlements
        .filter((row) => row.installmentKind === 'PAYABLE')
        .map((row) => row.installmentExternalId),
    ),
  ];

  const [realizedReceivables, realizedPayables] = await Promise.all([
    deps.receivables.findByExternalIds(scope, receivableIds),
    deps.payables.findByExternalIds(scope, payableIds),
  ]);

  const realizedInstallments = new Map<string, FinancialInstallmentReadRecord>([
    ...installmentMap('RECEIVABLE', realizedReceivables),
    ...installmentMap('PAYABLE', realizedPayables),
    ...installmentMap('RECEIVABLE', receivables),
    ...installmentMap('PAYABLE', payables),
  ]);

  const categoryIds = collectCashCategoryExternalIds(
    [...realizedInstallments.values()].map((row) => ({
      categoryExternalIds: row.categoryExternalIds,
    })),
  );
  const categories =
    categoryIds.length === 0
      ? []
      : await deps.categories.findByTenantAndExternalIds({
          ...scope,
          externalIds: categoryIds,
        });

  const partyIds = [
    ...new Set(
      [...realizedInstallments.values()]
        .map((row) => row.partyId)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ];
  const partyNames = await deps.parties.findNamesByIds(scope, partyIds);

  const nameKind = input.direction === 'revenue' ? 'RECEIVABLE' : 'PAYABLE';
  const nameIds =
    input.situation === 'REALIZED'
      ? nameKind === 'RECEIVABLE'
        ? receivableIds
        : payableIds
      : (nameKind === 'RECEIVABLE' ? receivables : payables).map((row) => row.externalId);

  let costCenterNamesByInstallment: ReadonlyMap<string, readonly string[]> = new Map();
  let filteredCostCenterName: string | null = null;
  let costCenter: CalculateMonthlyCashFlowInput['costCenter'];

  if (costCenterId === undefined) {
    if (deps.costCenterAllocations && nameIds.length > 0) {
      costCenterNamesByInstallment =
        await deps.costCenterAllocations.findCostCenterNamesByInstallmentExternalIds({
          ...scope,
          kind: nameKind,
          externalIds: nameIds,
        });
    }
  } else {
    const allocations = requireAllocations(deps);
    const center = await deps.costCenters.findByIdForTenant(tenantId, costCenterId);
    filteredCostCenterName = center?.name ?? null;
    const [
      expectedReceivables,
      expectedPayables,
      realizedReceivableAllocations,
      realizedPayableAllocations,
    ] = await Promise.all([
      allocations.findActiveReceivableAllocations({ ...scope, costCenterId }),
      allocations.findActivePayableAllocations({ ...scope, costCenterId }),
      allocations.findHistoricalReceivableAllocationsByExternalIds({
        ...scope,
        costCenterId,
        externalIds: receivableIds,
      }),
      allocations.findHistoricalPayableAllocationsByExternalIds({
        ...scope,
        costCenterId,
        externalIds: payableIds,
      }),
    ]);
    costCenter = {
      expectedReceivables,
      expectedPayables,
      realizedReceivables: realizedReceivableAllocations,
      realizedPayables: realizedPayableAllocations,
    };
  }

  return {
    cashFlowInput: {
      tenantId,
      today,
      from,
      to,
      settlements: settlementSources,
      receivables,
      payables,
      realizedInstallments,
      categories,
      categoryFilter,
      ...(costCenter === undefined ? {} : { costCenter }),
    },
    partyNames,
    costCenterNamesByInstallment,
    filteredCostCenterName,
  };
}

export function createReportCashDetailsService(
  deps: ReportCashDetailsServiceDependencies,
): ReportCashDetailsService {
  return {
    async getReportCashDetails(input) {
      const loaded = await loadCashFlowInput(deps, input);
      return buildReportCashDetails({
        ...loaded,
        direction: input.direction,
        situation: input.situation,
        limit: clampReportCashDetailsLimit(input.limit),
        offset: clampReportCashDetailsOffset(input.offset),
      });
    },

    async listAllReportCashDetails(input) {
      const loaded = await loadCashFlowInput(deps, input);
      return collectReportCashDetailUniverse({
        ...loaded,
        direction: input.direction,
        situation: input.situation,
      });
    },
  };
}
