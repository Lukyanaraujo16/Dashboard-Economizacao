import { assertTenantId } from '../../finance/repositories/read-query.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { civilMonthBounds, civilMonthBoundsFromKey } from '../domain/civil-calendar.js';
import { calculateMonthlyCashFlow } from '../domain/monthly-cash-flow.js';
import type { GetMonthlyCashFlowInput, MonthlyCashFlow } from '../domain/types.js';

export type MonthlyCashFlowService = {
  getMonthlyCashFlow(input: GetMonthlyCashFlowInput): Promise<MonthlyCashFlow>;
};

export type MonthlyCashFlowServiceDependencies = {
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
};

function resolveMonth(input: GetMonthlyCashFlowInput): {
  readonly tenantId: string;
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
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
  deps: MonthlyCashFlowServiceDependencies,
): CostCenterAllocationReadRepository {
  if (!deps.costCenterAllocations) {
    throw new Error('Repositório de alocações de centro de custo é obrigatório para filtrar por centro.');
  }
  return deps.costCenterAllocations;
}

export function createMonthlyCashFlowService(
  deps: MonthlyCashFlowServiceDependencies,
): MonthlyCashFlowService {
  return {
    async getMonthlyCashFlow(input) {
      const { tenantId, today, from, to, scope, costCenterId } = resolveMonth(input);
      const categoryFilter = input.categoryFilter;

      const [settlements, receivables, payables] = await Promise.all([
        deps.ledger.listActiveByOccurredOn({ ...scope, from, to }),
        deps.receivables.findActiveByTenant(scope),
        deps.payables.findActiveByTenant(scope),
      ]);

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

      const needsRealizedJoin = categoryFilter !== undefined || costCenterId !== undefined;
      const [realizedReceivables, realizedPayables] = needsRealizedJoin
        ? await Promise.all([
            deps.receivables.findByExternalIds(scope, receivableIds),
            deps.payables.findByExternalIds(scope, payableIds),
          ])
        : [[], []];

      const realizedInstallments = new Map<string, FinancialInstallmentReadRecord>([
        ...installmentMap('RECEIVABLE', realizedReceivables),
        ...installmentMap('PAYABLE', realizedPayables),
        ...installmentMap('RECEIVABLE', receivables),
        ...installmentMap('PAYABLE', payables),
      ]);

      if (costCenterId === undefined) {
        return calculateMonthlyCashFlow({
          tenantId,
          today,
          from,
          to,
          settlements,
          receivables,
          payables,
          realizedInstallments,
          categoryFilter: categoryFilter ?? null,
        });
      }

      const allocations = requireAllocations(deps);
      const [
        expectedReceivables,
        expectedPayables,
        realizedReceivableAllocations,
        realizedPayableAllocations,
      ] = await Promise.all([
        allocations.findActiveReceivableAllocations({ ...scope, costCenterId }),
        allocations.findActivePayableAllocations({ ...scope, costCenterId }),
        allocations.findReceivableAllocationsByExternalIds({
          ...scope,
          costCenterId,
          externalIds: receivableIds,
        }),
        allocations.findPayableAllocationsByExternalIds({
          ...scope,
          costCenterId,
          externalIds: payableIds,
        }),
      ]);

      return calculateMonthlyCashFlow({
        tenantId,
        today,
        from,
        to,
        settlements,
        receivables,
        payables,
        realizedInstallments,
        categoryFilter: categoryFilter ?? null,
        costCenter: {
          expectedReceivables,
          expectedPayables,
          realizedReceivables: realizedReceivableAllocations,
          realizedPayables: realizedPayableAllocations,
        },
      });
    },
  };
}
