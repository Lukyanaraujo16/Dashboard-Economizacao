import { ValidationError } from '../../../shared/errors/application-error.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { DashboardOverviewFacade } from '../../dashboard/services/dashboard-overview.facade.js';
import { parseCashExpectedHorizonQuery } from '../../dashboard/http/parse-cash-expected-horizon-query.js';
import {
  parseCashRealizedDetailsCategoryKey,
  parseCashRealizedDetailsCategoryKind,
  parseCashRealizedDetailsDirection,
  parseCashRealizedDetailsLimit,
  parseCashRealizedDetailsOffset,
} from '../../dashboard/http/parse-cash-realized-details-query.js';
import { parseCashRealizedDayDetailsQuery } from '../../dashboard/http/parse-cash-realized-day-details-query.js';
import { parseCashRealizedMonthDetailsQuery } from '../../dashboard/http/parse-cash-realized-month-details-query.js';
import { parseDashboardCategoryQuery } from '../../dashboard/http/parse-dashboard-category-query.js';
import { parseDashboardCostCenterListPeriod } from '../../dashboard/http/parse-dashboard-cost-center-list-period.js';
import { parseDashboardCostCenterQuery } from '../../dashboard/http/parse-dashboard-cost-center-query.js';
import { parseDashboardMonth } from '../../dashboard/http/parse-dashboard-month.js';
import { parseDashboardSituationQuery } from '../../dashboard/http/parse-dashboard-situation-query.js';
import { parseDashboardUpcomingDays } from '../../dashboard/http/parse-dashboard-upcoming-days.js';
import { parseReportMonthRange } from '../../reports/http/parse-report-month-range.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type {
  AdvisorAnalyticalToolDefinition,
  AdvisorAnalyticalToolExecutor,
} from './advisor-analytical-tools.js';

/**
 * Tools de leitura da Dashboard inteira para o modo agente (ADR-051).
 * Cada tool espelha uma rota GET: mesmos parsers, mesma facade, mesmos números.
 * Tenant vem do runtime (contexto sintético role USER do próprio tenant). Escritas (metas) ficam fora.
 */
type Query = Record<string, string>;

type DashboardTool = {
  readonly name: string;
  readonly description: string;
  readonly params: readonly ParamKey[];
  readonly required?: readonly ParamKey[];
  readonly run: (facade: DashboardOverviewFacade, auth: AuthenticatedRequestContext, query: Query) => Promise<unknown>;
};

const PARAMS = {
  month: { type: 'string', description: 'Mês YYYY-MM. Ausente = mês corrente.', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  costCenter: { type: 'string', description: 'Centro de custo (nome, código ou id). Ausente = empresa inteira.' },
  category: { type: 'string', description: 'Categoria financeira (nome ou id). Ausente = todas.' },
  situation: { type: 'string', enum: ['settled', 'open', 'overdue'], description: 'settled=quitado, open=em aberto, overdue=vencido. Ausente = todas.' },
  days: { type: 'integer', enum: [7, 15, 30] },
  horizon: { type: 'integer', enum: [3, 6, 12], description: 'Meses à frente.' },
  date: { type: 'string', description: 'Dia YYYY-MM-DD.', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  direction: { type: 'string', enum: ['inflows', 'outflows'], description: 'inflows=entradas, outflows=saídas.' },
  limit: { type: 'integer', minimum: 1 },
  offset: { type: 'integer', minimum: 0 },
  from: { type: 'string', description: 'Mês inicial YYYY-MM.', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  to: { type: 'string', description: 'Mês final YYYY-MM (até 24 meses).', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  categoryKey: { type: 'string', description: 'key da categoria retornada por dashboard_monthly_cash_flow.' },
  categoryKind: { type: 'string', enum: ['category', 'other', 'uncategorized', 'imprecise'] },
} as const;
type ParamKey = keyof typeof PARAMS;

const FILTERS: readonly ParamKey[] = ['costCenter', 'category'];

export const ADVISOR_DASHBOARD_TOOLS: readonly DashboardTool[] = [
  {
    name: 'dashboard_overview',
    description:
      'Estoque TOTAL em aberto hoje (a receber e a pagar de TODOS os vencimentos, inclusive meses e anos futuros), vencidos, inadimplência e última sincronização com a Conta Azul. NÃO é o card "Contas a pagar"/"A receber" do mês: para isso use dashboard_monthly_cash_flow (stock.payables.open/stock.receivables.open).',
    params: ['costCenter'],
    run: (f, a, q) => f.getOverview(a, parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_bank_balance',
    description: 'Saldo bancário oficial (snapshots da Conta Azul): saldo atual/do dia, saldo no fim de cada dia do mês, saldo do mês anterior e por conta. Use para "quanto tenho em caixa/no banco".',
    params: ['month'],
    run: (f, a, q) => f.getCashBalanceHistory(a, parseDashboardMonth(q)),
  },
  {
    name: 'dashboard_cash_projection',
    description: 'Projeção de caixa para os próximos 3, 6 ou 12 meses: previsto a receber e a pagar por mês e saldo bancário projetado a partir do saldo oficial.',
    params: ['month', 'horizon', ...FILTERS],
    required: ['horizon'],
    run: (f, a, q) =>
      f.getCashExpectedHorizon(a, {
        monthKey: parseDashboardMonth(q),
        horizon: parseCashExpectedHorizonQuery(q),
        costCenterId: parseDashboardCostCenterQuery(q),
        categoryId: parseDashboardCategoryQuery(q),
      }),
  },
  {
    name: 'dashboard_month_end_cash_pressure',
    description: 'Pressão de caixa até o fim do mês corrente: quanto ainda vence a pagar x a receber.',
    params: FILTERS,
    run: (f, a, q) => f.getMonthEndCashPressure(a, parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_upcoming_dues',
    description: 'Contas a receber e a pagar que vencem nos próximos 7, 15 ou 30 dias.',
    params: ['days', 'costCenter'],
    required: ['days'],
    run: (f, a, q) => f.getUpcoming(a, parseDashboardUpcomingDays(q), parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_cash_flow_forecast',
    description: 'Previsão de fluxo de caixa por período (entradas e saídas previstas).',
    params: FILTERS,
    run: (f, a, q) => f.getCashFlowForecast(a, parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  // Os cards legados de competência (getMonthlyRevenue/getMonthlyExpenses, F1-G) não são expostos:
  // não alimentam a Home e divergem dos cards de caixa (CASH-4B).
  {
    name: 'dashboard_monthly_cash_flow',
    description:
      'Cards do mês da Home (Faturamento, A receber, Despesas, Contas a pagar): realizado (recebido/pago), previsto no prazo (a receber/a pagar), vencidos, composição por categoria (com categoryKey) e série diária. Faturamento = recebido + a receber no prazo; Despesas = pago + a pagar no prazo.',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getMonthlyCashFlow(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_cash_movement_history',
    description: 'Movimentação financeira dos últimos 12 meses terminando no mês: entradas, saídas e resultado por mês.',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getCashMovementHistory(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_expense_composition',
    description: 'Composição das despesas por categoria.',
    params: ['costCenter'],
    run: (f, a, q) => f.getExpenseComposition(a, parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_receivable_composition',
    description: 'Composição das contas a receber.',
    params: ['costCenter'],
    run: (f, a, q) => f.getReceivableComposition(a, parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_revenue_goal',
    description:
      'Meta de faturamento do mês, realizado x meta, % atingido e histórico dos últimos 6 meses. Sem costCenter = meta geral da empresa; com costCenter = meta daquele centro (status UNAVAILABLE = faturamento do centro indisponível).',
    params: ['month', 'costCenter'],
    run: (f, a, q) => f.getRevenueGoal(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_expense_ceiling',
    description:
      'Teto de despesas do mês e consumo atual. Sem costCenter = teto geral da empresa; com costCenter = teto daquele centro.',
    params: ['month', 'costCenter'],
    run: (f, a, q) => f.getExpenseCeiling(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q)),
  },
  {
    name: 'dashboard_executive_insights',
    description: 'Insights executivos do mês calculados pela Dashboard.',
    params: ['month', 'situation', ...FILTERS],
    run: (f, a, q) =>
      f.getMonthlyExecutiveInsights(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardSituationQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_expected_receivables',
    description: 'Lista de títulos a receber previstos no mês (cliente, valor, vencimento).',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getExpectedReceivableDetails(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_expected_payables',
    description: 'Lista de títulos a pagar previstos no mês (fornecedor, valor, vencimento).',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getExpectedPayableDetails(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_receivable_stock',
    description: 'Títulos a receber pendentes do mês (inclui vencidos do mês).',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getReceivableStockDetails(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_payable_stock',
    description: 'Títulos a pagar pendentes do mês (inclui vencidos do mês).',
    params: ['month', ...FILTERS],
    run: (f, a, q) =>
      f.getPayableStockDetails(a, parseDashboardMonth(q), parseDashboardCostCenterQuery(q), parseDashboardCategoryQuery(q)),
  },
  {
    name: 'dashboard_day_movements',
    description: 'Lançamentos realizados (entradas ou saídas) em um dia específico.',
    params: ['date', 'direction', 'limit', ...FILTERS],
    required: ['date', 'direction'],
    run: (f, a, q) => {
      const parsed = parseCashRealizedDayDetailsQuery(withoutFilters(q));
      return f.getCashRealizedDayDetails(a, {
        ...parsed,
        costCenterId: parseDashboardCostCenterQuery(q),
        categoryId: parseDashboardCategoryQuery(q),
      });
    },
  },
  {
    name: 'dashboard_month_movements',
    description: 'Lançamentos realizados (entradas ou saídas) do mês, paginados.',
    params: ['month', 'direction', 'limit', 'offset', ...FILTERS],
    required: ['month', 'direction'],
    run: (f, a, q) => {
      const parsed = parseCashRealizedMonthDetailsQuery(withoutFilters(q));
      return f.getCashRealizedMonthDetails(a, {
        ...parsed,
        costCenterId: parseDashboardCostCenterQuery(q),
        categoryId: parseDashboardCategoryQuery(q),
      });
    },
  },
  {
    name: 'dashboard_category_movements',
    description: 'Lançamentos realizados de uma categoria do mês (categoryKey/categoryKind vêm de dashboard_monthly_cash_flow).',
    params: ['month', 'direction', 'categoryKey', 'categoryKind', 'limit', 'offset', ...FILTERS],
    required: ['direction', 'categoryKey'],
    run: (f, a, q) => {
      const limit = parseCashRealizedDetailsLimit(q);
      const offset = parseCashRealizedDetailsOffset(q);
      return f.getCashRealizedDetails(a, {
        monthKey: parseDashboardMonth(q),
        direction: parseCashRealizedDetailsDirection(q),
        categoryKey: parseCashRealizedDetailsCategoryKey(q),
        categoryKind: parseCashRealizedDetailsCategoryKind(q),
        costCenterId: parseDashboardCostCenterQuery(q),
        categoryId: parseDashboardCategoryQuery(q),
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      });
    },
  },
  {
    name: 'dashboard_revenue_report',
    description: 'Relatório de faturamento entre dois meses (até 24): totais e mês a mês.',
    params: ['from', 'to', 'situation', ...FILTERS],
    required: ['from', 'to'],
    run: (f, a, q) => {
      const range = parseReportMonthRange(q);
      return f.getRevenueReport(a, range.from, range.to, parseDashboardCostCenterQuery(q), parseDashboardSituationQuery(q), parseDashboardCategoryQuery(q));
    },
  },
  {
    name: 'dashboard_expenses_report',
    description: 'Relatório de despesas entre dois meses (até 24): totais e mês a mês.',
    params: ['from', 'to', 'situation', ...FILTERS],
    required: ['from', 'to'],
    run: (f, a, q) => {
      const range = parseReportMonthRange(q);
      return f.getExpensesReport(a, range.from, range.to, parseDashboardCostCenterQuery(q), parseDashboardSituationQuery(q), parseDashboardCategoryQuery(q));
    },
  },
  {
    name: 'dashboard_categories',
    description: 'Categorias financeiras visíveis no mês (id, nome, tipo).',
    params: ['month'],
    run: (f, a, q) => {
      const period = parseDashboardCostCenterListPeriod(q);
      return f.listCategories(a, { from: period.from, to: period.to, monthKey: period.monthKey, context: period.context });
    },
  },
];

/** Parsers de dia/mês rejeitam chaves extras como tenant; filtros já são validados à parte. */
function withoutFilters(query: Query): Query {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== 'costCenter' && key !== 'category'),
  );
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

class DashboardToolInputError extends Error {}

/** Nome/código/id → id do próprio tenant. Ambíguo ou ausente → erro com opções para o modelo. */
export function resolveTenantEntityId(
  rows: readonly { readonly id: string; readonly name: string; readonly code?: string | null }[],
  raw: string,
  label: string,
): string {
  const wanted = fold(raw);
  const exact = rows.filter(
    (row) => row.id === raw.trim() || fold(row.name) === wanted || (row.code != null && fold(row.code) === wanted),
  );
  const matches = exact.length > 0 ? exact : rows.filter((row) => fold(row.name).includes(wanted));
  if (matches.length === 1) {
    return matches[0]!.id;
  }
  const options = (matches.length > 1 ? matches : rows).slice(0, 30).map((row) => row.name);
  throw new DashboardToolInputError(
    matches.length > 1
      ? `${label} "${raw}" é ambíguo. Opções: ${options.join('; ')}.`
      : `${label} "${raw}" não encontrado. Disponíveis: ${options.join('; ')}.`,
  );
}

export function listAdvisorDashboardToolDefinitions(): AdvisorAnalyticalToolDefinition[] {
  return ADVISOR_DASHBOARD_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [...(tool.required ?? [])],
      properties: Object.fromEntries(tool.params.map((key) => [key, PARAMS[key]])),
    },
  }));
}

export type AdvisorDashboardToolDependencies = {
  readonly facade: DashboardOverviewFacade;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
  readonly categories: Pick<FinancialCategoryReadRepository, 'listByTenant'>;
};

function agentAuth(tenantId: string, userId: string): AuthenticatedRequestContext {
  const now = new Date().toISOString();
  return {
    userId,
    tenantId,
    role: 'USER',
    sessionId: 'advisor-agent',
    createdAt: now,
    lastAccess: now,
    ip: null,
    userAgent: null,
    support: { active: false },
  };
}

/** Executor das tools da Dashboard; delega as demais ao executor base. */
export function createAdvisorDashboardToolExecutor(input: {
  readonly base: AdvisorAnalyticalToolExecutor;
  readonly deps: AdvisorDashboardToolDependencies;
}): AdvisorAnalyticalToolExecutor {
  const byName = new Map(ADVISOR_DASHBOARD_TOOLS.map((tool) => [tool.name, tool]));
  return {
    tools: [...input.base.tools, ...listAdvisorDashboardToolDefinitions()],
    async execute(request) {
      const tool = byName.get(request.call.name);
      if (tool === undefined) {
        return input.base.execute(request);
      }
      const { call } = request;
      const tenantId = request.tenantId.trim();
      try {
        const query: Query = {};
        for (const key of tool.params) {
          const value = call.arguments[key];
          if (value === undefined || value === null || value === '') continue;
          query[key] = String(value);
        }
        if (query.costCenter !== undefined) {
          query.costCenter = resolveTenantEntityId(
            await input.deps.costCenters.listByTenant(tenantId),
            query.costCenter,
            'Centro de custo',
          );
        }
        if (query.category !== undefined) {
          query.category = resolveTenantEntityId(
            await input.deps.categories.listByTenant(tenantId),
            query.category,
            'Categoria',
          );
        }
        const body = await tool.run(input.deps.facade, agentAuth(tenantId, 'advisor-agent'), query);
        return { id: call.id, name: call.name, ok: true, content: JSON.stringify(body), resultCardinality: 1 };
      } catch (error) {
        // Só mensagens de validação voltam ao modelo; erro interno nunca vaza.
        const message =
          error instanceof DashboardToolInputError || error instanceof ValidationError
            ? error.message
            : 'Não consegui consultar esse dado agora.';
        if (!(error instanceof DashboardToolInputError || error instanceof ValidationError)) {
          console.warn(
            JSON.stringify({ event: 'advisor_dashboard_tool_failed', tenantId, toolName: call.name }),
          );
        }
        return {
          id: call.id,
          name: call.name,
          ok: false,
          content: JSON.stringify({ status: 'UNAVAILABLE', message }),
          resultCardinality: 0,
        };
      }
    },
  };
}
