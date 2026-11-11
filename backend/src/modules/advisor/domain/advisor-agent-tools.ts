import type { Prisma } from '../../../generated/prisma/client.js';
import { isValidMonthKey, shiftCivilMonthKey } from '../../analytics/domain/civil-calendar.js';
import { monthlyBilling, monthlyExpenses } from '../../analytics/domain/monthly-cash-flow.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';
import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type {
  AdvisorAnalyticalToolDefinition,
  AdvisorAnalyticalToolExecutor,
  AdvisorAnalyticalToolResult,
} from './advisor-analytical-tools.js';
import { serializeCurrentSnapshotViaUniversal } from './analytical/preload-analytical-parity.js';
import {
  buildBillingCostCenterMonthQuery,
  buildBillingCostCenterSeriesQuery,
} from './analytical/build-analytical-query-from-tool.js';
import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';

/**
 * Tools do modo agente. Todo número vem dos serviços oficiais da Dashboard
 * (MonthlyCashFlow, FinancialStockSnapshot, capability registry). Tenant vem do runtime.
 */
export const AGENT_MONTH_SUMMARY_TOOL_NAME = 'financial_month_summary';
export const AGENT_MONTH_SERIES_TOOL_NAME = 'financial_month_series';
export const AGENT_CURRENT_POSITION_TOOL_NAME = 'current_financial_position';
export const AGENT_LIST_COST_CENTERS_TOOL_NAME = 'list_cost_centers';
export const AGENT_BILLING_COST_CENTER_TOOL_NAME = 'billing_by_cost_center';

export const AGENT_SERIES_MAX_MONTHS = 24;
const CATEGORY_TOP_N = 8;

const MONTH_KEY_SCHEMA = {
  type: 'string',
  description: 'Mês civil YYYY-MM.',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
} as const;

export const AGENT_EXTRA_TOOLS: readonly AdvisorAnalyticalToolDefinition[] = [
  {
    name: AGENT_MONTH_SUMMARY_TOOL_NAME,
    description:
      'Resumo oficial de UM mês da empresa inteira: faturamento, despesas, entradas/saídas realizadas, resultado de caixa, previsto a receber/pagar no prazo, vencidos do mês, cards "A receber" e "Contas a pagar" do mês (monthPendingReceivables/monthPendingPayables) e principais categorias realizadas. Funciona para meses passados, atual e futuros (futuro = projeção pelos títulos em aberto).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['monthKey'],
      properties: { monthKey: MONTH_KEY_SCHEMA },
    },
  },
  {
    name: AGENT_MONTH_SERIES_TOOL_NAME,
    description:
      'Série mensal oficial da empresa inteira (até 24 meses terminando em endMonthKey): faturamento, despesas, entradas, saídas e resultado de caixa por mês. Use para melhor/pior mês, tendência, média, ano, trimestre, semestre ou projeção dos próximos meses (endMonthKey no futuro).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['endMonthKey', 'months'],
      properties: {
        endMonthKey: MONTH_KEY_SCHEMA,
        months: { type: 'integer', minimum: 1, maximum: AGENT_SERIES_MAX_MONTHS },
      },
    },
  },
  {
    name: AGENT_CURRENT_POSITION_TOOL_NAME,
    description:
      'Estoque TOTAL em aberto hoje, de TODOS os vencimentos (inclui parcelas de meses e anos futuros), e inadimplência. NÃO é o card "Contas a pagar"/"A receber" do mês: para isso use financial_month_summary (monthPendingPayables/monthPendingReceivables).',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: AGENT_LIST_COST_CENTERS_TOOL_NAME,
    description:
      'Lista os centros de custo cadastrados da empresa (nome, código, ativo). Use para conferir o nome exato antes de consultar um centro ou quando o usuário perguntar quais existem.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: AGENT_BILLING_COST_CENTER_TOOL_NAME,
    description:
      'Faturamento oficial de UM centro de custo em um mês (months=1) ou em uma série de meses terminando em monthKey.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['costCenterQuery', 'monthKey'],
      properties: {
        costCenterQuery: { type: 'string', description: 'Nome ou código do centro de custo.' },
        monthKey: MONTH_KEY_SCHEMA,
        months: { type: 'integer', minimum: 1, maximum: AGENT_SERIES_MAX_MONTHS },
      },
    },
  },
];

export type AdvisorAgentToolDependencies = {
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly analytics: Pick<AnalyticsService, 'getFinancialStockSnapshot'>;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
};

function amount(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toString();
}

function topCategories(
  composition: MonthlyCashFlowRealizedCategoryComposition | null,
): { readonly name: string; readonly amount: string | null; readonly share: string | null }[] | null {
  if (composition === null) {
    return null;
  }
  return [...composition.items]
    .sort((left, right) => right.amount.comparedTo(left.amount))
    .slice(0, CATEGORY_TOP_N)
    .map((item) => ({ name: item.name, amount: amount(item.amount), share: amount(item.percentage) }));
}

/** Projeção compacta das peças oficiais do mês. null = indisponível (nunca zero). */
export function summarizeAgentMonth(flow: MonthlyCashFlow, withCategories: boolean) {
  return {
    monthKey: flow.monthKey,
    billing: amount(monthlyBilling(flow)),
    expenses: amount(monthlyExpenses(flow)),
    realizedInflows: amount(flow.realized.inflows),
    realizedOutflows: amount(flow.realized.outflows),
    cashResult: amount(flow.realized.result),
    expectedReceivables: amount(flow.expected.receivables),
    expectedPayables: amount(flow.expected.payables),
    expectedResult: amount(flow.expected.result),
    overdueOfMonthReceivables: amount(flow.overdue.ofMonth.receivables),
    overdueOfMonthPayables: amount(flow.overdue.ofMonth.payables),
    // Cards "A receber"/"Contas a pagar" da Home: pendências com vencimento no mês (vencidos do mês + hoje + a vencer).
    monthPendingReceivables: amount(flow.stock.receivables.open),
    monthPendingPayables: amount(flow.stock.payables.open),
    ...(withCategories
      ? {
          topRealizedInflowCategories: topCategories(flow.realizedByCategory.inflows),
          topRealizedOutflowCategories: topCategories(flow.realizedByCategory.outflows),
        }
      : {}),
  };
}

class AgentToolInputError extends Error {}

function readMonthKey(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || !isValidMonthKey(raw.trim())) {
    throw new AgentToolInputError(`${field} deve ser YYYY-MM válido.`);
  }
  return raw.trim();
}

function readMonths(raw: unknown, fallback: number | null): number {
  if (raw === undefined && fallback !== null) {
    return fallback;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > AGENT_SERIES_MAX_MONTHS) {
    throw new AgentToolInputError(`months deve ser inteiro entre 1 e ${AGENT_SERIES_MAX_MONTHS}.`);
  }
  return raw;
}

function readText(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > 120) {
    throw new AgentToolInputError(`${field} é obrigatório.`);
  }
  return raw.trim();
}

const EXTRA_NAMES = new Set(AGENT_EXTRA_TOOLS.map((tool) => tool.name));

/**
 * Executor do agente: tools legadas homologadas + tools de resumo/série/posição.
 * Erros viram resultado ok=false para o modelo se corrigir, nunca exceção.
 */
export function createAdvisorAgentToolExecutor(input: {
  readonly base?: AdvisorAnalyticalToolExecutor;
  readonly deps: AdvisorAgentToolDependencies;
}): AdvisorAnalyticalToolExecutor {
  const { deps } = input;
  return {
    tools: [...(input.base?.tools ?? []), ...AGENT_EXTRA_TOOLS],
    async execute(request) {
      const { call } = request;
      if (!EXTRA_NAMES.has(call.name)) {
        if (input.base === undefined) {
          return failure(call.id, call.name, 'Tool desconhecida.');
        }
        return input.base.execute(request);
      }
      const tenantId = request.tenantId.trim();
      if (tenantId === '') {
        return failure(call.id, call.name, 'Tenant ausente no runtime.');
      }
      try {
        const args = call.arguments;
        let payload: unknown;
        let cardinality = 1;
        if (call.name === AGENT_MONTH_SUMMARY_TOOL_NAME) {
          const monthKey = readMonthKey(args.monthKey, 'monthKey');
          const flow = await deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now: request.now });
          payload = { status: 'OK', ...summarizeAgentMonth(flow, true) };
        } else if (call.name === AGENT_MONTH_SERIES_TOOL_NAME) {
          const endMonthKey = readMonthKey(args.endMonthKey, 'endMonthKey');
          const months = readMonths(args.months, null);
          const keys = Array.from({ length: months }, (_, index) =>
            shiftCivilMonthKey(endMonthKey, index - months + 1),
          );
          const flows = await Promise.all(
            keys.map((monthKey) => deps.cashFlow.getMonthlyCashFlow({ tenantId, monthKey, now: request.now })),
          );
          payload = { status: 'OK', months: flows.map((flow) => summarizeAgentMonth(flow, false)) };
          cardinality = flows.length;
        } else if (call.name === AGENT_CURRENT_POSITION_TOOL_NAME) {
          const snapshot = await deps.analytics.getFinancialStockSnapshot({ tenantId, now: request.now });
          payload = serializeCurrentSnapshotViaUniversal(snapshot);
        } else if (call.name === AGENT_LIST_COST_CENTERS_TOOL_NAME) {
          const rows = await deps.costCenters.listByTenant(tenantId);
          payload = {
            status: 'OK',
            costCenters: rows.map((row) => ({ name: row.name, code: row.code, active: row.active })),
          };
          cardinality = rows.length;
        } else {
          const costCenterQuery = readText(args.costCenterQuery, 'costCenterQuery');
          const monthKey = readMonthKey(args.monthKey, 'monthKey');
          const months = readMonths(args.months, 1);
          const query =
            months === 1
              ? buildBillingCostCenterMonthQuery({ monthKey, costCenterQuery })
              : buildBillingCostCenterSeriesQuery({ endMonthKey: monthKey, count: months, costCenterQuery });
          const outcome = await executeAnalyticalQuery({
            query,
            runtime: {
              tenantId,
              now: request.now,
              planningCashFlow: deps.cashFlow,
              costCenters: deps.costCenters,
            },
          });
          if (!outcome.ok) {
            return failure(call.id, call.name, outcome.message);
          }
          payload = outcome.legacyFact;
        }
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: JSON.stringify(payload),
          resultCardinality: cardinality,
        };
      } catch (error) {
        const message =
          error instanceof AgentToolInputError ? error.message : 'Não consegui consultar esse dado agora.';
        return failure(call.id, call.name, message);
      }
    },
  };
}

function failure(id: string, name: string, message: string): AdvisorAnalyticalToolResult {
  return {
    id,
    name,
    ok: false,
    content: JSON.stringify({ status: 'UNAVAILABLE', message }),
    resultCardinality: 0,
  };
}
