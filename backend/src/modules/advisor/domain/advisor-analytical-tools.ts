import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
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
]);

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

export function listAdvisorAnalyticalTools(): readonly AdvisorAnalyticalToolDefinition[] {
  return [COMPARE_CASH_MONTHS_TOOL];
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
        const args = assertCompareCashMonthsArgs(call.arguments);
        const comparison = await withToolTimeout(
          deps.cashComparison.compare({
            tenantId,
            monthKey: args.monthKey,
            comparisonMonthKey: args.comparisonMonthKey,
            now: input.now,
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
          topN: ADVISOR_CASH_CATEGORY_TOP_N,
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
      } catch (error) {
        const normalized = normalizeToolFailure(error);
        logToolExecution({
          toolName: call.name,
          durationMs: Date.now() - startedAt,
          ok: false,
          resultCardinality: 0,
          monthKey: readOptionalMonth(call.arguments.monthKey),
          comparisonMonthKey: readOptionalMonth(call.arguments.comparisonMonthKey),
          topN: ADVISOR_CASH_CATEGORY_TOP_N,
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
  const extra = keys.filter((key) => key !== 'monthKey' && key !== 'comparisonMonthKey');
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

function readOptionalMonth(value: unknown): string | undefined {
  return typeof value === 'string' && isValidMonthKey(value.trim()) ? value.trim() : undefined;
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

function normalizeToolFailure(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof AdvisorDomainError) {
    return { code: error.code, message: error.message };
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
  readonly monthKey?: string;
  readonly comparisonMonthKey?: string;
  readonly topN: number;
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
      topN: input.topN,
    }),
  );
}
