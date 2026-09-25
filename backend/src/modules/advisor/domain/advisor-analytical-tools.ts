import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { ReportCashDetailsService } from '../../reports/services/report-cash-details.service.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
import {
  CASH_MOVEMENT_LINES_TOOL_NAME,
  isAdvisorCashMovementSort,
  rankAdvisorCashMovementLines,
  serializeAdvisorCashMovementLines,
  type AdvisorCashMovementSort,
} from './advisor-cash-movement-lines.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  CASH_REALIZED_BREAKDOWN_TOOL_NAME,
  clampAdvisorDrilldownLimit,
  isAdvisorCashDirection,
  rankAdvisorCashRealizedBreakdown,
  serializeAdvisorCashRealizedBreakdown,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import { AdvisorDomainError } from './advisor-domain-error.js';
import {
  ADVISOR_CASH_CATEGORY_TOP_N,
  compareAdvisorCashMonths,
  serializeAdvisorCashMonthComparison,
  type AdvisorCashMonthComparison,
} from './compare-advisor-cash-months.js';

export const ADVISOR_MAX_TOOL_ROUNDS = 3;
export const ADVISOR_ANALYTICAL_TOOL_TIMEOUT_MS = 10_000;
export const COMPARE_CASH_MONTHS_TOOL_NAME = 'compare_cash_months';

export type AdvisorAnalyticalToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
};

export type AdvisorAnalyticalToolCall = {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
};

export type AdvisorAnalyticalToolResult = {
  readonly id: string;
  readonly name: string;
  readonly ok: boolean;
  readonly content: string;
  readonly resultCardinality?: number;
  readonly monthKey?: string;
  readonly comparisonMonthKey?: string;
};

export type AdvisorCashComparisonRequest = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly now?: Date;
};

export type AdvisorCashComparisonService = {
  compare(input: AdvisorCashComparisonRequest): Promise<AdvisorCashMonthComparison>;
};

export type AdvisorCashBreakdownRequest = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
  readonly now?: Date;
};

export type AdvisorCashBreakdownService = {
  breakdown(input: AdvisorCashBreakdownRequest): Promise<
    ReturnType<typeof rankAdvisorCashRealizedBreakdown>
  >;
};

export type AdvisorCashMovementLinesRequest = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly sort: AdvisorCashMovementSort;
  readonly limit?: number;
  readonly now?: Date;
};

export type AdvisorCashMovementLinesService = {
  list(input: AdvisorCashMovementLinesRequest): Promise<
    ReturnType<typeof rankAdvisorCashMovementLines>
  >;
};

const FORBIDDEN_ARG_KEYS = new Set([
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

const MONTH_KEY_SCHEMA = {
  type: 'string',
  description: 'Mês civil no formato YYYY-MM, já resolvido pelo contexto.',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
};

const DIRECTION_SCHEMA = {
  type: 'string',
  enum: ['INFLOW', 'OUTFLOW'],
  description:
    'INFLOW = entradas realizadas de caixa (RECEIPT). OUTFLOW = saídas realizadas de caixa (DISBURSEMENT).',
};

const LIMIT_SCHEMA = {
  type: 'integer',
  minimum: 1,
  maximum: ADVISOR_DRILLDOWN_MAX_LIMIT,
  description: `Quantidade máxima de itens. Default ${ADVISOR_DRILLDOWN_DEFAULT_LIMIT}, teto ${ADVISOR_DRILLDOWN_MAX_LIMIT}.`,
};

export const COMPARE_CASH_MONTHS_TOOL: AdvisorAnalyticalToolDefinition = {
  name: COMPARE_CASH_MONTHS_TOOL_NAME,
  description:
    'Compara dois meses civis de caixa oficial (faturamento CASH, realizado e categorias). Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'comparisonMonthKey'],
    properties: {
      monthKey: {
        type: 'string',
        description: 'Mês atual/destino no formato YYYY-MM',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      },
      comparisonMonthKey: {
        type: 'string',
        description: 'Mês-base de comparação no formato YYYY-MM',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      },
    },
  },
};

export const CASH_REALIZED_BREAKDOWN_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
  description:
    'Ranking oficial das categorias de entradas ou saídas realizadas de caixa (realizedByCategory). Não ranqueia convênio/cliente individual. Não recebe tenant.',
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

export const CASH_MOVEMENT_LINES_TOOL: AdvisorAnalyticalToolDefinition = {
  name: CASH_MOVEMENT_LINES_TOOL_NAME,
  description:
    'Janela limitada das maiores movimentações individuais realizadas de caixa. Não é ranking de clientes, fornecedores ou convênios. Não recebe tenant.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['monthKey', 'direction'],
    properties: {
      monthKey: MONTH_KEY_SCHEMA,
      direction: DIRECTION_SCHEMA,
      sort: {
        type: 'string',
        enum: ['AMOUNT_DESC', 'DATE_DESC'],
        description: 'AMOUNT_DESC = maiores valores. DATE_DESC = mais recentes. Default AMOUNT_DESC.',
      },
      limit: LIMIT_SCHEMA,
    },
  },
};

export function listAdvisorAnalyticalTools(): readonly AdvisorAnalyticalToolDefinition[] {
  return [COMPARE_CASH_MONTHS_TOOL, CASH_REALIZED_BREAKDOWN_TOOL, CASH_MOVEMENT_LINES_TOOL];
}

export function createAdvisorCashComparisonService(deps: {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
}): AdvisorCashComparisonService {
  const cache = new Map<string, Promise<AdvisorCashMonthComparison>>();

  return {
    compare(input) {
      const tenantId = requireRuntimeTenantId(input.tenantId);
      const monthKey = requireMonthKey(input.monthKey, 'monthKey');
      const comparisonMonthKey = requireMonthKey(input.comparisonMonthKey, 'comparisonMonthKey');
      if (monthKey === comparisonMonthKey) {
        throw new AdvisorDomainError(
          'ANALYTICAL_TOOL_INVALID_INPUT',
          'compare_cash_months exige dois monthKey distintos.',
        );
      }
      const cacheKey = `${tenantId}\0${monthKey}\0${comparisonMonthKey}`;
      const hit = cache.get(cacheKey);
      if (hit !== undefined) {
        return hit;
      }
      const pending = (async () => {
        const [periodB, periodA] = await Promise.all([
          deps.cashFlow.getMonthlyCashFlow({
            tenantId,
            monthKey,
            now: input.now,
          }),
          deps.cashFlow.getMonthlyCashFlow({
            tenantId,
            monthKey: comparisonMonthKey,
            now: input.now,
          }),
        ]);
        return compareAdvisorCashMonths({ tenantId, periodA, periodB });
      })();
      cache.set(cacheKey, pending);
      return pending;
    },
  };
}

export function createAdvisorCashBreakdownService(deps: {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
}): AdvisorCashBreakdownService {
  return {
    async breakdown(input) {
      const tenantId = requireRuntimeTenantId(input.tenantId);
      const monthKey = requireMonthKey(input.monthKey, 'monthKey');
      const limits = clampAdvisorDrilldownLimit(input.limit);
      const flow = await deps.cashFlow.getMonthlyCashFlow({
        tenantId,
        monthKey,
        now: input.now,
      });
      if (flow.tenantId !== tenantId) {
        throw new AdvisorDomainError(
          'ANALYTICAL_TOOL_FORBIDDEN',
          'Breakdown de caixa recusou fluxo de outro tenant.',
        );
      }
      return rankAdvisorCashRealizedBreakdown({
        flow,
        direction: input.direction,
        requestedLimit: limits.requestedLimit,
        effectiveLimit: limits.effectiveLimit,
      });
    },
  };
}

export function createAdvisorCashMovementLinesService(deps: {
  readonly reportCashDetails: Pick<ReportCashDetailsService, 'listAllReportCashDetails'>;
}): AdvisorCashMovementLinesService {
  return {
    async list(input) {
      const tenantId = requireRuntimeTenantId(input.tenantId);
      const monthKey = requireMonthKey(input.monthKey, 'monthKey');
      const limits = clampAdvisorDrilldownLimit(input.limit);
      const universe = await deps.reportCashDetails.listAllReportCashDetails({
        tenantId,
        direction: input.direction === 'INFLOW' ? 'revenue' : 'expenses',
        fromKey: monthKey,
        toKey: monthKey,
        situation: 'REALIZED',
        now: input.now,
      });
      return rankAdvisorCashMovementLines({
        monthKey,
        direction: input.direction,
        sort: input.sort,
        requestedLimit: limits.requestedLimit ?? limits.effectiveLimit,
        effectiveLimit: limits.effectiveLimit,
        source: {
          available: universe.available,
          items: universe.items.map((item) => ({
            date: item.date,
            amount: item.amount,
            description: item.description,
            partyName: item.partyName,
            categoryNames: item.categoryNames,
            costCenterNames: item.costCenterNames,
            tieBreak: item.settlementExternalId ?? item.installmentExternalId,
          })),
        },
      });
    },
  };
}

export type AdvisorAnalyticalToolExecutor = {
  readonly tools: readonly AdvisorAnalyticalToolDefinition[];
  execute(input: {
    readonly tenantId: string;
    readonly call: AdvisorAnalyticalToolCall;
    readonly now?: Date;
  }): Promise<AdvisorAnalyticalToolResult>;
};

export function createAdvisorAnalyticalToolExecutor(deps: {
  readonly cashComparison: AdvisorCashComparisonService;
  readonly cashBreakdown?: AdvisorCashBreakdownService;
  readonly cashMovements?: AdvisorCashMovementLinesService;
}): AdvisorAnalyticalToolExecutor {
  const allowlist = new Set(listAdvisorAnalyticalTools().map((tool) => tool.name));

  return {
    tools: listAdvisorAnalyticalTools(),
    async execute(input) {
      const startedAt = Date.now();
      const tenantId = requireRuntimeTenantId(input.tenantId);
      const call = input.call;
      try {
        if (!allowlist.has(call.name)) {
          throw new AdvisorDomainError(
            'ANALYTICAL_TOOL_UNKNOWN',
            'Tool analítica desconhecida.',
          );
        }
        if (call.name === COMPARE_CASH_MONTHS_TOOL_NAME) {
          return await executeCompare(deps.cashComparison, tenantId, call, input.now, startedAt);
        }
        if (call.name === CASH_REALIZED_BREAKDOWN_TOOL_NAME) {
          if (deps.cashBreakdown === undefined) {
            throw new AdvisorDomainError(
              'ANALYTICAL_TOOL_FAILED',
              'Não consegui obter o ranking oficial de categorias agora.',
            );
          }
          return await executeBreakdown(deps.cashBreakdown, tenantId, call, input.now, startedAt);
        }
        if (call.name === CASH_MOVEMENT_LINES_TOOL_NAME) {
          if (deps.cashMovements === undefined) {
            throw new AdvisorDomainError(
              'ANALYTICAL_TOOL_FAILED',
              'Não consegui obter o detalhamento das movimentações agora.',
            );
          }
          return await executeMovements(deps.cashMovements, tenantId, call, input.now, startedAt);
        }
        throw new AdvisorDomainError('ANALYTICAL_TOOL_UNKNOWN', 'Tool analítica desconhecida.');
      } catch (error) {
        const normalized = normalizeToolFailure(error, call.name);
        logToolExecution({
          toolName: call.name,
          durationMs: Date.now() - startedAt,
          ok: false,
          resultCardinality: 0,
          monthKey: readOptionalMonth(call.arguments.monthKey),
          comparisonMonthKey: readOptionalMonth(call.arguments.comparisonMonthKey),
          direction: readOptionalDirection(call.arguments.direction),
          requestedLimit: readOptionalLimit(call.arguments.limit),
          effectiveLimit: null,
        });
        return {
          id: call.id,
          name: call.name,
          ok: false,
          content: JSON.stringify({
            status: 'UNAVAILABLE',
            code: normalized.code,
            message: normalized.message,
          }),
          resultCardinality: 0,
        };
      }
    },
  };
}

export function assertCompareCashMonthsArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
} {
  assertNoForbiddenArgs(raw);
  const extra = Object.keys(raw).filter((key) => key !== 'monthKey' && key !== 'comparisonMonthKey');
  if (extra.length > 0) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'compare_cash_months aceita apenas monthKey e comparisonMonthKey.',
    );
  }
  if (typeof raw.monthKey !== 'string' || typeof raw.comparisonMonthKey !== 'string') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'monthKey e comparisonMonthKey são obrigatórios.',
    );
  }
  return {
    monthKey: requireMonthKey(raw.monthKey, 'monthKey'),
    comparisonMonthKey: requireMonthKey(raw.comparisonMonthKey, 'comparisonMonthKey'),
  };
}

export function assertCashRealizedBreakdownArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
} {
  assertNoForbiddenArgs(raw);
  const extra = Object.keys(raw).filter(
    (key) => key !== 'monthKey' && key !== 'direction' && key !== 'limit',
  );
  if (extra.length > 0) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'cash_realized_breakdown aceita apenas monthKey, direction e limit.',
    );
  }
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
    monthKey: requireMonthKey(raw.monthKey, 'monthKey'),
    direction: raw.direction,
    ...(raw.limit === undefined ? {} : { limit: requireLimit(raw.limit) }),
  };
}

export function assertCashMovementLinesArgs(raw: Record<string, unknown>): {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly sort: AdvisorCashMovementSort;
  readonly limit?: number;
} {
  assertNoForbiddenArgs(raw);
  const extra = Object.keys(raw).filter(
    (key) => key !== 'monthKey' && key !== 'direction' && key !== 'sort' && key !== 'limit',
  );
  if (extra.length > 0) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'cash_movement_lines aceita apenas monthKey, direction, sort e limit.',
    );
  }
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
  const sort = raw.sort === undefined ? 'AMOUNT_DESC' : raw.sort;
  if (typeof sort !== 'string' || !isAdvisorCashMovementSort(sort)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'sort deve ser AMOUNT_DESC ou DATE_DESC.',
    );
  }
  return {
    monthKey: requireMonthKey(raw.monthKey, 'monthKey'),
    direction: raw.direction,
    sort,
    ...(raw.limit === undefined ? {} : { limit: requireLimit(raw.limit) }),
  };
}

async function executeCompare(
  cashComparison: AdvisorCashComparisonService,
  tenantId: string,
  call: AdvisorAnalyticalToolCall,
  now: Date | undefined,
  startedAt: number,
): Promise<AdvisorAnalyticalToolResult> {
  const args = assertCompareCashMonthsArgs(call.arguments);
  const comparison = await withToolTimeout(
    cashComparison.compare({
      tenantId,
      monthKey: args.monthKey,
      comparisonMonthKey: args.comparisonMonthKey,
      now,
    }),
  );
  const serialized = serializeAdvisorCashMonthComparison(comparison);
  const resultCardinality =
    comparison.inflowCategories.increases.length +
    comparison.inflowCategories.decreases.length +
    comparison.outflowCategories.increases.length +
    comparison.outflowCategories.decreases.length;
  logToolExecution({
    toolName: call.name,
    durationMs: Date.now() - startedAt,
    ok: true,
    resultCardinality,
    monthKey: args.monthKey,
    comparisonMonthKey: args.comparisonMonthKey,
    direction: null,
    requestedLimit: null,
    effectiveLimit: ADVISOR_CASH_CATEGORY_TOP_N,
  });
  return {
    id: call.id,
    name: call.name,
    ok: true,
    content: JSON.stringify(serialized),
    resultCardinality,
    monthKey: args.monthKey,
    comparisonMonthKey: args.comparisonMonthKey,
  };
}

async function executeBreakdown(
  cashBreakdown: AdvisorCashBreakdownService,
  tenantId: string,
  call: AdvisorAnalyticalToolCall,
  now: Date | undefined,
  startedAt: number,
): Promise<AdvisorAnalyticalToolResult> {
  const args = assertCashRealizedBreakdownArgs(call.arguments);
  const limits = clampAdvisorDrilldownLimit(args.limit);
  const breakdown = await withToolTimeout(
    cashBreakdown.breakdown({
      tenantId,
      monthKey: args.monthKey,
      direction: args.direction,
      limit: args.limit,
      now,
    }),
  );
  const serialized = serializeAdvisorCashRealizedBreakdown(breakdown);
  logToolExecution({
    toolName: call.name,
    durationMs: Date.now() - startedAt,
    ok: true,
    resultCardinality: breakdown.categories.length,
    monthKey: args.monthKey,
    comparisonMonthKey: null,
    direction: args.direction,
    requestedLimit: limits.requestedLimit,
    effectiveLimit: limits.effectiveLimit,
  });
  return {
    id: call.id,
    name: call.name,
    ok: true,
    content: JSON.stringify(serialized),
    resultCardinality: breakdown.categories.length,
    monthKey: args.monthKey,
  };
}

async function executeMovements(
  cashMovements: AdvisorCashMovementLinesService,
  tenantId: string,
  call: AdvisorAnalyticalToolCall,
  now: Date | undefined,
  startedAt: number,
): Promise<AdvisorAnalyticalToolResult> {
  const args = assertCashMovementLinesArgs(call.arguments);
  const limits = clampAdvisorDrilldownLimit(args.limit);
  const window = await withToolTimeout(
    cashMovements.list({
      tenantId,
      monthKey: args.monthKey,
      direction: args.direction,
      sort: args.sort,
      limit: args.limit,
      now,
    }),
  );
  if (window.status === 'UNAVAILABLE') {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_FAILED',
      'Não consegui obter o detalhamento das movimentações agora.',
    );
  }
  const serialized = serializeAdvisorCashMovementLines(window);
  logToolExecution({
    toolName: call.name,
    durationMs: Date.now() - startedAt,
    ok: true,
    resultCardinality: window.returnedCount,
    monthKey: args.monthKey,
    comparisonMonthKey: null,
    direction: args.direction,
    requestedLimit: limits.requestedLimit,
    effectiveLimit: limits.effectiveLimit,
  });
  return {
    id: call.id,
    name: call.name,
    ok: true,
    content: JSON.stringify(serialized),
    resultCardinality: window.returnedCount,
    monthKey: args.monthKey,
  };
}

function assertNoForbiddenArgs(raw: Record<string, unknown>): void {
  const keys = Object.keys(raw);
  for (const key of keys) {
    if (FORBIDDEN_ARG_KEYS.has(key.toLowerCase())) {
      throw new AdvisorDomainError(
        'ANALYTICAL_TOOL_INVALID_INPUT',
        'Argumentos da tool contém campo proibido.',
      );
    }
  }
  if ('tenantId' in raw || 'userId' in raw) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'tenantId/userId não são aceitos no input da tool.',
    );
  }
}

function requireRuntimeTenantId(tenantId: string): string {
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new AdvisorDomainError(
      'TENANT_ID_REQUIRED',
      'tenantId do runtime é obrigatório na tool analítica.',
    );
  }
  assertAdvisorTenantId(tenantId);
  return tenantId.trim();
}

function requireMonthKey(value: string, field: string): string {
  const trimmed = value.trim();
  if (!isValidMonthKey(trimmed)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      `${field} deve ser YYYY-MM civil válido.`,
    );
  }
  return trimmed;
}

function requireLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'limit deve ser um número finito.',
    );
  }
  return value;
}

function readOptionalMonth(value: unknown): string | undefined {
  return typeof value === 'string' && isValidMonthKey(value.trim()) ? value.trim() : undefined;
}

function readOptionalDirection(value: unknown): AdvisorCashDirection | null {
  return typeof value === 'string' && isAdvisorCashDirection(value) ? value : null;
}

function readOptionalLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function withToolTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AdvisorDomainError(
          'ANALYTICAL_TOOL_FAILED',
          'A tool analítica excedeu o tempo limite.',
        ),
      );
    }, ADVISOR_ANALYTICAL_TOOL_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeToolFailure(
  error: unknown,
  toolName: string,
): { readonly code: string; readonly message: string } {
  if (error instanceof AdvisorDomainError) {
    return { code: error.code, message: error.message };
  }
  if (toolName === CASH_MOVEMENT_LINES_TOOL_NAME) {
    return {
      code: 'ANALYTICAL_TOOL_FAILED',
      message: 'Não consegui obter o detalhamento das movimentações agora.',
    };
  }
  if (toolName === CASH_REALIZED_BREAKDOWN_TOOL_NAME) {
    return {
      code: 'ANALYTICAL_TOOL_FAILED',
      message: 'Não consegui obter o ranking oficial de categorias agora.',
    };
  }
  return {
    code: 'ANALYTICAL_TOOL_FAILED',
    message: 'Não foi possível obter o detalhe analítico solicitado.',
  };
}

function logToolExecution(input: {
  readonly toolName: string;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly resultCardinality: number;
  readonly monthKey?: string | null;
  readonly comparisonMonthKey?: string | null;
  readonly direction: AdvisorCashDirection | null;
  readonly requestedLimit: number | null;
  readonly effectiveLimit: number | null;
}): void {
  console.info(
    JSON.stringify({
      event: 'advisor_tool_execution',
      toolName: input.toolName,
      durationMs: input.durationMs,
      ok: input.ok,
      resultCardinality: input.resultCardinality,
      monthKey: input.monthKey ?? null,
      comparisonMonthKey: input.comparisonMonthKey ?? null,
      direction: input.direction,
      requestedLimit: input.requestedLimit,
      effectiveLimit: input.effectiveLimit,
    }),
  );
}
