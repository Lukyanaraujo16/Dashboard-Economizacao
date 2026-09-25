import { CASH_REALIZED_DETAILS_ALL_MAX } from '../../analytics/services/cash-realized-details.service.js';
import type { CashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import { AdvisorDomainError } from './advisor-domain-error.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  clampAdvisorDrilldownLimit,
} from './advisor-cash-realized-breakdown.js';
import { resolveAdvisorOfficialCategory } from './advisor-nominal-category-resolver.js';
import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
  aggregateAdvisorNominalDimension,
  compareAdvisorNominalAggregations,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  serializeAdvisorNominalComparison,
  serializeAdvisorNominalLookup,
  serializeAdvisorNominalRanking,
  type AdvisorNominalAggregation,
} from './advisor-nominal-dimension.js';
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

const CATEGORY_REFERENCE_SCHEMA = {
  type: 'string',
  description:
    'Referência oficial da categoria do tenant: categoryKey ou rótulo. Sem SQL. Sem texto livre de filtro.',
};

const ENTITY_QUERY_SCHEMA = {
  type: 'string',
  description: 'Nome nominal da entidade já citado pelo usuário. Match conservador, sem fuzzy.',
};

const LIMIT_SCHEMA = {
  type: 'integer',
  minimum: 1,
  maximum: ADVISOR_DRILLDOWN_MAX_LIMIT,
  description: `Quantidade máxima de entidades. Default ${ADVISOR_DRILLDOWN_DEFAULT_LIMIT}, teto ${ADVISOR_DRILLDOWN_MAX_LIMIT}.`,
};

export const CASH_NOMINAL_RANKING_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_NOMINAL_RANKING_TOOL_NAME,
  description:
    'Ranking oficial da dimensão nominal (ex.: convênio) nas entradas realizadas de caixa de uma categoria. População completa + cobertura. Não recebe tenant. INFLOW apenas.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'categoryReference'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      categoryReference: CATEGORY_REFERENCE_SCHEMA,
      limit: LIMIT_SCHEMA,
    },
  },
};

export const CASH_NOMINAL_LOOKUP_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_NOMINAL_LOOKUP_TOOL_NAME,
  description:
    'Agrega a população completa de uma entidade nominal nas entradas realizadas de caixa. Não soma no LLM. Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'entityQuery'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      categoryReference: CATEGORY_REFERENCE_SCHEMA,
      entityQuery: ENTITY_QUERY_SCHEMA,
    },
  },
};

export const COMPARE_CASH_NOMINAL_TOOL: AdvisorAnalyticalToolDefinition = {
  name: COMPARE_CASH_NOMINAL_TOOL_NAME,
  description:
    'Compara a dimensão nominal entre dois meses civis no backend (delta e percentual). Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'comparisonMonthKey'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      comparisonMonthKey: {
        type: 'string',
        description: 'Mês-base de comparação no formato YYYY-MM',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      },
      categoryReference: CATEGORY_REFERENCE_SCHEMA,
      entityQuery: ENTITY_QUERY_SCHEMA,
      limit: LIMIT_SCHEMA,
    },
  },
};

export function listAdvisorNominalTools(): readonly AdvisorAnalyticalToolDefinition[] {
  return [CASH_NOMINAL_RANKING_TOOL, CASH_NOMINAL_LOOKUP_TOOL, COMPARE_CASH_NOMINAL_TOOL];
}

export type AdvisorNominalCategoryCatalog = {
  listByTenant(tenantId: string): Promise<readonly FinancialCategoryReadRecord[]>;
};

export type AdvisorNominalDimensionService = {
  rank(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly categoryReference: string;
    readonly limit?: number;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
  lookup(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly categoryReference?: string;
    readonly entityQuery: string;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
  compare(input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly comparisonMonthKey: string;
    readonly categoryReference?: string;
    readonly entityQuery?: string;
    readonly limit?: number;
    readonly now?: Date;
  }): Promise<Record<string, unknown>>;
};

export function createAdvisorNominalDimensionService(deps: {
  readonly details: Pick<CashRealizedDetailsService, 'listAllCashRealizedDetails'>;
  readonly categories: AdvisorNominalCategoryCatalog;
}): AdvisorNominalDimensionService {
  return {
    async rank(input) {
      const tenantId = requireTenant(input.tenantId);
      const resolved = await resolveCategory(deps.categories, tenantId, input.categoryReference);
      if (resolved.status !== 'RESOLVED') {
        return categoryStatusPayload(resolved, input.monthKey);
      }
      const aggregation = await loadAggregation(deps, {
        tenantId,
        monthKey: input.monthKey,
        category: resolved.category,
        now: input.now,
      });
      if (aggregation.truncated) {
        return {
          status: 'UNAVAILABLE',
          code: 'ANALYTICAL_TOOL_FAILED',
          message: 'População nominal excedeu o limite seguro de agregação.',
        };
      }
      if (!aggregation.available) {
        return { status: 'UNAVAILABLE', monthKey: input.monthKey };
      }
      if (aggregation.coverage.totalPopulationCount === 0) {
        return serializeAdvisorNominalRanking({
          status: 'EMPTY_RESULT',
          aggregation,
          ranking: rankAdvisorNominalDimension(aggregation, input.limit),
        });
      }
      return serializeAdvisorNominalRanking({
        status: 'OK',
        aggregation,
        ranking: rankAdvisorNominalDimension(aggregation, input.limit),
      });
    },

    async lookup(input) {
      const tenantId = requireTenant(input.tenantId);
      const loaded = await loadLookupAggregation(deps, input, tenantId);
      if ('status' in loaded && loaded.status !== undefined && loaded.aggregation === undefined) {
        return loaded.payload;
      }
      const aggregation = loaded.aggregation!;
      const found = lookupAdvisorNominalEntity(aggregation, input.entityQuery);
      if (found.status === 'NOT_FOUND') {
        return serializeAdvisorNominalLookup({
          status: 'NOT_FOUND',
          aggregation,
          entityQuery: input.entityQuery,
          match: null,
        });
      }
      if (found.status === 'AMBIGUOUS') {
        return serializeAdvisorNominalLookup({
          status: 'AMBIGUOUS',
          aggregation,
          entityQuery: input.entityQuery,
          match: null,
        });
      }
      return serializeAdvisorNominalLookup({
        status: 'OK',
        aggregation,
        entityQuery: input.entityQuery,
        match: found.matches[0] ?? null,
      });
    },

    async compare(input) {
      const tenantId = requireTenant(input.tenantId);
      const resolved =
        input.categoryReference === undefined
          ? input.entityQuery === undefined
            ? { status: 'NOT_FOUND' as const }
            : await resolveCategoryFromEntity(deps, {
                tenantId,
                monthKey: input.monthKey,
                entityQuery: input.entityQuery,
                now: input.now,
              })
          : await resolveCategory(deps.categories, tenantId, input.categoryReference);
      if (resolved.status !== 'RESOLVED') {
        return categoryStatusPayload(resolved, input.monthKey);
      }
      const [periodA, periodB] = await Promise.all([
        loadAggregation(deps, {
          tenantId,
          monthKey: input.comparisonMonthKey,
          category: resolved.category,
          now: input.now,
        }),
        loadAggregation(deps, {
          tenantId,
          monthKey: input.monthKey,
          category: resolved.category,
          now: input.now,
        }),
      ]);
      if (!periodA.available || !periodB.available || periodA.truncated || periodB.truncated) {
        return {
          status: 'UNAVAILABLE',
          monthKey: input.monthKey,
          comparisonMonthKey: input.comparisonMonthKey,
        };
      }
      const compared = compareAdvisorNominalAggregations({
        periodA,
        periodB,
        entityQuery: input.entityQuery,
      });
      if (input.entityQuery !== undefined && compared.items.length === 0) {
        return {
          status: 'AMBIGUOUS',
          monthKey: input.monthKey,
          comparisonMonthKey: input.comparisonMonthKey,
        };
      }
      const limits = clampAdvisorDrilldownLimit(input.limit);
      return serializeAdvisorNominalComparison({
        status: compared.items.length === 0 ? 'EMPTY_RESULT' : 'OK',
        category: resolved.category,
        monthKey: input.monthKey,
        comparisonMonthKey: input.comparisonMonthKey,
        periodA,
        periodB,
        items: compared.items,
        requestedLimit: limits.requestedLimit ?? limits.effectiveLimit,
        effectiveLimit: limits.effectiveLimit,
      });
    },
  };
}

export function assertCashNominalRankingArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly categoryReference: string;
  readonly limit?: number;
} {
  assertNominalArgs(raw, ['monthKey', 'categoryReference', 'limit']);
  if (typeof raw.monthKey !== 'string' || typeof raw.categoryReference !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e categoryReference são obrigatórios.',
    );
  }
  return {
    monthKey: requireMonth(raw.monthKey, 'monthKey'),
    categoryReference: requireReference(raw.categoryReference),
    ...(raw.limit === undefined ? {} : { limit: requireLimit(raw.limit) }),
  };
}

export function assertCashNominalLookupArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly categoryReference?: string;
  readonly entityQuery: string;
} {
  assertNominalArgs(raw, ['monthKey', 'categoryReference', 'entityQuery']);
  if (typeof raw.monthKey !== 'string' || typeof raw.entityQuery !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e entityQuery são obrigatórios.',
    );
  }
  return {
    monthKey: requireMonth(raw.monthKey, 'monthKey'),
    ...(typeof raw.categoryReference === 'string'
      ? { categoryReference: requireReference(raw.categoryReference) }
      : {}),
    entityQuery: requireReference(raw.entityQuery),
  };
}

export function assertCompareCashNominalArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly categoryReference?: string;
  readonly entityQuery?: string;
  readonly limit?: number;
} {
  assertNominalArgs(raw, [
    'monthKey',
    'comparisonMonthKey',
    'categoryReference',
    'entityQuery',
    'limit',
  ]);
  if (typeof raw.monthKey !== 'string' || typeof raw.comparisonMonthKey !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e comparisonMonthKey são obrigatórios.',
    );
  }
  const monthKey = requireMonth(raw.monthKey, 'monthKey');
  const comparisonMonthKey = requireMonth(raw.comparisonMonthKey, 'comparisonMonthKey');
  if (monthKey === comparisonMonthKey) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'compare_cash_nominal_dimension exige dois monthKey distintos.',
    );
  }
  return {
    monthKey,
    comparisonMonthKey,
    ...(typeof raw.categoryReference === 'string'
      ? { categoryReference: requireReference(raw.categoryReference) }
      : {}),
    ...(typeof raw.entityQuery === 'string' ? { entityQuery: requireReference(raw.entityQuery) } : {}),
    ...(raw.limit === undefined ? {} : { limit: requireLimit(raw.limit) }),
  };
}

async function resolveCategory(
  categories: AdvisorNominalCategoryCatalog,
  tenantId: string,
  reference: string,
) {
  const catalog = await categories.listByTenant(tenantId);
  return resolveAdvisorOfficialCategory(
    reference,
    catalog.map((row) => ({
      key: row.externalId,
      name: row.name,
      type: row.type,
    })),
    'REVENUE',
  );
}

async function loadAggregation(
  deps: {
    readonly details: Pick<CashRealizedDetailsService, 'listAllCashRealizedDetails'>;
    readonly categories: AdvisorNominalCategoryCatalog;
  },
  input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly category: { readonly key: string; readonly name: string };
    readonly now?: Date;
  },
): Promise<AdvisorNominalAggregation> {
  const details = await deps.details.listAllCashRealizedDetails({
    tenantId: input.tenantId,
    monthKey: input.monthKey,
    direction: 'inflows',
    categoryKey: input.category.key,
    now: input.now,
  });
  if (details.tenantId !== input.tenantId) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_FORBIDDEN',
      'Agregação nominal recusou detalhes de outro tenant.',
    );
  }
  if (details.itemCount > CASH_REALIZED_DETAILS_ALL_MAX) {
    return aggregateAdvisorNominalDimension({
      monthKey: input.monthKey,
      categoryKey: input.category.key,
      categoryName: input.category.name,
      details: { ...details, items: details.items.slice(0, CASH_REALIZED_DETAILS_ALL_MAX) },
    });
  }
  return aggregateAdvisorNominalDimension({
    monthKey: input.monthKey,
    categoryKey: input.category.key,
    categoryName: input.category.name,
    details,
  });
}

async function resolveCategoryFromEntity(
  deps: {
    readonly details: Pick<CashRealizedDetailsService, 'listAllCashRealizedDetails'>;
    readonly categories: AdvisorNominalCategoryCatalog;
  },
  input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly entityQuery: string;
    readonly now?: Date;
  },
): Promise<
  | { readonly status: 'RESOLVED'; readonly category: { readonly key: string; readonly name: string } }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'AMBIGUOUS' }
> {
  const loaded = await loadLookupAggregation(deps, input, input.tenantId);
  if (loaded.aggregation) {
    return {
      status: 'RESOLVED',
      category: {
        key: loaded.aggregation.categoryKey,
        name: loaded.aggregation.categoryName,
      },
    };
  }
  return { status: loaded.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'NOT_FOUND' };
}

async function loadLookupAggregation(
  deps: {
    readonly details: Pick<CashRealizedDetailsService, 'listAllCashRealizedDetails'>;
    readonly categories: AdvisorNominalCategoryCatalog;
  },
  input: {
    readonly tenantId: string;
    readonly monthKey: string;
    readonly categoryReference?: string;
    readonly entityQuery: string;
    readonly now?: Date;
  },
  tenantId: string,
): Promise<
  | { readonly aggregation: AdvisorNominalAggregation; readonly status?: undefined }
  | { readonly aggregation?: undefined; readonly status: string; readonly payload: Record<string, unknown> }
> {
  if (input.categoryReference !== undefined) {
    const resolved = await resolveCategory(deps.categories, tenantId, input.categoryReference);
    if (resolved.status !== 'RESOLVED') {
      return {
        status: resolved.status,
        payload: categoryStatusPayload(resolved, input.monthKey),
      };
    }
    return {
      aggregation: await loadAggregation(deps, {
        tenantId,
        monthKey: input.monthKey,
        category: resolved.category,
        now: input.now,
      }),
    };
  }

  const catalog = await deps.categories.listByTenant(tenantId);
  const revenue = catalog.filter((row) => row.type === 'REVENUE');
  const hits: AdvisorNominalAggregation[] = [];
  for (const category of revenue) {
    const aggregation = await loadAggregation(deps, {
      tenantId,
      monthKey: input.monthKey,
      category: { key: category.externalId, name: category.name },
      now: input.now,
    });
    const found = lookupAdvisorNominalEntity(aggregation, input.entityQuery);
    if (found.status === 'OK') {
      hits.push(aggregation);
    }
  }
  if (hits.length === 1) {
    return { aggregation: hits[0]! };
  }
  if (hits.length > 1) {
    return {
      status: 'AMBIGUOUS',
      payload: {
        status: 'AMBIGUOUS',
        monthKey: input.monthKey,
        message: 'A entidade aparece em mais de uma categoria oficial.',
      },
    };
  }
  return {
    status: 'NOT_FOUND',
    payload: { status: 'NOT_FOUND', monthKey: input.monthKey },
  };
}

function categoryStatusPayload(
  resolved: { readonly status: 'NOT_FOUND' | 'AMBIGUOUS' },
  monthKey: string,
): Record<string, unknown> {
  return {
    status: resolved.status === 'AMBIGUOUS' ? 'CATEGORY_AMBIGUOUS' : 'CATEGORY_NOT_FOUND',
    monthKey,
  };
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

function requireReference(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 80) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'Referência textual inválida.',
    );
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

const NOMINAL_FORBIDDEN = new Set([
  'tenantid',
  'userid',
  'sql',
  'rawsql',
  'table',
  'repository',
  'prisma',
  'integrationid',
  'daterange',
  'from',
  'to',
  'filter',
  'offset',
  'cursor',
  'query',
  'where',
  'categorykey',
  'category',
  'party',
  'partyid',
  'search',
]);

function assertNominalArgs(raw: Record<string, unknown>, allowed: readonly string[]): void {
  if ('tenantId' in raw || 'userId' in raw) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'tenantId/userId não são aceitos no input da tool.',
    );
  }
  for (const key of Object.keys(raw)) {
    if (NOMINAL_FORBIDDEN.has(key.toLowerCase())) {
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
