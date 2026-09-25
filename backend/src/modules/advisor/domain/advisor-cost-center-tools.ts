import { Prisma } from '../../../generated/prisma/client.js';
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
import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import {
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
  COMPARE_CASH_COST_CENTER_TOOL_NAME,
  buildAdvisorCostCenterAggregation,
  collectAdvisorCostCenterAttributedShares,
  lookupAdvisorCostCenter,
  rankAdvisorCostCenterDimension,
  resolveAdvisorCostCenterQuery,
  serializeAdvisorCostCenterLookup,
  serializeAdvisorCostCenterRanking,
  type AdvisorCostCenterAllocationInput,
  type AdvisorCostCenterAggregation,
  type AdvisorCostCenterAttributedShare,
  type AdvisorCostCenterCatalogItem,
} from './advisor-cost-center-dimension.js';
import {
  compareAdvisorCostCenterDimension,
  serializeAdvisorCostCenterComparison,
} from './advisor-cost-center-comparison.js';
import {
  listAdvisorCostCenterMovementLines,
  serializeAdvisorCostCenterMovementLines,
} from './advisor-cost-center-movement-lines.js';

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

export const COMPARE_CASH_COST_CENTER_TOOL: AdvisorAnalyticalToolDefinition = {
  name: COMPARE_CASH_COST_CENTER_TOOL_NAME,
  description:
    'Compara o caixa realizado de um centro de custo entre dois meses. Junta pelo id interno. Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'comparisonMonthKey', 'direction', 'costCenterQuery'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      comparisonMonthKey: {
        ...MONTH_KEY_SCHEMA,
        description: 'Mês-base (mais antigo) no formato YYYY-MM.',
      },
      direction: DIRECTION_SCHEMA,
      costCenterQuery: COST_CENTER_QUERY_SCHEMA,
    },
  },
};

export const CASH_COST_CENTER_MOVEMENT_LINES_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  description:
    'Linhas de caixa realizado atribuídas a um centro (share FETCHED/EXACT). Total do centro ≠ soma do TOP N.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'direction', 'costCenterQuery'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      direction: DIRECTION_SCHEMA,
      costCenterQuery: COST_CENTER_QUERY_SCHEMA,
      limit: LIMIT_SCHEMA,
    },
  },
};

export function listAdvisorCostCenterTools(): readonly AdvisorAnalyticalToolDefinition[] {
  return [
    CASH_COST_CENTER_RANKING_TOOL,
    CASH_COST_CENTER_LOOKUP_TOOL,
    COMPARE_CASH_COST_CENTER_TOOL,
    CASH_COST_CENTER_MOVEMENT_LINES_TOOL,
  ];
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
  compare(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly comparisonMonthKey: string;
    readonly direction: AdvisorCashDirection;
    readonly costCenterQuery: string;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
  movementLines(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly direction: AdvisorCashDirection;
    readonly costCenterQuery: string;
    readonly limit?: number;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
};

type CostCenterServiceDeps = {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
  readonly costCenterAllocations: Pick<
    CostCenterAllocationReadRepository,
    'findConfirmedAllocationsByInstallmentExternalIds'
  >;
  readonly parties?: Pick<PartyReadRepository, 'findNamesByIds'>;
  readonly categories?: Pick<FinancialCategoryReadRepository, 'listByTenant'>;
};

export function createAdvisorCostCenterDimensionService(
  deps: CostCenterServiceDeps,
): AdvisorCostCenterDimensionService {
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

    async compare(input) {
      const [base, target] = await Promise.all([
        loadAggregation(deps, {
          tenantId: input.tenantId,
          monthKey: input.comparisonMonthKey,
          direction: input.direction,
          now: input.now,
        }),
        loadAggregation(deps, {
          tenantId: input.tenantId,
          monthKey: input.monthKey,
          direction: input.direction,
          now: input.now,
        }),
      ]);
      if (base.status !== 'OK' || target.status !== 'OK') {
        return {
          status: 'UNAVAILABLE',
          monthKey: input.monthKey,
          comparisonMonthKey: input.comparisonMonthKey,
          direction: input.direction,
        };
      }
      const resolved = resolveAdvisorCostCenterQuery(target.catalog, input.costCenterQuery);
      if (resolved.status === 'NOT_FOUND') {
        return serializeAdvisorCostCenterComparison({
          status: 'NOT_FOUND',
          direction: input.direction,
          monthKey: input.monthKey,
          comparisonMonthKey: input.comparisonMonthKey,
          costCenter: null,
          base: null,
          target: null,
          absoluteDelta: null,
          percentageDelta: null,
          trend: null,
          coverageDiffers: false,
        });
      }
      if (resolved.status === 'AMBIGUOUS') {
        return serializeAdvisorCostCenterComparison({
          status: 'AMBIGUOUS',
          direction: input.direction,
          monthKey: input.monthKey,
          comparisonMonthKey: input.comparisonMonthKey,
          costCenter: null,
          base: null,
          target: null,
          absoluteDelta: null,
          percentageDelta: null,
          trend: null,
          coverageDiffers: false,
          candidates: resolved.candidates,
        });
      }
      return serializeAdvisorCostCenterComparison(
        compareAdvisorCostCenterDimension({
          base: base.aggregation,
          target: target.aggregation,
          catalogItem: {
            id: resolved.center.costCenterId,
            name: resolved.center.name,
            code: resolved.center.code,
          },
        }),
      );
    },

    async movementLines(input) {
      const loaded = await loadAggregation(deps, input);
      if (loaded.status !== 'OK') {
        return loaded.payload;
      }
      const resolved = resolveAdvisorCostCenterQuery(loaded.catalog, input.costCenterQuery);
      if (resolved.status === 'NOT_FOUND') {
        return serializeAdvisorCostCenterMovementLines(
          emptyMovementWindow(loaded.aggregation, input.limit, 'NOT_FOUND'),
        );
      }
      if (resolved.status === 'AMBIGUOUS') {
        return serializeAdvisorCostCenterMovementLines({
          ...emptyMovementWindow(loaded.aggregation, input.limit, 'AMBIGUOUS'),
          candidates: resolved.candidates,
        });
      }
      const catalogItem: AdvisorCostCenterCatalogItem = {
        id: resolved.center.costCenterId,
        name: resolved.center.name,
        code: resolved.center.code,
      };
      const sourceLines = await hydrateMovementLines(deps, input.tenantId, loaded);
      return serializeAdvisorCostCenterMovementLines(
        listAdvisorCostCenterMovementLines({
          aggregation: loaded.aggregation,
          shares: loaded.shares,
          catalogItem,
          sourceLines,
          limit: input.limit,
        }),
      );
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

export function assertCompareCashCostCenterArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
} {
  assertCostCenterArgs(raw, ['monthKey', 'comparisonMonthKey', 'direction', 'costCenterQuery']);
  if (
    typeof raw.monthKey !== 'string' ||
    typeof raw.comparisonMonthKey !== 'string' ||
    typeof raw.direction !== 'string' ||
    typeof raw.costCenterQuery !== 'string'
  ) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey, comparisonMonthKey, direction e costCenterQuery são obrigatórios.',
    );
  }
  if (!isAdvisorCashDirection(raw.direction)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'direction deve ser INFLOW ou OUTFLOW.',
    );
  }
  const monthKey = requireMonth(raw.monthKey, 'monthKey');
  const comparisonMonthKey = requireMonth(raw.comparisonMonthKey, 'comparisonMonthKey');
  if (monthKey === comparisonMonthKey) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'compare_cash_cost_center exige dois monthKey distintos.',
    );
  }
  return {
    monthKey,
    comparisonMonthKey,
    direction: raw.direction,
    costCenterQuery: requireQuery(raw.costCenterQuery),
  };
}

export function assertCashCostCenterMovementLinesArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
  readonly limit?: number;
} {
  assertCostCenterArgs(raw, ['monthKey', 'direction', 'costCenterQuery', 'limit']);
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
  deps: CostCenterServiceDeps,
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
      readonly catalog: readonly AdvisorCostCenterCatalogItem[];
      readonly shares: readonly AdvisorCostCenterAttributedShare[];
      readonly installments: ReadonlyMap<string, FinancialInstallmentReadRecord>;
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
  const projectionInput = {
    monthKey,
    direction: input.direction,
    today,
    populationAmount: population,
    settlements: attributed.rows.map((row) => row.settlement),
    allocations,
    catalog,
  };
  const shares = collectAdvisorCostCenterAttributedShares(projectionInput);
  return {
    status: 'OK',
    catalog,
    shares,
    installments: realizedInstallments,
    aggregation: buildAdvisorCostCenterAggregation(projectionInput, shares),
  };
}

async function hydrateMovementLines(
  deps: CostCenterServiceDeps,
  tenantId: string,
  loaded: {
    readonly shares: readonly AdvisorCostCenterAttributedShare[];
    readonly installments: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  },
) {
  const partyIds = [
    ...new Set(
      loaded.shares
        .map((share) => loaded.installments.get(`${share.installmentKind}:${share.installmentExternalId}`)?.partyId)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ];
  const [partyNames, categories] = await Promise.all([
    deps.parties === undefined || partyIds.length === 0
      ? Promise.resolve(new Map<string, string>())
      : deps.parties.findNamesByIds({ tenantId }, partyIds),
    deps.categories === undefined
      ? Promise.resolve([] as readonly FinancialCategoryReadRecord[])
      : deps.categories.listByTenant(tenantId),
  ]);
  const categoryById = new Map(categories.map((row) => [row.externalId, row.name]));
  return loaded.shares.map((share) => {
    const installment = loaded.installments.get(
      `${share.installmentKind}:${share.installmentExternalId}`,
    );
    return {
      share,
      description: installment?.description ?? null,
      partyName:
        installment?.partyId === null || installment?.partyId === undefined
          ? null
          : (partyNames.get(installment.partyId) ?? null),
      categoryNames: (installment?.categoryExternalIds ?? [])
        .map((id) => categoryById.get(id))
        .filter((name): name is string => name !== undefined && name.trim() !== ''),
    };
  });
}

function emptyMovementWindow(
  aggregation: AdvisorCostCenterAggregation,
  limit: number | undefined,
  status: 'NOT_FOUND' | 'AMBIGUOUS',
) {
  const zero = new Prisma.Decimal(0);
  return {
    status,
    monthKey: aggregation.monthKey,
    direction: aggregation.direction,
    costCenter: null,
    costCenterAmount: zero,
    populationAmount: aggregation.populationAmount,
    identifiedAmount: aggregation.identifiedAmount,
    unidentifiedAmount: aggregation.unidentifiedAmount,
    coveragePercentage: aggregation.coveragePercentage,
    movementPopulationAmount: zero,
    requestedLimit: limit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    effectiveLimit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    returnedCount: 0,
    hasMore: false,
    lines: [],
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
