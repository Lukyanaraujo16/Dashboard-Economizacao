import { assertTenantId } from '../../finance/repositories/read-query.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { collectCashCategoryExternalIds } from '../domain/cash-realized-category-composition.js';
import {
  buildCashRealizedDetails,
  type CashRealizedCategoryKind,
  type CashRealizedDetails,
  type CashRealizedDetailsDirection,
} from '../domain/cash-realized-details.js';
import { civilMonthBounds, civilMonthBoundsFromKey, civilMonthKey } from '../domain/civil-calendar.js';
import type { GetMonthlyCashFlowInput } from '../domain/types.js';

export const CASH_REALIZED_DETAILS_DEFAULT_LIMIT = 100;
export const CASH_REALIZED_DETAILS_MAX_LIMIT = 200;

export type GetCashRealizedDetailsInput = GetMonthlyCashFlowInput & {
  readonly direction: CashRealizedDetailsDirection;
  readonly categoryKey: string;
  readonly categoryKind?: CashRealizedCategoryKind | null;
  readonly limit?: number;
  readonly offset?: number;
};

export type CashRealizedDetailsService = {
  getCashRealizedDetails(input: GetCashRealizedDetailsInput): Promise<CashRealizedDetails>;
};

export type CashRealizedDetailsServiceDependencies = {
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  readonly parties: PartyReadRepository;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
};

function resolveMonth(input: GetMonthlyCashFlowInput): {
  readonly tenantId: string;
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string;
  readonly scope: { readonly tenantId: string; readonly integrationId?: string };
  readonly costCenterId: string | undefined;
} {
  assertTenantId(input.tenantId);
  const today = civilTodayInSaoPaulo(input.now ?? new Date());
  const bounds = input.monthKey ? civilMonthBoundsFromKey(input.monthKey) : civilMonthBounds(today);
  return {
    tenantId: input.tenantId.trim(),
    today,
    from: bounds.from,
    to: bounds.to,
    monthKey: input.monthKey ?? civilMonthKey(bounds.from),
    scope: {
      tenantId: input.tenantId.trim(),
      ...(input.integrationId !== undefined && input.integrationId.trim() !== ''
        ? { integrationId: input.integrationId }
        : {}),
    },
    costCenterId: input.costCenterId,
  };
}

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
  deps: CashRealizedDetailsServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return CASH_REALIZED_DETAILS_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(0, Math.trunc(limit)), CASH_REALIZED_DETAILS_MAX_LIMIT);
}

function clampOffset(offset: number | undefined): number {
  if (offset === undefined || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

/**
 * Detalhe read-only das baixas realizadas por categoryKey.
 * Mesma carga/filtros do MonthlyCashFlowService (ledger autoridade; AR/AP metadata).
 */
export function createCashRealizedDetailsService(
  deps: CashRealizedDetailsServiceDependencies,
): CashRealizedDetailsService {
  return {
    async getCashRealizedDetails(input) {
      const { tenantId, today, from, to, monthKey, scope, costCenterId } = resolveMonth(input);
      const categoryFilter = input.categoryFilter ?? null;
      const categoryKey = input.categoryKey.trim();
      const categoryKind = input.categoryKind ?? null;
      const limit = clampLimit(input.limit);
      const offset = clampOffset(input.offset);

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

      const base = {
        tenantId,
        today,
        from,
        to,
        monthKey,
        direction: input.direction,
        categoryKey,
        categoryKind,
        settlements: settlementSources,
        realizedInstallments,
        categories,
        partyNames,
        categoryFilter,
        limit,
        offset,
      };

      if (costCenterId === undefined) {
        return buildCashRealizedDetails(base);
      }

      const allocations = requireAllocations(deps);
      const [realizedReceivableAllocations, realizedPayableAllocations] = await Promise.all([
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

      return buildCashRealizedDetails({
        ...base,
        costCenter: {
          expectedReceivables: [],
          expectedPayables: [],
          realizedReceivables: realizedReceivableAllocations,
          realizedPayables: realizedPayableAllocations,
        },
      });
    },
  };
}
