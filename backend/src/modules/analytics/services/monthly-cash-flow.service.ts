import { memoizeShortLived } from '../../../shared/short-lived-memo.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { collectCashCategoryExternalIds } from '../domain/cash-realized-category-composition.js';
import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
  formatCivilDateKey,
} from '../domain/civil-calendar.js';
import { calculateMonthlyCashFlow } from '../domain/monthly-cash-flow.js';
import type { GetMonthlyCashFlowInput, MonthlyCashFlow } from '../domain/types.js';

export type MonthlyCashFlowService = {
  getMonthlyCashFlow(input: GetMonthlyCashFlowInput): Promise<MonthlyCashFlow>;
};

export type MonthlyCashFlowServiceDependencies = {
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
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

      // CASH-4C-CAT: join sempre — composição D8 precisa de PAID e de parcelas filtradas.
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

      const base = {
        tenantId,
        today,
        from,
        to,
        settlements: settlementSources,
        receivables,
        payables,
        realizedInstallments,
        categories,
        categoryFilter: categoryFilter ?? null,
      };

      if (costCenterId === undefined) {
        return calculateMonthlyCashFlow(base);
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

      return calculateMonthlyCashFlow({
        ...base,
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

/** Janela do cache de leitura do fluxo mensal (dados só mudam no sync, que roda de hora em hora). */
export const MONTHLY_CASH_FLOW_CACHE_TTL_MS = 15_000;

/**
 * Deduplica e guarda por poucos segundos o mesmo fluxo mensal. Uma navegação da Home pede o
 * mesmo (tenant, mês, centro, categoria) várias vezes em paralelo — cards, histórico de 12 meses,
 * meta (6 meses) e teto. Chave inclui tenant e o dia civil (vencido depende de hoje).
 * shortcut: até 15 s de defasagem logo após um sync; trocar por invalidação no fim do sync se incomodar.
 */
export function withShortLivedMonthlyCashFlowCache(
  service: MonthlyCashFlowService,
  options: { readonly ttlMs?: number; readonly clock?: () => number } = {},
): MonthlyCashFlowService {
  return {
    getMonthlyCashFlow: memoizeShortLived((input: GetMonthlyCashFlowInput) => service.getMonthlyCashFlow(input), {
      ttlMs: options.ttlMs ?? MONTHLY_CASH_FLOW_CACHE_TTL_MS,
      ...(options.clock ? { clock: options.clock } : {}),
      keyOf: (input, now) =>
        JSON.stringify([
          input.tenantId.trim(),
          input.integrationId ?? null,
          input.monthKey ?? null,
          input.costCenterId ?? null,
          input.categoryFilter ?? null,
          formatCivilDateKey(civilTodayInSaoPaulo(input.now ?? new Date(now))),
        ]),
    }),
  };
}
