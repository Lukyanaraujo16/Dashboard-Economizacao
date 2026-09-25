import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { collectAttributedCashSettlements } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { AdvisorDomainError } from './advisor-domain-error.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  isAdvisorCashDirection,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import {
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
  aggregateAdvisorCostCenterDimension,
  lookupAdvisorCostCenter,
  rankAdvisorCostCenterDimension,
  serializeAdvisorCostCenterLookup,
  serializeAdvisorCostCenterRanking,
  type AdvisorCostCenterAllocationInput,
  type AdvisorCostCenterAggregation,
} from './advisor-cost-center-dimension.js';

type AdvisorAnalyticalToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
};

const MONTH_KEY_SCHEMA = {
  type: 'string',
  description: 'Mês civil no formato YYYY-MM, já resolvido pelo contexto.',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
};

const DIRECTION_SCHEMA = {
  type: 'string',
  enum: ['INFLOW', 'OUTFLOW'],
  description:
    'INFLOW = entradas realizadas de caixa. OUTFLOW = saídas realizadas de caixa. Sem competência.',
};

const LIMIT_SCHEMA = {
  type: 'integer',
  minimum: 1,
  maximum: ADVISOR_DRILLDOWN_MAX_LIMIT,
  description: `Quantidade máxima pedida. Default ${ADVISOR_DRILLDOWN_DEFAULT_LIMIT}, teto ${ADVISOR_DRILLDOWN_MAX_LIMIT}.`,
};

const COST_CENTER_QUERY_SCHEMA = {
  type: 'string',
  description: 'Nome ou código oficial do centro já citado. Match conservador, sem fuzzy.',
};

export const CASH_COST_CENTER_RANKING_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_COST_CENTER_RANKING_TOOL_NAME,
  description:
    'Ranking oficial de centros de custo no caixa realizado do mês. População = total oficial da direção. Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'direction'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      direction: DIRECTION_SCHEMA,
      limit: LIMIT_SCHEMA,
    },
  },
};

export const CASH_COST_CENTER_LOOKUP_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  description:
    'Consulta o valor realizado de um centro de custo no caixa do mês. shareOfPopulation usa o total oficial. Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'direction', 'costCenterQuery'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      direction: DIRECTION_SCHEMA,
      costCenterQuery: COST_CENTER_QUERY_SCHEMA,
    },
  },
};

export function listAdvisorCostCenterTools(): readonly AdvisorAnalyticalToolDefinition[] {
  return [CASH_COST_CENTER_RANKING_TOOL, CASH_COST_CENTER_LOOKUP_TOOL];
}

export type AdvisorCostCenterDimensionService = {
  rank(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly direction: AdvisorCashDirection;
    readonly limit?: number;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
  lookup(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly direction: AdvisorCashDirection;
    readonly costCenterQuery: string;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
};

export function createAdvisorCostCenterDimensionService(deps: {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
  readonly costCenterAllocations: Pick<
    CostCenterAllocationReadRepository,
    'findConfirmedAllocationsByInstallmentExternalIds'
  >;
}): AdvisorCostCenterDimensionService {
  return {
    async rank(input) {
      const loaded = await loadAggregation(deps, input);
      if (loaded.status !== 'OK') {
        return loaded.payload;
      }
      return serializeAdvisorCostCenterRanking({
        status: loaded.aggregation.identifiedCardinality === 0 ? 'EMPTY_RESULT' : 'OK',
        aggregation: loaded.aggregation,
        ranking: rankAdvisorCostCenterDimension(loaded.aggregation, input.limit),
      });
    },

    async lookup(input) {
      const loaded = await loadAggregation(deps, input);
      if (loaded.status !== 'OK') {
        return loaded.payload;
      }
      const found = lookupAdvisorCostCenter(
        loaded.aggregation,
        loaded.catalog,
        input.costCenterQuery,
      );
      if (found.status === 'NOT_FOUND') {
        return serializeAdvisorCostCenterLookup({
          status: 'NOT_FOUND',
          aggregation: loaded.aggregation,
          costCenterQuery: input.costCenterQuery,
          match: null,
        });
      }
      if (found.status === 'AMBIGUOUS') {
        return serializeAdvisorCostCenterLookup({
          status: 'AMBIGUOUS',
          aggregation: loaded.aggregation,
          costCenterQuery: input.costCenterQuery,
          match: null,
          candidates: found.candidates,
        });
      }
      return serializeAdvisorCostCenterLookup({
        status: 'OK',
        aggregation: loaded.aggregation,
        costCenterQuery: input.costCenterQuery,
        match: found.center,
      });
    },
  };
}

export function assertCashCostCenterRankingArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
} {
  assertCostCenterArgs(raw, ['monthKey', 'direction', 'limit']);
  if (typeof raw.monthKey !== 'string' || typeof raw.direction !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e direction são obrigatórios.',
    );
  }
  if (!isAdvisorCashDirection(raw.direction)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'direction deve ser INFLOW ou OUTFLOW.',
    );
  }
  return {
    monthKey: requireMonth(raw.monthKey, 'monthKey'),
    direction: raw.direction,
    ...(raw.limit === undefined ? {} : { limit: requireLimit(raw.limit) }),
  };
}

export function assertCashCostCenterLookupArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
} {
  assertCostCenterArgs(raw, ['monthKey', 'direction', 'costCenterQuery']);
  if (
    typeof raw.monthKey !== 'string' ||
    typeof raw.direction !== 'string' ||
    typeof raw.costCenterQuery !== 'string'
  ) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey, direction e costCenterQuery são obrigatórios.',
    );
  }
  if (!isAdvisorCashDirection(raw.direction)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'direction deve ser INFLOW ou OUTFLOW.',
    );
  }
  return {
    monthKey: requireMonth(raw.monthKey, 'monthKey'),
    direction: raw.direction,
    costCenterQuery: requireQuery(raw.costCenterQuery),
  };
}

async function loadAggregation(
  deps: {
    readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
    readonly ledger: LedgerReadRepository;
    readonly receivables: ReceivableReadRepository;
    readonly payables: PayableReadRepository;
    readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
    readonly costCenterAllocations: Pick<
      CostCenterAllocationReadRepository,
      'findConfirmedAllocationsByInstallmentExternalIds'
    >;
  },
  input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly direction: AdvisorCashDirection;
    readonly now?: Date;
  },
): Promise<
  | {
      readonly status: 'OK';
      readonly aggregation: AdvisorCostCenterAggregation;
      readonly catalog: readonly { id: string; name: string; code: string | null }[];
    }
  | { readonly status: 'UNAVAILABLE'; readonly payload: Record<string, unknown> }
> {
  const tenantId = requireTenant(input.tenantId);
  const monthKey = requireMonth(input.monthKey, 'monthKey');
  const now = input.now ?? new Date();
  const today = civilTodayInSaoPaulo(now);
  const scope = { tenantId };
  const flow = await deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now });
  if (flow.tenantId !== tenantId) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_FORBIDDEN',
      'Dimensão de centro de custo recusou fluxo de outro tenant.',
    );
  }
  const population =
    input.direction === 'INFLOW' ? flow.realized.inflows : flow.realized.outflows;
  if (population === null) {
    return {
      status: 'UNAVAILABLE',
      payload: { status: 'UNAVAILABLE', monthKey, direction: input.direction },
    };
  }

  const [settlements, catalog, receivablesActive, payablesActive] = await Promise.all([
    deps.ledger.listActiveByOccurredOn({ ...scope, from: flow.from, to: flow.to }),
    deps.costCenters.listByTenant(tenantId),
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
  const [realizedReceivables, realizedPayables, receivableAllocations, payableAllocations] =
    await Promise.all([
      deps.receivables.findByExternalIds(scope, receivableIds),
      deps.payables.findByExternalIds(scope, payableIds),
      deps.costCenterAllocations.findConfirmedAllocationsByInstallmentExternalIds({
        ...scope,
        kind: 'RECEIVABLE',
        externalIds: receivableIds,
      }),
      deps.costCenterAllocations.findConfirmedAllocationsByInstallmentExternalIds({
        ...scope,
        kind: 'PAYABLE',
        externalIds: payableIds,
      }),
    ]);

  const realizedInstallments = new Map<string, FinancialInstallmentReadRecord>([
    ...installmentMap('RECEIVABLE', realizedReceivables),
    ...installmentMap('PAYABLE', realizedPayables),
    ...installmentMap('RECEIVABLE', receivablesActive),
    ...installmentMap('PAYABLE', payablesActive),
  ]);
  const attributed = collectAttributedCashSettlements({
    today,
    from: flow.from,
    to: flow.to,
    settlements: settlements.map((row) => ({
      settlementExternalId: row.externalId,
      installmentExternalId: row.installmentExternalId,
      installmentKind: row.installmentKind,
      transactionType: row.transactionType,
      occurredOn: row.occurredOn,
      netAmount: row.netAmount,
    })),
    realizedInstallments,
  });
  if (!attributed.available) {
    return {
      status: 'UNAVAILABLE',
      payload: { status: 'UNAVAILABLE', monthKey, direction: input.direction },
    };
  }

  const allocations: AdvisorCostCenterAllocationInput[] = [
    ...receivableAllocations.map((row) => ({
      costCenterId: row.costCenterId,
      installmentKind: 'RECEIVABLE' as const,
      amount: row.amount,
      installment: row.installment,
      confirmed: true,
    })),
    ...payableAllocations.map((row) => ({
      costCenterId: row.costCenterId,
      installmentKind: 'PAYABLE' as const,
      amount: row.amount,
      installment: row.installment,
      confirmed: true,
    })),
  ];

  return {
    status: 'OK',
    catalog,
    aggregation: aggregateAdvisorCostCenterDimension({
      monthKey,
      direction: input.direction,
      today,
      populationAmount: population,
      settlements: attributed.rows.map((row) => row.settlement),
      allocations,
      catalog,
    }),
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

function requireTenant(tenantId: string): string {
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new AdvisorDomainError(
      'TENANT_ID_REQUIRED',
      'tenantId do runtime é obrigatório na tool analítica.',
    );
  }
  assertAdvisorTenantId(tenantId);
  return tenantId.trim();
}

function requireMonth(value: string, field: string): string {
  const trimmed = value.trim();
  if (!isValidMonthKey(trimmed)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      `${field} deve ser YYYY-MM civil válido.`,
    );
  }
  return trimmed;
}

function requireQuery(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 80) {
    throw new AdvisorDomainError('ANALYTICAL_TOOL_INVALID_INPUT', 'Referência textual inválida.');
  }
  return trimmed;
}

function requireLimit(value: unknown): number {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'limit deve ser um número finito.',
    );
  }
  return value;
}

const COST_CENTER_FORBIDDEN = new Set([
  'tenantid',
  'userid',
  'sql',
  'rawsql',
  'table',
  'repository',
  'prisma',
  'integrationid',
  'companyid',
  'costcenterid',
  'daterange',
  'from',
  'to',
  'filter',
  'offset',
  'cursor',
  'query',
  'where',
  'orderby',
]);

function assertCostCenterArgs(raw: Record<string, unknown>, allowed: readonly string[]): void {
  if ('tenantId' in raw || 'userId' in raw) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'tenantId/userId não são aceitos no input da tool.',
    );
  }
  for (const key of Object.keys(raw)) {
    if (COST_CENTER_FORBIDDEN.has(key.toLowerCase())) {
      throw new AdvisorDomainError(
        'ANALYTICAL_TOOL_INVALID_INPUT',
        'Argumentos da tool contém campo proibido.',
      );
    }
    if (!allowed.includes(key)) {
      throw new AdvisorDomainError(
        'ANALYTICAL_TOOL_INVALID_INPUT',
        'Argumentos extras não são aceitos nesta tool.',
      );
    }
  }
}
