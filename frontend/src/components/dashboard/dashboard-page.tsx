'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import { isPlatformRole, useAuth } from '../../auth';
import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../lib/format-money-brl';
import {
  buildDashboardMonthSearchParams,
  currentDashboardMonthKey,
  dashboardMonthPhase,
  isValidDashboardMonthKey,
  monthShortLabelPtBr,
  resolveSelectedDashboardMonthKey,
  shiftDashboardMonthKey,
} from '../../lib/dashboard-month';
import {
  buildDashboardCostCenterSearchParams,
  isValidDashboardCostCenterId,
  resolveSelectedDashboardCostCenterId,
} from '../../lib/dashboard-cost-center';
import {
  buildDashboardSituationSearchParams,
  dashboardSituationLabel,
  isDashboardSituation,
  resolveSelectedDashboardSituation,
  type DashboardSituation,
} from '../../lib/dashboard-situation';
import {
  buildDashboardCategorySearchParams,
  isValidDashboardCategoryId,
  resolveSelectedDashboardCategoryId,
} from '../../lib/dashboard-category';
import {
  createDashboardFilterCache,
  dashboardCashFlowCacheKey,
  dashboardCashWindowCacheKey,
  dashboardFilterCacheKey,
} from '../../lib/dashboard-filter-cache';
import { getDashboardCostCenters } from '../../services/dashboard/cost-centers';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import { getDashboardCategories } from '../../services/dashboard/categories';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import { getDashboardMonthlyExpenses } from '../../services/dashboard/monthly-expenses';
import {
  DashboardMonthlyExpenseRequestError,
  type DashboardMonthlyExpenseResponse,
} from '../../services/dashboard/monthly-expenses.types';
import { getDashboardMonthlyRevenue } from '../../services/dashboard/monthly-revenue';
import {
  DashboardMonthlyRevenueRequestError,
  type DashboardMonthlyRevenueResponse,
} from '../../services/dashboard/monthly-revenue.types';
import { getDashboardMonthlyCashFlow } from '../../services/dashboard/monthly-cash-flow';
import {
  DashboardMonthlyCashFlowRequestError,
  type DashboardMonthlyCashFlowResponse,
} from '../../services/dashboard/monthly-cash-flow.types';
import { getDashboardExecutiveInsights } from '../../services/dashboard/executive-insights';
import {
  DashboardExecutiveInsightsRequestError,
  type DashboardExecutiveInsightsResponse,
} from '../../services/dashboard/executive-insights.types';
import { getDashboardCashFlowForecast } from '../../services/dashboard/forecast';
import {
  DashboardForecastRequestError,
  type DashboardCashFlowForecastResponse,
} from '../../services/dashboard/forecast.types';
import { getDashboardMonthEndCashPressure } from '../../services/dashboard/month-end-cash-pressure';
import {
  DashboardMonthEndCashPressureRequestError,
  type DashboardMonthEndCashPressureResponse,
} from '../../services/dashboard/month-end-cash-pressure.types';
import { getDashboardOverview } from '../../services/dashboard/overview';
import {
  DashboardOverviewRequestError,
  type DashboardOverviewResponse,
} from '../../services/dashboard/overview.types';
import {
  getDashboardRevenueGoal,
  putDashboardRevenueGoal,
} from '../../services/dashboard/revenue-goal';
import {
  DashboardRevenueGoalRequestError,
  type RevenueGoalSnapshot,
} from '../../services/dashboard/revenue-goal.types';
import { StateWrapper } from '../financial';
import { Badge, Button, Typography } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices, type CategoryDonutSlice } from './category-donut-view';
import {
  emptyManagerialBillingKpi,
  toManagerialBillingKpi,
} from './dashboard-managerial-billing-view';
import {
  toMonthlyCashFlowView,
  type MonthlyCashFlowView,
} from './dashboard-monthly-cash-flow-view';
import {
  competenceSharePercent,
  isMonthlyExpenseEmpty,
  toManagerialResultKpi,
  toMonthlyDelinquencyKpi,
  toMonthlyExpenseTotalKpi,
  toMonthlyOverdueKpi,
  toMonthlyReceivableKpi,
  toMonthlyReceivedKpi,
  type MonthlyContextKpiView,
} from './dashboard-monthly-kpis-view';
import { isMonthlyRevenueEmpty } from './dashboard-monthly-revenue-view';
import { DashboardCostCenterSelector } from './dashboard-cost-center-selector';
import { DashboardMonthSelector } from './dashboard-month-selector';
import { DashboardSituationSelector } from './dashboard-situation-selector';
import { DashboardCategorySelector } from './dashboard-category-selector';
import { executiveInsightRows } from './dashboard-executive-insights-view';
import { formatMonthKeyPtBr } from './dashboard-forecast-view';
import {
  formatSyncTimestamp,
  hasOperationalDashboardTenant,
  isNeverSynced,
  shouldSkipOverviewFetch,
} from './dashboard-overview-view';
import {
  CategoryRanking,
  CompactMonthEnd,
  CompetenceComparisonChart,
  CompetenceDailyBars,
  ExecutiveKpiCard,
  ExecutiveSignals,
  ForecastPanel,
  MonthlyCompare,
  RevenueGoalCard,
  RevenueGoalEditDialog,
  RevenueGoalHistoryList,
  Sparkline,
  WidgetExpandDialog,
  WidgetShell,
  accumulate,
  formatCompactBrl,
  outstandingSeries,
  parseAmount,
  receivedSeries,
  resultDailySeries,
  revenueGoalStatusLabel,
  signedSharePercent,
  subtractDecimalStrings,
  summarizeActiveDays,
  type CategoryRankingItem,
  type ExecutiveKpiState,
  type MonthlyComparePeriod,
  type MonthlyCompareRow,
} from './v2';
import styles from './dashboard-page.module.css';

const FIRST_SYNC_EMPTY = 'Aguardando a primeira sincronização';
const BLOCKED_EMPTY = 'Disponível junto com os indicadores da empresa.';
const PREVIOUS_MONTH_ERROR = 'Não foi possível carregar o mês anterior para comparação.';
const DAY_MS = 86_400_000;

/**
 * Copy das microvisualizações de snapshot: `received`/`outstanding` do dia são o
 * estado atual dos títulos daquela competência, nunca caixa daquele dia.
 */
const RECEIVED_SNAPSHOT_CAPTION =
  'Valor atualmente recebido dos títulos com competência neste dia';
const RECEIVABLE_SNAPSHOT_CAPTION =
  'Valor ainda em aberto dos títulos com competência neste dia';
const RESULT_DAILY_CAPTION = 'Resultado gerencial da competência no dia';

type OverviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'never-sync' }
  | { readonly kind: 'ready'; readonly data: DashboardOverviewResponse };

type MonthEndView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardMonthEndCashPressureResponse };

type ForecastView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardCashFlowForecastResponse };

type MonthlyExpenseView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly data: DashboardMonthlyExpenseResponse }
  | { readonly kind: 'ready'; readonly data: DashboardMonthlyExpenseResponse };

type MonthlyRevenueView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly data: DashboardMonthlyRevenueResponse }
  | { readonly kind: 'ready'; readonly data: DashboardMonthlyRevenueResponse };

/** CASH-4A: carregado em paralelo; ainda não alimenta KPIs visíveis. */
type MonthlyCashFlowLoadView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly data: DashboardMonthlyCashFlowResponse;
      readonly model: MonthlyCashFlowView;
    };

type RevenueGoalView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: RevenueGoalSnapshot };

type InsightsView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly data: DashboardExecutiveInsightsResponse }
  | { readonly kind: 'ready'; readonly data: DashboardExecutiveInsightsResponse };

/** Competência anterior — usada apenas no comparativo mensal. */
type PreviousMonthView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly revenue: DashboardMonthlyRevenueResponse;
      readonly expense: DashboardMonthlyExpenseResponse;
    };

/** Estado do overview aplicado a cada widget antes dos dados locais. */
type WidgetGate = 'loading' | 'first-sync' | 'blocked' | 'ready';

type KpiSlot = {
  readonly state: ExecutiveKpiState;
  readonly value?: string;
  readonly meta?: string;
  readonly emptyMessage?: string;
};

type ExpandKind =
  | 'billing'
  | 'expense'
  | 'comparison'
  | 'categories-revenue'
  | 'categories-expense'
  | 'compare'
  | 'daily'
  | 'goal';

/** Mantém dados anteriores / cache enquanto busca (troca de filtro CC1.3.1). */
type SoftLoadOptions = {
  readonly soft?: boolean;
};

function canKeepWidgetData(kind: string): boolean {
  return kind === 'ready' || kind === 'empty';
}

function widgetGate(view: OverviewView): WidgetGate {
  if (view.kind === 'loading') {
    return 'loading';
  }
  if (view.kind === 'never-sync') {
    return 'first-sync';
  }
  return view.kind === 'ready' ? 'ready' : 'blocked';
}

function gateSlot(gate: WidgetGate): KpiSlot | null {
  if (gate === 'loading') {
    return { state: 'loading' };
  }
  if (gate === 'first-sync') {
    return { state: 'empty', emptyMessage: FIRST_SYNC_EMPTY };
  }
  if (gate === 'blocked') {
    return { state: 'empty', emptyMessage: BLOCKED_EMPTY };
  }
  return null;
}

function kpiViewSlot(view: MonthlyContextKpiView): KpiSlot {
  if (view.state === 'ready') {
    return { state: 'ready', value: view.value, meta: view.meta };
  }
  return { state: 'empty', emptyMessage: view.emptyMessage ?? view.meta };
}

function revenueSlot(
  gate: WidgetGate,
  revenue: MonthlyRevenueView,
  build: (data: DashboardMonthlyRevenueResponse) => MonthlyContextKpiView,
): KpiSlot {
  const gated = gateSlot(gate);
  if (gated) {
    return gated;
  }
  if (revenue.kind === 'error') {
    return { state: 'empty', emptyMessage: revenue.message };
  }
  if (revenue.kind === 'idle' || revenue.kind === 'loading') {
    return { state: 'loading' };
  }
  return kpiViewSlot(build(revenue.data));
}

function expenseSlot(
  gate: WidgetGate,
  expense: MonthlyExpenseView,
  build: (data: DashboardMonthlyExpenseResponse) => MonthlyContextKpiView,
): KpiSlot {
  const gated = gateSlot(gate);
  if (gated) {
    return gated;
  }
  if (expense.kind === 'error') {
    return { state: 'empty', emptyMessage: expense.message };
  }
  if (expense.kind === 'idle' || expense.kind === 'loading') {
    return { state: 'loading' };
  }
  return kpiViewSlot(build(expense.data));
}

function resultSlot(
  gate: WidgetGate,
  revenue: DashboardMonthlyRevenueResponse | null,
  expense: DashboardMonthlyExpenseResponse | null,
  failed: boolean,
): KpiSlot {
  const gated = gateSlot(gate);
  if (gated) {
    return gated;
  }
  if (failed) {
    return {
      state: 'empty',
      emptyMessage: 'Depende das receitas e despesas da competência.',
    };
  }
  if (!revenue || !expense) {
    return { state: 'loading' };
  }
  return kpiViewSlot(toManagerialResultKpi(revenue, expense));
}

/** Dias restantes da competência corrente, incluindo hoje. */
function remainingDaysInMonth(today: string, monthEnd: string): number | undefined {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${monthEnd}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return undefined;
  }
  const days = Math.round((to - from) / DAY_MS) + 1;
  return days >= 0 ? days : undefined;
}

function toRankingItems(slices: readonly CategoryDonutSlice[]): readonly CategoryRankingItem[] {
  return slices.map((slice) => ({
    name: slice.name,
    amount: slice.amount,
    percentage: slice.percentage,
  }));
}

/** AGO — rótulo curto do mês para o comparativo. */
function compactMonthLabel(monthKey: string): string {
  return monthShortLabelPtBr(monthKey).toUpperCase();
}

/** Participação da parte no total, formatada como legenda da microvisualização. */
function shareLabel(part: string | null, total: string): string | undefined {
  if (part === null) {
    return undefined;
  }
  const share = competenceSharePercent(part, total);
  return share === null ? undefined : `${formatDelinquencyRate(share)} do total da competência`;
}

/** Decimal-string ou "—" quando o cash split não está disponível. */
function moneyOrDash(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMoneyBrl(value);
}

/** Total da competência em rótulo curto — cabe no furo do anel sem quebrar. */
function compactTotalLabel(total: string): string {
  return formatCompactBrl(parseAmount(total));
}

/**
 * Margem gerencial = resultado ÷ receitas da competência, com sinal preservado.
 * `undefined` quando não há receita na competência — não existe margem a declarar.
 */
function managerialMarginLabel(result: string, revenueTotal: string): string | undefined {
  if (isDecimalZero(revenueTotal)) {
    return undefined;
  }
  const margin = signedSharePercent(result, revenueTotal);
  return margin === null ? undefined : formatDelinquencyRate(margin);
}

type KpiFooterItem = { readonly label: string; readonly value: string };

/** Quebra do total da competência no pé do card de KPI. */
function KpiFooter({ items }: { readonly items: readonly KpiFooterItem[] }) {
  return (
    <dl className={styles.kpiFooter}>
      {items.map((item) => (
        <div key={item.label} className={styles.kpiFooterItem}>
          <dt className={styles.kpiFooterLabel}>{item.label}</dt>
          <dd className={styles.kpiFooterValue}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Corpo de widget: aplica o estado do overview, depois o do próprio bloco. */
function WidgetBody({
  gate,
  loadingLabel,
  error = null,
  onRetry,
  pending = false,
  blockedMessage = BLOCKED_EMPTY,
  children,
}: {
  readonly gate: WidgetGate;
  readonly loadingLabel: string;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly pending?: boolean;
  readonly blockedMessage?: string;
  readonly children?: ReactNode;
}) {
  if (gate === 'loading' || (gate === 'ready' && !error && pending)) {
    return <StateWrapper state="loading" loadingLabel={loadingLabel} align="start" />;
  }
  if (gate === 'first-sync') {
    return <StateWrapper state="empty" emptyMessage={FIRST_SYNC_EMPTY} align="start" />;
  }
  if (gate === 'blocked') {
    return <StateWrapper state="empty" emptyMessage={blockedMessage} align="start" />;
  }
  if (error) {
    return <StateWrapper state="error" errorMessage={error} onRetry={onRetry} align="start" />;
  }
  return <>{children}</>;
}

/**
 * Dashboard da empresa cliente — visão executiva mensal por competência (V2.1).
 * Todos os valores vêm em decimal-string do backend; a página apenas apresenta.
 */
export function DashboardPage() {
  const { user, support, status } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<OverviewView>({ kind: 'loading' });
  const [monthEndView, setMonthEndView] = useState<MonthEndView>({ kind: 'idle' });
  const [forecastView, setForecastView] = useState<ForecastView>({ kind: 'idle' });
  const [monthlyExpenseView, setMonthlyExpenseView] = useState<MonthlyExpenseView>({
    kind: 'idle',
  });
  const [monthlyRevenueView, setMonthlyRevenueView] = useState<MonthlyRevenueView>({
    kind: 'idle',
  });
  const [monthlyCashFlowView, setMonthlyCashFlowView] = useState<MonthlyCashFlowLoadView>({
    kind: 'idle',
  });
  const [insightsView, setInsightsView] = useState<InsightsView>({ kind: 'idle' });
  const [previousMonthView, setPreviousMonthView] = useState<PreviousMonthView>({ kind: 'idle' });
  const [revenueGoalView, setRevenueGoalView] = useState<RevenueGoalView>({ kind: 'idle' });
  const [costCenters, setCostCenters] = useState<readonly DashboardCostCenterItem[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(false);
  const [categories, setCategories] = useState<readonly DashboardCategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null);
  const [expandKind, setExpandKind] = useState<ExpandKind | null>(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const monthEndViewRef = useRef(monthEndView);
  monthEndViewRef.current = monthEndView;
  const forecastViewRef = useRef(forecastView);
  forecastViewRef.current = forecastView;
  const monthlyExpenseViewRef = useRef(monthlyExpenseView);
  monthlyExpenseViewRef.current = monthlyExpenseView;
  const monthlyRevenueViewRef = useRef(monthlyRevenueView);
  monthlyRevenueViewRef.current = monthlyRevenueView;
  const monthlyCashFlowViewRef = useRef(monthlyCashFlowView);
  monthlyCashFlowViewRef.current = monthlyCashFlowView;
  const insightsViewRef = useRef(insightsView);
  insightsViewRef.current = insightsView;
  const previousMonthViewRef = useRef(previousMonthView);
  previousMonthViewRef.current = previousMonthView;

  const overviewCacheRef = useRef(createDashboardFilterCache<DashboardOverviewResponse>());
  const revenueCacheRef = useRef(createDashboardFilterCache<DashboardMonthlyRevenueResponse>());
  const cashFlowCacheRef = useRef(createDashboardFilterCache<DashboardMonthlyCashFlowResponse>());
  const expenseCacheRef = useRef(createDashboardFilterCache<DashboardMonthlyExpenseResponse>());
  const insightsCacheRef = useRef(createDashboardFilterCache<DashboardExecutiveInsightsResponse>());
  const previousMonthCacheRef = useRef(
    createDashboardFilterCache<{
      readonly revenue: DashboardMonthlyRevenueResponse;
      readonly expense: DashboardMonthlyExpenseResponse;
    }>(),
  );
  const monthEndCacheRef = useRef(createDashboardFilterCache<DashboardMonthEndCashPressureResponse>());
  const forecastCacheRef = useRef(createDashboardFilterCache<DashboardCashFlowForecastResponse>());

  const loadOverview = useCallback(
    async (signal: AbortSignal, costCenterId: string | null, options?: SoftLoadOptions) => {
      if (shouldSkipOverviewFetch(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthEndView({ kind: 'idle' });
        setForecastView({ kind: 'idle' });
        setMonthlyExpenseView({ kind: 'idle' });
        setMonthlyRevenueView({ kind: 'idle' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setInsightsView({ kind: 'idle' });
        setPreviousMonthView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
        setCostCenters([]);
        return;
      }
      if (!hasOperationalDashboardTenant(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthEndView({ kind: 'idle' });
        setForecastView({ kind: 'idle' });
        setMonthlyExpenseView({ kind: 'idle' });
        setMonthlyRevenueView({ kind: 'idle' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setInsightsView({ kind: 'idle' });
        setPreviousMonthView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
        setCostCenters([]);
        return;
      }


      const soft = options?.soft === true;
      const cacheKey = costCenterId ?? '';
      const cached = overviewCacheRef.current.get(cacheKey);
      if (soft && cached && !isNeverSynced(cached)) {
        setView({ kind: 'ready', data: cached });
      } else if (!(soft && viewRef.current.kind === 'ready')) {
        setView({ kind: 'loading' });
      }

      try {
        const data = await getDashboardOverview(costCenterId);
        if (signal.aborted) {
          return;
        }
        if (isNeverSynced(data)) {
          setView({ kind: 'never-sync' });
          setMonthEndView({ kind: 'idle' });
          setForecastView({ kind: 'idle' });
          setMonthlyExpenseView({ kind: 'idle' });
          setMonthlyRevenueView({ kind: 'idle' });
          setMonthlyCashFlowView({ kind: 'idle' });
          setInsightsView({ kind: 'idle' });
          setPreviousMonthView({ kind: 'idle' });
          setRevenueGoalView({ kind: 'idle' });
          return;
        }
        overviewCacheRef.current.set(cacheKey, data);
        setView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (error instanceof DashboardOverviewRequestError && error.kind === 'forbidden') {
          setView({ kind: 'forbidden' });
          setMonthEndView({ kind: 'idle' });
          setForecastView({ kind: 'idle' });
          setMonthlyExpenseView({ kind: 'idle' });
          setMonthlyRevenueView({ kind: 'idle' });
          setMonthlyCashFlowView({ kind: 'idle' });
          setInsightsView({ kind: 'idle' });
          setPreviousMonthView({ kind: 'idle' });
          setRevenueGoalView({ kind: 'idle' });
          return;
        }
        const message =
          error instanceof DashboardOverviewRequestError
            ? error.message
            : 'Não foi possível carregar os indicadores da sua empresa.';
        if (soft && viewRef.current.kind === 'ready') {
          return;
        }
        setView({ kind: 'error', message });
        setMonthEndView({ kind: 'idle' });
        setForecastView({ kind: 'idle' });
        setMonthlyExpenseView({ kind: 'idle' });
        setMonthlyRevenueView({ kind: 'idle' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setInsightsView({ kind: 'idle' });
        setPreviousMonthView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
      }
    },
    [support, user],
  );

  const loadCostCenters = useCallback(async (signal: AbortSignal) => {
    setCostCentersLoading(true);
    try {
      const data = await getDashboardCostCenters();
      if (signal.aborted) {
        return;
      }
      setCostCenters(data.items);
    } catch {
      if (signal.aborted) {
        return;
      }
      setCostCenters([]);
    } finally {
      if (!signal.aborted) {
        setCostCentersLoading(false);
      }
    }
  }, []);

  const loadCategories = useCallback(async (signal: AbortSignal) => {
    setCategoriesLoading(true);
    setCategoriesError(false);
    try {
      const data = await getDashboardCategories();
      if (signal.aborted) {
        return;
      }
      setCategories(data.items);
    } catch {
      if (signal.aborted) {
        return;
      }
      setCategories([]);
      setCategoriesError(true);
    } finally {
      if (!signal.aborted) {
        setCategoriesLoading(false);
      }
    }
  }, []);

  const loadMonthEnd = useCallback(
    async (
      signal: AbortSignal,
      costCenterId: string | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardCashWindowCacheKey(costCenterId, categoryId);
      const cached = monthEndCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setMonthEndView({ kind: 'ready', data: cached });
      } else if (!(soft && monthEndViewRef.current.kind === 'ready')) {
        setMonthEndView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardMonthEndCashPressure(costCenterId, categoryId);
        if (signal.aborted) {
          return;
        }
        monthEndCacheRef.current.set(cacheKey, data);
        setMonthEndView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && monthEndViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardMonthEndCashPressureRequestError
            ? error.message
            : 'Não foi possível carregar a agenda até o fim do mês.';
        setMonthEndView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadForecast = useCallback(
    async (
      signal: AbortSignal,
      costCenterId: string | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardCashWindowCacheKey(costCenterId, categoryId);
      const cached = forecastCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setForecastView({ kind: 'ready', data: cached });
      } else if (!(soft && forecastViewRef.current.kind === 'ready')) {
        setForecastView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardCashFlowForecast(costCenterId, categoryId);
        if (signal.aborted) {
          return;
        }
        forecastCacheRef.current.set(cacheKey, data);
        setForecastView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && forecastViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardForecastRequestError
            ? error.message
            : 'Não foi possível carregar o fluxo previsto.';
        setForecastView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadMonthlyExpenses = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      situation: DashboardSituation | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardFilterCacheKey(monthKey, costCenterId, situation, categoryId);
      const cached = expenseCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setMonthlyExpenseView(
          isMonthlyExpenseEmpty(cached)
            ? { kind: 'empty', data: cached }
            : { kind: 'ready', data: cached },
        );
      } else if (!(soft && canKeepWidgetData(monthlyExpenseViewRef.current.kind))) {
        setMonthlyExpenseView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardMonthlyExpenses(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          situation,
          categoryId,
        );
        if (signal.aborted) {
          return;
        }
        expenseCacheRef.current.set(cacheKey, data);
        if (isMonthlyExpenseEmpty(data)) {
          setMonthlyExpenseView({ kind: 'empty', data });
          return;
        }
        setMonthlyExpenseView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && canKeepWidgetData(monthlyExpenseViewRef.current.kind)) {
          return;
        }
        const message =
          error instanceof DashboardMonthlyExpenseRequestError
            ? error.message
            : 'Não foi possível carregar as despesas do mês.';
        setMonthlyExpenseView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadMonthlyRevenue = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      situation: DashboardSituation | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardFilterCacheKey(monthKey, costCenterId, situation, categoryId);
      const cached = revenueCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setMonthlyRevenueView(
          isMonthlyRevenueEmpty(cached)
            ? { kind: 'empty', data: cached }
            : { kind: 'ready', data: cached },
        );
      } else if (!(soft && canKeepWidgetData(monthlyRevenueViewRef.current.kind))) {
        setMonthlyRevenueView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardMonthlyRevenue(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          situation,
          categoryId,
        );
        if (signal.aborted) {
          return;
        }
        revenueCacheRef.current.set(cacheKey, data);
        if (isMonthlyRevenueEmpty(data)) {
          setMonthlyRevenueView({ kind: 'empty', data });
          return;
        }
        setMonthlyRevenueView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && canKeepWidgetData(monthlyRevenueViewRef.current.kind)) {
          return;
        }
        const message =
          error instanceof DashboardMonthlyRevenueRequestError
            ? error.message
            : 'Não foi possível carregar as receitas do mês.';
        setMonthlyRevenueView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadMonthlyCashFlow = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardCashFlowCacheKey(monthKey, costCenterId, categoryId);
      const cached = cashFlowCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setMonthlyCashFlowView({
          kind: 'ready',
          data: cached,
          model: toMonthlyCashFlowView(cached),
        });
      } else if (!(soft && monthlyCashFlowViewRef.current.kind === 'ready')) {
        setMonthlyCashFlowView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardMonthlyCashFlow(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          categoryId,
        );
        if (signal.aborted) {
          return;
        }
        cashFlowCacheRef.current.set(cacheKey, data);
        setMonthlyCashFlowView({
          kind: 'ready',
          data,
          model: toMonthlyCashFlowView(data),
        });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && monthlyCashFlowViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardMonthlyCashFlowRequestError
            ? error.message
            : 'Não foi possível carregar o fluxo de caixa do mês.';
        setMonthlyCashFlowView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadInsights = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      situation: DashboardSituation | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardFilterCacheKey(monthKey, costCenterId, situation, categoryId);
      const cached = insightsCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setInsightsView(
          cached.insights.length === 0
            ? { kind: 'empty', data: cached }
            : { kind: 'ready', data: cached },
        );
      } else if (!(soft && canKeepWidgetData(insightsViewRef.current.kind))) {
        setInsightsView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardExecutiveInsights(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          situation,
          categoryId,
        );
        if (signal.aborted) {
          return;
        }
        insightsCacheRef.current.set(cacheKey, data);
        if (data.insights.length === 0) {
          setInsightsView({ kind: 'empty', data });
          return;
        }
        setInsightsView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && canKeepWidgetData(insightsViewRef.current.kind)) {
          return;
        }
        const message =
          error instanceof DashboardExecutiveInsightsRequestError
            ? error.message
            : 'Não foi possível carregar a leitura executiva.';
        setInsightsView({ kind: 'error', message });
      }
    },
    [],
  );

  /** Competência anterior em paralelo — mesmos filtros da Home, mês civil anterior. */
  const loadPreviousMonth = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      situation: DashboardSituation | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const soft = options?.soft === true;
      const cacheKey = dashboardFilterCacheKey(monthKey, costCenterId, situation, categoryId);
      const cached = previousMonthCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setPreviousMonthView({ kind: 'ready', revenue: cached.revenue, expense: cached.expense });
      } else if (!(soft && previousMonthViewRef.current.kind === 'ready')) {
        setPreviousMonthView({ kind: 'loading' });
      }
      const param = monthKey === todayMonthKey ? null : monthKey;
      try {
        const [revenue, expense] = await Promise.all([
          getDashboardMonthlyRevenue(param, costCenterId, situation, categoryId),
          getDashboardMonthlyExpenses(param, costCenterId, situation, categoryId),
        ]);
        if (signal.aborted) {
          return;
        }
        previousMonthCacheRef.current.set(cacheKey, { revenue, expense });
        setPreviousMonthView({ kind: 'ready', revenue, expense });
      } catch {
        if (signal.aborted) {
          return;
        }
        if (soft && previousMonthViewRef.current.kind === 'ready') {
          return;
        }
        setPreviousMonthView({ kind: 'error', message: PREVIOUS_MONTH_ERROR });
      }
    },
    [],
  );

  const loadRevenueGoal = useCallback(
    async (signal: AbortSignal, monthKey: string, todayMonthKey: string) => {
      setRevenueGoalView({ kind: 'loading' });
      try {
        const data = await getDashboardRevenueGoal(monthKey === todayMonthKey ? null : monthKey);
        if (signal.aborted) {
          return;
        }
        setRevenueGoalView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        const message =
          error instanceof DashboardRevenueGoalRequestError
            ? error.message
            : 'Não foi possível carregar a meta de faturamento.';
        setRevenueGoalView({ kind: 'error', message });
      }
    },
    [],
  );

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const controller = new AbortController();
    void loadCostCenters(controller.signal);
    void loadCategories(controller.signal);
    return () => controller.abort();
  }, [loadCategories, loadCostCenters, status]);

  const todayMonthKey =
    view.kind === 'ready' ? view.data.today.slice(0, 7) : currentDashboardMonthKey();

  const selectedMonthKey = useMemo(
    () => resolveSelectedDashboardMonthKey(searchParams, todayMonthKey),
    [searchParams, todayMonthKey],
  );

  const selectedCostCenterId = useMemo(
    () => resolveSelectedDashboardCostCenterId(searchParams),
    [searchParams],
  );

  const selectedSituation = useMemo(
    () => resolveSelectedDashboardSituation(searchParams),
    [searchParams],
  );

  const selectedCategoryId = useMemo(
    () => resolveSelectedDashboardCategoryId(searchParams),
    [searchParams],
  );

  const selectedCostCenterName = useMemo(() => {
    if (selectedCostCenterId === null) {
      return null;
    }
    return costCenters.find((item) => item.id === selectedCostCenterId)?.name ?? null;
  }, [costCenters, selectedCostCenterId]);

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === null) {
      return null;
    }
    return categories.find((item) => item.id === selectedCategoryId)?.name ?? null;
  }, [categories, selectedCategoryId]);

  const previousMonthKey = shiftDashboardMonthKey(selectedMonthKey, -1);
  const selectedMonthPhase = dashboardMonthPhase(selectedMonthKey, todayMonthKey);
  const cashWindowsApply = selectedMonthPhase === 'current';

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const controller = new AbortController();
    const soft = viewRef.current.kind === 'ready';
    void loadOverview(controller.signal, selectedCostCenterId, { soft });
    return () => controller.abort();
  }, [loadOverview, selectedCostCenterId, status]);

  useEffect(() => {
    if (view.kind !== 'ready' || !cashWindowsApply) {
      setMonthEndView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = monthEndViewRef.current.kind === 'ready';
    void loadMonthEnd(controller.signal, selectedCostCenterId, selectedCategoryId, { soft });
    return () => controller.abort();
  }, [cashWindowsApply, loadMonthEnd, selectedCategoryId, selectedCostCenterId, view.kind]);

  useEffect(() => {
    if (view.kind !== 'ready' || !cashWindowsApply) {
      setForecastView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = forecastViewRef.current.kind === 'ready';
    void loadForecast(controller.signal, selectedCostCenterId, selectedCategoryId, { soft });
    return () => controller.abort();
  }, [cashWindowsApply, loadForecast, selectedCategoryId, selectedCostCenterId, view.kind]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      setInsightsView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = canKeepWidgetData(insightsViewRef.current.kind);
    void loadInsights(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    loadInsights,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    selectedSituation,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      return;
    }
    const controller = new AbortController();
    const softRevenue = canKeepWidgetData(monthlyRevenueViewRef.current.kind);
    const softExpense = canKeepWidgetData(monthlyExpenseViewRef.current.kind);
    void loadMonthlyRevenue(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
      { soft: softRevenue },
    );
    void loadMonthlyExpenses(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
      { soft: softExpense },
    );
    return () => controller.abort();
  }, [
    loadMonthlyExpenses,
    loadMonthlyRevenue,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    selectedSituation,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      setMonthlyCashFlowView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = monthlyCashFlowViewRef.current.kind === 'ready';
    void loadMonthlyCashFlow(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    loadMonthlyCashFlow,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      setRevenueGoalView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    void loadRevenueGoal(controller.signal, selectedMonthKey, todayMonthKey);
    return () => controller.abort();
  }, [loadRevenueGoal, selectedMonthKey, todayMonthKey, view.kind]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      setPreviousMonthView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = previousMonthViewRef.current.kind === 'ready';
    void loadPreviousMonth(
      controller.signal,
      previousMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    loadPreviousMonth,
    previousMonthKey,
    selectedCategoryId,
    selectedCostCenterId,
    selectedSituation,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    const rawMonth = searchParams.get('month');
    const rawCostCenter = searchParams.get('costCenter');
    const rawSituation = searchParams.get('situation');
    const rawCategory = searchParams.get('category');
    let nextParams: URLSearchParams | null = null;
    if (rawMonth !== null && rawMonth.trim() !== '' && !isValidDashboardMonthKey(rawMonth)) {
      nextParams = buildDashboardMonthSearchParams(
        nextParams ?? searchParams,
        todayMonthKey,
        todayMonthKey,
      );
    }
    if (
      rawCostCenter !== null &&
      rawCostCenter.trim() !== '' &&
      !isValidDashboardCostCenterId(rawCostCenter)
    ) {
      nextParams = buildDashboardCostCenterSearchParams(nextParams ?? searchParams, null);
    }
    if (
      rawSituation !== null &&
      rawSituation.trim() !== '' &&
      !isDashboardSituation(rawSituation.trim())
    ) {
      nextParams = buildDashboardSituationSearchParams(nextParams ?? searchParams, null);
    }
    if (
      rawCategory !== null &&
      rawCategory.trim() !== '' &&
      !isValidDashboardCategoryId(rawCategory)
    ) {
      nextParams = buildDashboardCategorySearchParams(nextParams ?? searchParams, null);
    }
    if (nextParams) {
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [pathname, router, searchParams, todayMonthKey]);

  const selectMonth = useCallback(
    (monthKey: string) => {
      const next = buildDashboardMonthSearchParams(searchParams, monthKey, todayMonthKey);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams, todayMonthKey],
  );

  const selectCostCenter = useCallback(
    (costCenterId: string | null) => {
      const next = buildDashboardCostCenterSearchParams(searchParams, costCenterId);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const selectSituation = useCallback(
    (situation: DashboardSituation | null) => {
      const next = buildDashboardSituationSearchParams(searchParams, situation);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const selectCategory = useCallback(
    (categoryId: string | null) => {
      const next = buildDashboardCategorySearchParams(searchParams, categoryId);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const retryOverview = () => {
    void loadOverview(new AbortController().signal, selectedCostCenterId);
  };
  const retryMonthEnd = () => {
    void loadMonthEnd(new AbortController().signal, selectedCostCenterId, selectedCategoryId);
  };
  const retryForecast = () => {
    void loadForecast(new AbortController().signal, selectedCostCenterId, selectedCategoryId);
  };
  const retryRevenue = () => {
    void loadMonthlyRevenue(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
    );
  };
  const retryExpenses = () => {
    void loadMonthlyExpenses(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
    );
  };
  const retryInsights = () => {
    void loadInsights(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
    );
  };
  const retryPreviousMonth = () => {
    void loadPreviousMonth(
      new AbortController().signal,
      previousMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedSituation,
      selectedCategoryId,
    );
  };

  const retryRevenueGoal = () => {
    void loadRevenueGoal(new AbortController().signal, selectedMonthKey, todayMonthKey);
  };

  const openGoalEditor = useCallback(() => {
    setGoalSaveError(null);
    setGoalEditOpen(true);
  }, []);

  const saveRevenueGoal = useCallback(
    (target: string) => {
      setGoalSaving(true);
      setGoalSaveError(null);
      void putDashboardRevenueGoal({ month: selectedMonthKey, target })
        .then((data) => {
          setRevenueGoalView({ kind: 'ready', data });
          setGoalEditOpen(false);
        })
        .catch((error: unknown) => {
          setGoalSaveError(
            error instanceof DashboardRevenueGoalRequestError
              ? error.message
              : 'Não foi possível salvar a meta de faturamento.',
          );
        })
        .finally(() => setGoalSaving(false));
    },
    [selectedMonthKey],
  );

  const lastSyncAt = view.kind === 'ready' ? view.data.integration.lastSuccessfulSyncAt : null;
  const freshness = formatSyncTimestamp(lastSyncAt);
  const integrationStatus = view.kind === 'ready' ? view.data.integration.status : null;
  const gate = widgetGate(view);
  const monthLabel = formatMonthKeyPtBr(selectedMonthKey);
  const previousMonthLabel = formatMonthKeyPtBr(previousMonthKey);
  const pageSubtitle = [
    selectedCostCenterName !== null
      ? `Visão executiva · ${selectedCostCenterName}`
      : 'Visão executiva · Competência selecionada',
    selectedSituation !== null ? dashboardSituationLabel(selectedSituation) : null,
    selectedCategoryName,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  const sliceFilterActive =
    selectedCostCenterId !== null || selectedSituation !== null || selectedCategoryId !== null;

  const revenueData =
    monthlyRevenueView.kind === 'ready' || monthlyRevenueView.kind === 'empty'
      ? monthlyRevenueView.data
      : null;
  const expenseData =
    monthlyExpenseView.kind === 'ready' || monthlyExpenseView.kind === 'empty'
      ? monthlyExpenseView.data
      : null;
  const insightsData =
    insightsView.kind === 'ready' || insightsView.kind === 'empty' ? insightsView.data : null;

  const revenueError = monthlyRevenueView.kind === 'error' ? monthlyRevenueView.message : null;
  const expenseError = monthlyExpenseView.kind === 'error' ? monthlyExpenseView.message : null;
  const insightsError = insightsView.kind === 'error' ? insightsView.message : null;
  const revenueGoalData = revenueGoalView.kind === 'ready' ? revenueGoalView.data : null;
  const revenueGoalError = revenueGoalView.kind === 'error' ? revenueGoalView.message : null;
  const canExpandGoal = gate === 'ready' && revenueGoalData !== null;
  const monthEndError = monthEndView.kind === 'error' ? monthEndView.message : null;
  const forecastError = forecastView.kind === 'error' ? forecastView.message : null;
  const previousMonthError =
    previousMonthView.kind === 'error' ? previousMonthView.message : null;
  const comparisonError = revenueError ?? expenseError;

  const expenseSlices = useMemo(
    () => (expenseData ? presentTopCategoryDonutSlices(expenseData.payables.items) : []),
    [expenseData],
  );
  const allExpenseSlices = useMemo(
    () =>
      expenseData
        ? presentTopCategoryDonutSlices(
            expenseData.payables.items,
            expenseData.payables.items.length,
          )
        : [],
    [expenseData],
  );
  const revenueSlices = useMemo(
    () => (revenueData ? presentTopCategoryDonutSlices(revenueData.receivables.items) : []),
    [revenueData],
  );
  const allRevenueSlices = useMemo(
    () =>
      revenueData
        ? presentTopCategoryDonutSlices(
            revenueData.receivables.items,
            revenueData.receivables.items.length,
          )
        : [],
    [revenueData],
  );

  const billingKpi = revenueData
    ? toManagerialBillingKpi(revenueData, selectedMonthPhase)
    : emptyManagerialBillingKpi(selectedMonthPhase);
  const billingSlot = revenueSlot(gate, monthlyRevenueView, (data) =>
    toManagerialBillingKpi(data, selectedMonthPhase),
  );
  const receivedSlot = revenueSlot(gate, monthlyRevenueView, toMonthlyReceivedKpi);
  const receivableSlot = revenueSlot(gate, monthlyRevenueView, (data) =>
    toMonthlyReceivableKpi(data, selectedMonthPhase),
  );
  const expensesSlot = expenseSlot(gate, monthlyExpenseView, (data) =>
    toMonthlyExpenseTotalKpi(data, selectedMonthPhase),
  );
  const managerialResultSlot = resultSlot(
    gate,
    revenueData,
    expenseData,
    monthlyRevenueView.kind === 'error' || monthlyExpenseView.kind === 'error',
  );
  const overdueSlot = revenueSlot(gate, monthlyRevenueView, (data) =>
    toMonthlyOverdueKpi(data, selectedMonthPhase),
  );
  const delinquencySlot = revenueSlot(gate, monthlyRevenueView, toMonthlyDelinquencyKpi);

  const receivedShareLabel =
    revenueData && receivedSlot.state === 'ready' && revenueData.receivables.received !== null
      ? shareLabel(revenueData.receivables.received, revenueData.receivables.total)
      : undefined;
  const receivableShareLabel =
    revenueData &&
    receivableSlot.state === 'ready' &&
    revenueData.receivables.outstanding !== null
      ? shareLabel(revenueData.receivables.outstanding, revenueData.receivables.total)
      : undefined;

  const revenueHasCashSplit =
    revenueData !== null &&
    revenueData.costCenterCashSplit !== false &&
    revenueData.receivables.received !== null &&
    revenueData.receivables.outstanding !== null;
  const expenseHasCashSplit =
    expenseData !== null &&
    expenseData.costCenterCashSplit !== false &&
    expenseData.payables.paid !== null &&
    expenseData.payables.outstanding !== null;

  /** Séries de snapshot por dia de competência — leitura de estado, não de caixa. */
  const receivedDaily = useMemo(() => {
    if (!revenueData || !revenueHasCashSplit) {
      return undefined;
    }
    const series = receivedSeries(revenueData.receivables.daily);
    return series.length > 0 ? series : undefined;
  }, [revenueData, revenueHasCashSplit]);
  const receivableDaily = useMemo(() => {
    if (!revenueData || !revenueHasCashSplit) {
      return undefined;
    }
    const series = outstandingSeries(revenueData.receivables.daily);
    return series.length > 0 ? series : undefined;
  }, [revenueData, revenueHasCashSplit]);
  const resultDaily = useMemo(
    () =>
      revenueData && expenseData
        ? resultDailySeries(revenueData.receivables.daily, expenseData.payables.daily)
        : undefined,
    [expenseData, revenueData],
  );

  const managerialResultTotal =
    revenueData && expenseData
      ? subtractDecimalStrings(revenueData.receivables.total, expenseData.payables.total)
      : null;
  const managerialMargin =
    revenueData && managerialResultTotal !== null
      ? managerialMarginLabel(managerialResultTotal, revenueData.receivables.total)
      : undefined;

  const canExpandRevenue = gate === 'ready' && monthlyRevenueView.kind === 'ready';
  const canExpandExpense = gate === 'ready' && monthlyExpenseView.kind === 'ready';
  const canExpandComparison = gate === 'ready' && revenueData !== null && expenseData !== null;

  const monthEndSummary = monthEndView.kind === 'ready' ? monthEndView.data.summary : null;
  const monthEndRemainingDays =
    view.kind === 'ready' && monthEndView.kind === 'ready'
      ? remainingDaysInMonth(view.data.today, monthEndView.data.to)
      : undefined;

  /** Composição por categoria — widgets independentes (Receitas | Despesas). */
  const revenueComposition = {
    slices: revenueSlices,
    allSlices: allRevenueSlices,
    total: revenueData?.receivables.total ?? null,
    emptyMessage: 'Nenhuma receita com competência neste mês.',
    ariaLabel: 'Receitas por categoria do mês selecionado',
    allAriaLabel: 'Todas as receitas por categoria do mês selecionado',
    colorVar: '--color-series-revenue',
    expandTitle: 'Receitas por categoria',
    canExpand: canExpandRevenue,
  };
  const expenseComposition = {
    slices: expenseSlices,
    allSlices: allExpenseSlices,
    total: expenseData?.payables.total ?? null,
    emptyMessage: 'Nenhuma despesa com competência neste mês.',
    ariaLabel: 'Despesas por categoria do mês selecionado',
    allAriaLabel: 'Todas as despesas por categoria do mês selecionado',
    colorVar: '--color-series-expense',
    expandTitle: 'Despesas por categoria',
    canExpand: canExpandExpense,
  };
  const compositionExpandSide =
    expandKind === 'categories-revenue'
      ? revenueComposition
      : expandKind === 'categories-expense'
        ? expenseComposition
        : null;

  const comparePeriods = useMemo<readonly MonthlyComparePeriod[]>(
    () => [
      { id: previousMonthKey, label: compactMonthLabel(previousMonthKey) },
      { id: selectedMonthKey, label: compactMonthLabel(selectedMonthKey) },
    ],
    [previousMonthKey, selectedMonthKey],
  );

  const compareRows = useMemo<readonly MonthlyCompareRow[]>(() => {
    if (previousMonthView.kind !== 'ready' || !revenueData || !expenseData) {
      return [];
    }
    const previous = previousMonthView;
    if (
      isMonthlyRevenueEmpty(previous.revenue) &&
      isMonthlyExpenseEmpty(previous.expense) &&
      isMonthlyRevenueEmpty(revenueData) &&
      isMonthlyExpenseEmpty(expenseData)
    ) {
      return [];
    }
    return [
      {
        id: 'billing',
        label: 'Faturamento',
        tone: 'revenue',
        amounts: [previous.revenue.receivables.total, revenueData.receivables.total],
      },
      {
        id: 'expenses',
        label: 'Despesas',
        tone: 'expense',
        amounts: [previous.expense.payables.total, expenseData.payables.total],
      },
      {
        id: 'result',
        label: 'Resultado gerencial',
        tone: 'result',
        amounts: [
          subtractDecimalStrings(
            previous.revenue.receivables.total,
            previous.expense.payables.total,
          ),
          subtractDecimalStrings(revenueData.receivables.total, expenseData.payables.total),
        ],
      },
    ];
  }, [expenseData, previousMonthView, revenueData]);

  const comparePending =
    previousMonthView.kind === 'idle' ||
    previousMonthView.kind === 'loading' ||
    revenueData === null ||
    expenseData === null;
  const canExpandCompare = gate === 'ready' && compareRows.length > 0;
  const canExpandDaily = gate === 'ready' && revenueData !== null && expenseData !== null;

  const billingDays = revenueData ? summarizeActiveDays(revenueData.receivables.daily) : null;

  return (
    <div
      className={styles.root}
      data-dashboard-page="true"
      data-overview-state={view.kind}
      data-cash-flow-state={monthlyCashFlowView.kind}
      data-filter-stable={view.kind === 'ready' ? 'true' : undefined}
      data-situation={selectedSituation ?? 'all'}
      data-category={selectedCategoryId ?? 'all'}
    >
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <h1 className={styles.pageTitle}>Dashboard financeiro</h1>
          <p className={styles.pageSubtitle}>{pageSubtitle}</p>
        </div>
        <div className={styles.controlsCluster} data-v2-section="competencia">
          <DashboardMonthSelector
            selectedMonthKey={selectedMonthKey}
            todayMonthKey={todayMonthKey}
            onSelect={selectMonth}
            disabled={view.kind !== 'ready'}
          />
          <DashboardSituationSelector
            selected={selectedSituation}
            onSelect={selectSituation}
            disabled={view.kind !== 'ready'}
          />
          <DashboardCategorySelector
            items={categories}
            selectedId={selectedCategoryId}
            onSelect={selectCategory}
            disabled={view.kind !== 'ready'}
            loading={categoriesLoading}
            error={categoriesError}
          />
          {freshness ? (
            <p className={styles.freshnessPill}>
              <RefreshCw
                className={styles.freshnessIcon}
                size={13}
                strokeWidth={UI_ICON_STROKE}
                aria-hidden="true"
              />
              <span className={styles.freshnessLabel}>Última atualização</span>
              <time className={styles.freshnessValue} dateTime={lastSyncAt ?? undefined}>
                {freshness}
              </time>
            </p>
          ) : null}
        </div>
      </div>
      {costCenters.length > 0 ? (
        <div className={styles.costCenterRow} data-cost-center-row="true">
          <DashboardCostCenterSelector
            items={costCenters}
            selectedId={selectedCostCenterId}
            onSelect={selectCostCenter}
            disabled={view.kind !== 'ready'}
            loading={costCentersLoading}
          />
        </div>
      ) : null}

      {integrationStatus === 'DISCONNECTED' ? (
        <p className={styles.notice} role="status">
          <Badge variant="warning">Desconectada</Badge>
          <span>Integração desconectada. Exibindo os últimos dados sincronizados.</span>
        </p>
      ) : null}

      {integrationStatus === 'ERROR' ? (
        <p className={styles.notice} role="status">
          <Badge variant="danger">Atenção</Badge>
          <span>
            Não foi possível atualizar a integração. Exibindo os últimos dados sincronizados.
          </span>
        </p>
      ) : null}

      <section
        className={styles.kpiSection}
        aria-label="Resumo financeiro da competência"
        data-financial-section="resumo-financeiro"
        data-v2-section="kpis"
      >
        <div className={styles.kpiRow}>
          <ExecutiveKpiCard
            title={billingKpi.title}
            tone="revenue"
            state={billingSlot.state}
            value={billingSlot.value}
            meta={billingSlot.meta}
            emptyMessage={billingSlot.emptyMessage}
            sparklinePoints={revenueData?.receivables.daily}
            footer={
              revenueData && billingSlot.state === 'ready' && revenueHasCashSplit ? (
                <KpiFooter
                  items={[
                    {
                      label: 'Recebido',
                      value: moneyOrDash(revenueData.receivables.received),
                    },
                    {
                      label: 'A receber',
                      value: moneyOrDash(revenueData.receivables.outstanding),
                    },
                  ]}
                />
              ) : undefined
            }
            expandable={canExpandRevenue}
            onExpand={canExpandRevenue ? () => setExpandKind('billing') : undefined}
          />
          <ExecutiveKpiCard
            title="Já recebido"
            tone="received"
            state={receivedSlot.state}
            value={receivedSlot.value}
            meta={receivedSlot.meta}
            emptyMessage={receivedSlot.emptyMessage}
            sparklinePoints={receivedDaily}
            sparklineAriaLabel={RECEIVED_SNAPSHOT_CAPTION}
            sparklineCaption={RECEIVED_SNAPSHOT_CAPTION}
            footer={receivedShareLabel ? <p className={styles.kpiNote}>{receivedShareLabel}</p> : undefined}
            expandable={canExpandRevenue}
            onExpand={canExpandRevenue ? () => setExpandKind('billing') : undefined}
          />
          <ExecutiveKpiCard
            title="A receber"
            tone="receivable"
            state={receivableSlot.state}
            value={receivableSlot.value}
            meta={receivableSlot.meta}
            emptyMessage={receivableSlot.emptyMessage}
            sparklinePoints={receivableDaily}
            sparklineAriaLabel={RECEIVABLE_SNAPSHOT_CAPTION}
            sparklineCaption={RECEIVABLE_SNAPSHOT_CAPTION}
            footer={
              receivableShareLabel ? <p className={styles.kpiNote}>{receivableShareLabel}</p> : undefined
            }
          />
          <ExecutiveKpiCard
            title="Despesas"
            tone="expense"
            state={expensesSlot.state}
            value={expensesSlot.value}
            meta={expensesSlot.meta}
            emptyMessage={expensesSlot.emptyMessage}
            sparklinePoints={expenseData?.payables.daily}
            footer={
              expenseData && expensesSlot.state === 'ready' && expenseHasCashSplit ? (
                <KpiFooter
                  items={[
                    { label: 'Pago', value: moneyOrDash(expenseData.payables.paid) },
                    {
                      label: 'A pagar',
                      value: moneyOrDash(expenseData.payables.outstanding),
                    },
                  ]}
                />
              ) : undefined
            }
            expandable={canExpandExpense}
            onExpand={canExpandExpense ? () => setExpandKind('expense') : undefined}
          />
          <ExecutiveKpiCard
            title="Resultado gerencial"
            tone="result"
            state={managerialResultSlot.state}
            value={managerialResultSlot.value}
            meta={managerialResultSlot.meta}
            emptyMessage={managerialResultSlot.emptyMessage}
            sparklinePoints={resultDaily}
            sparklineAriaLabel={RESULT_DAILY_CAPTION}
            sparklineCaption={RESULT_DAILY_CAPTION}
            sparklineSigned
            footer={
              managerialMargin && managerialResultSlot.state === 'ready' ? (
                <KpiFooter items={[{ label: 'Margem', value: managerialMargin }]} />
              ) : undefined
            }
            expandable={canExpandComparison}
            onExpand={canExpandComparison ? () => setExpandKind('comparison') : undefined}
          />
        </div>

        {gate === 'ready' && revenueError ? (
          <StateWrapper
            state="error"
            errorMessage={revenueError}
            onRetry={retryRevenue}
            align="start"
          />
        ) : null}

        {gate === 'ready' && expenseError ? (
          <StateWrapper
            state="error"
            errorMessage={expenseError}
            onRetry={retryExpenses}
            align="start"
          />
        ) : null}

        {view.kind === 'error' ? (
          <StateWrapper
            state="error"
            errorMessage={view.message}
            onRetry={retryOverview}
            align="start"
          />
        ) : null}

        {view.kind === 'forbidden' ? (
          <Typography as="p" variant="body" className={styles.forbidden}>
            {user && isPlatformRole(user.role)
              ? 'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.'
              : 'Não há empresa associada a esta sessão para visualizar os indicadores.'}
          </Typography>
        ) : null}
      </section>

      <div className={styles.mainGrid}>
        <WidgetShell
          id="receitas-despesas"
          sectionId="receitas-mes"
          title="Receitas × Despesas"
          subtitle="Evolução diária acumulada"
          expandable={canExpandComparison}
          onExpand={canExpandComparison ? () => setExpandKind('comparison') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando receitas e despesas"
            error={comparisonError}
            onRetry={revenueError ? retryRevenue : retryExpenses}
            pending={!revenueData || !expenseData}
          >
            {revenueData && expenseData ? (
              <>
                <dl className={styles.totalsRow}>
                  <div className={styles.totalsItem} data-tone="revenue">
                    <dt className={styles.totalsLabel}>Receitas</dt>
                    <dd className={styles.totalsValue}>
                      {formatMoneyBrl(revenueData.receivables.total)}
                    </dd>
                  </div>
                  <div className={styles.totalsItem} data-tone="expense">
                    <dt className={styles.totalsLabel}>Despesas</dt>
                    <dd className={styles.totalsValue}>
                      {formatMoneyBrl(expenseData.payables.total)}
                    </dd>
                  </div>
                </dl>
                <CompetenceComparisonChart
                  revenueDaily={revenueData.receivables.daily}
                  expenseDaily={expenseData.payables.daily}
                  monthKey={selectedMonthKey}
                />
              </>
            ) : null}
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="despesas-categoria"
          sectionId="despesas-mes"
          title="Despesas por categoria"
          subtitle={`Competência de ${monthLabel}`}
          expandable={expenseComposition.canExpand}
          onExpand={
            expenseComposition.canExpand ? () => setExpandKind('categories-expense') : undefined
          }
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando despesas por categoria"
            error={expenseError}
            onRetry={retryExpenses}
            pending={expenseData === null}
          >
            {expenseComposition.slices.length === 0 ? (
              <StateWrapper
                state="empty"
                emptyMessage={expenseComposition.emptyMessage}
                align="start"
              />
            ) : (
              <CategoryDonutChart
                slices={expenseComposition.slices}
                ariaLabel={expenseComposition.ariaLabel}
                centerLabel={
                  expenseComposition.total !== null
                    ? compactTotalLabel(expenseComposition.total)
                    : undefined
                }
                centerCaption="competência"
                interactive
                size="md"
              />
            )}
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="receitas-categoria"
          sectionId="receitas-categoria"
          title="Receitas por categoria"
          subtitle={`Competência de ${monthLabel}`}
          expandable={revenueComposition.canExpand}
          onExpand={
            revenueComposition.canExpand ? () => setExpandKind('categories-revenue') : undefined
          }
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando receitas por categoria"
            error={revenueError}
            onRetry={retryRevenue}
            pending={revenueData === null}
          >
            {revenueComposition.slices.length === 0 ? (
              <StateWrapper
                state="empty"
                emptyMessage={revenueComposition.emptyMessage}
                align="start"
              />
            ) : (
              <CategoryDonutChart
                slices={revenueComposition.slices}
                ariaLabel={revenueComposition.ariaLabel}
                centerLabel={
                  revenueComposition.total !== null
                    ? compactTotalLabel(revenueComposition.total)
                    : undefined
                }
                centerCaption="competência"
                interactive
                size="md"
              />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div
        className={styles.secondaryGrid}
        data-cols={cashWindowsApply ? '4' : '3'}
      >
        <WidgetShell
          id="meta-faturamento"
          sectionId="meta-faturamento"
          title="Meta de faturamento"
          subtitle={monthLabel}
          expandable={canExpandGoal}
          onExpand={canExpandGoal ? () => setExpandKind('goal') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando meta de faturamento"
            error={revenueGoalError}
            onRetry={retryRevenueGoal}
            pending={revenueGoalData === null}
          >
            <RevenueGoalCard
              monthLabel={monthLabel}
              snapshot={revenueGoalData}
              onEdit={openGoalEditor}
            />
            {sliceFilterActive ? (
              <p className={styles.goalConsolidatedNote}>
                Meta consolidada da empresa — não é afetada pelos filtros da Home.
              </p>
            ) : null}
          </WidgetBody>
        </WidgetShell>

        {cashWindowsApply ? (
          <WidgetShell
            id="fim-do-mes"
            sectionId="ate-fim-do-mes"
            title="Até o fim do mês"
            subtitle="Compromissos previstos para o restante da competência"
          >
            <WidgetBody
              gate={gate}
              loadingLabel="Carregando agenda do mês"
              error={monthEndError}
              onRetry={retryMonthEnd}
              pending={monthEndSummary === null}
            >
              {monthEndSummary ? (
                <CompactMonthEnd summary={monthEndSummary} remainingDays={monthEndRemainingDays} />
              ) : null}
            </WidgetBody>
          </WidgetShell>
        ) : null}

        <WidgetShell
          id="leitura-executiva"
          sectionId="leitura-executiva"
          title="Leitura executiva"
          subtitle="Sinais da competência selecionada"
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando leitura executiva"
            error={insightsError}
            onRetry={retryInsights}
            pending={insightsData === null}
          >
            {insightsData ? (
              <ExecutiveSignals
                signals={executiveInsightRows(insightsData.insights)}
                emptyMessage="Sem dados de competência para leitura neste mês."
              />
            ) : null}
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="inadimplencia"
          sectionId="inadimplencia"
          title="Inadimplência"
          subtitle="Vencidos da competência"
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando inadimplência"
            error={revenueError}
            onRetry={retryRevenue}
            pending={revenueData === null}
          >
            {delinquencySlot.state === 'ready' ? (
              <dl className={styles.factList}>
                <div className={styles.factRow}>
                  <dt className={styles.factLabel}>Vencido</dt>
                  <dd className={styles.factValue}>
                    {overdueSlot.state === 'ready' ? overdueSlot.value : '—'}
                  </dd>
                </div>
                <div className={styles.factRow}>
                  <dt className={styles.factLabel}>Taxa da competência</dt>
                  <dd className={styles.factValue}>{delinquencySlot.value}</dd>
                </div>
              </dl>
            ) : (
              <StateWrapper
                state="empty"
                emptyMessage={delinquencySlot.emptyMessage ?? 'Sem títulos na competência'}
                align="start"
              />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className={styles.tertiaryGrid}>
        <WidgetShell
          id="comparativo-mensal"
          sectionId="comparativo-mensal"
          title="Comparativo mensal"
          subtitle={`${compactMonthLabel(selectedMonthKey)} × ${compactMonthLabel(previousMonthKey)}`}
          expandable={canExpandCompare}
          onExpand={canExpandCompare ? () => setExpandKind('compare') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando comparativo mensal"
            error={previousMonthError ?? comparisonError}
            onRetry={previousMonthError ? retryPreviousMonth : retryRevenue}
            pending={comparePending}
          >
            <MonthlyCompare
              periods={comparePeriods}
              rows={compareRows}
              emptyMessage={`Sem competência em ${previousMonthLabel} para comparar.`}
            />
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="movimentacao-diaria"
          sectionId="movimentacao-diaria"
          title="Movimentação diária da competência"
          subtitle="Competência · não é caixa"
          expandable={canExpandDaily}
          onExpand={canExpandDaily ? () => setExpandKind('daily') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando movimentação diária"
            error={comparisonError}
            onRetry={revenueError ? retryRevenue : retryExpenses}
            pending={!revenueData || !expenseData}
          >
            {revenueData && expenseData ? (
              <CompetenceDailyBars
                revenueDaily={revenueData.receivables.daily}
                expenseDaily={expenseData.payables.daily}
                monthKey={selectedMonthKey}
              />
            ) : null}
          </WidgetBody>
        </WidgetShell>
      </div>

      {cashWindowsApply ? (
        <WidgetShell
          id="fluxo-previsto"
          sectionId="fluxo-previsto"
          title="Fluxo previsto"
          subtitle="Entradas e saídas previstas para os próximos 90 dias"
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando fluxo previsto"
            error={forecastError}
            onRetry={retryForecast}
            pending={forecastView.kind !== 'ready'}
          >
            {forecastView.kind === 'ready' ? (
              <ForecastPanel buckets={forecastView.data.buckets} />
            ) : null}
          </WidgetBody>
        </WidgetShell>
      ) : null}

      <p className={styles.hint}>Clique em qualquer card para abrir o detalhe da competência.</p>

      {expandKind === 'billing' && revenueData ? (
        <WidgetExpandDialog
          open
          title={billingKpi.title}
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Já recebido</dt>
                <dd className={styles.statsValue}>
                  {moneyOrDash(revenueData.receivables.received)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Em aberto</dt>
                <dd className={styles.statsValue}>
                  {moneyOrDash(revenueData.receivables.outstanding)}
                </dd>
              </div>
              {billingDays ? (
                <div className={styles.statsItem}>
                  <dt className={styles.statsLabel}>
                    Média por dia com lançamento ({billingDays.days})
                  </dt>
                  <dd className={styles.statsValue}>{formatMoneyBrl(billingDays.average)}</dd>
                </div>
              ) : null}
            </dl>
            <p className={styles.expandLabel}>Receitas por dia de competência</p>
            <div className={styles.expandChart}>
              <Sparkline
                points={revenueData.receivables.daily}
                colorVar="--color-series-revenue"
                interactive
                ariaLabel="Receitas por dia de competência"
              />
            </div>
            <p className={styles.expandLabel}>Acumulado da competência</p>
            <div className={styles.expandChart}>
              <Sparkline
                points={accumulate(revenueData.receivables.daily)}
                colorVar="--color-series-revenue"
                interactive
                ariaLabel="Receitas acumuladas na competência"
              />
            </div>
            <p className={styles.expandLabel}>Maiores categorias de receita</p>
            <CategoryRanking
              items={toRankingItems(revenueSlices)}
              colorVar="--color-series-revenue"
              emptyMessage="Nenhuma receita com competência neste mês."
            />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'expense' && expenseData ? (
        <WidgetExpandDialog
          open
          title="Despesas"
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <p className={styles.expandLabel}>Despesas por dia de competência</p>
            <div className={styles.expandChart}>
              <Sparkline
                points={expenseData.payables.daily}
                colorVar="--color-series-expense"
                interactive
                ariaLabel="Despesas por dia de competência"
              />
            </div>
            <p className={styles.expandLabel}>Acumulado da competência</p>
            <div className={styles.expandChart}>
              <Sparkline
                points={accumulate(expenseData.payables.daily)}
                colorVar="--color-series-expense"
                interactive
                ariaLabel="Despesas acumuladas na competência"
              />
            </div>
            <p className={styles.expandLabel}>Maiores categorias de despesa</p>
            <CategoryRanking
              items={toRankingItems(expenseSlices)}
              emptyMessage="Nenhuma despesa com competência neste mês."
            />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'comparison' && revenueData && expenseData ? (
        <WidgetExpandDialog
          open
          title="Receitas × Despesas"
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <CompetenceComparisonChart
              revenueDaily={revenueData.receivables.daily}
              expenseDaily={expenseData.payables.daily}
              monthKey={selectedMonthKey}
            />
            <div className={styles.expandColumns}>
              <div>
                <p className={styles.expandLabel}>Receitas por categoria</p>
                <CategoryRanking
                  items={toRankingItems(revenueSlices)}
                  colorVar="--color-series-revenue"
                  emptyMessage="Nenhuma receita com competência neste mês."
                />
              </div>
              <div>
                <p className={styles.expandLabel}>Despesas por categoria</p>
                <CategoryRanking
                  items={toRankingItems(expenseSlices)}
                  emptyMessage="Nenhuma despesa com competência neste mês."
                />
              </div>
            </div>
          </div>
        </WidgetExpandDialog>
      ) : null}

      {compositionExpandSide && compositionExpandSide.total !== null ? (
        <WidgetExpandDialog
          open
          title={compositionExpandSide.expandTitle}
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <CategoryDonutChart
              slices={compositionExpandSide.allSlices}
              ariaLabel={compositionExpandSide.allAriaLabel}
              centerLabel={compactTotalLabel(compositionExpandSide.total)}
              centerCaption="competência"
              interactive
              size="md"
            />
            <CategoryRanking
              items={toRankingItems(compositionExpandSide.allSlices)}
              maxItems={compositionExpandSide.allSlices.length}
              colorVar={compositionExpandSide.colorVar}
              emptyMessage={compositionExpandSide.emptyMessage}
            />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'compare' && compareRows.length > 0 ? (
        <WidgetExpandDialog
          open
          title="Comparativo mensal"
          subtitle={`${monthLabel} × ${previousMonthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <MonthlyCompare periods={comparePeriods} rows={compareRows} />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'goal' && revenueGoalData ? (
        <WidgetExpandDialog
          open
          title="Meta de faturamento"
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Realizado</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(revenueGoalData.actual)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Meta</dt>
                <dd className={styles.statsValue}>
                  {revenueGoalData.target === null ? '—' : formatMoneyBrl(revenueGoalData.target)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Atingimento</dt>
                <dd className={styles.statsValue}>
                  {formatDelinquencyRate(revenueGoalData.achievementRate)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Status</dt>
                <dd className={styles.statsValue}>
                  {revenueGoalStatusLabel(revenueGoalData.status) ?? '—'}
                </dd>
              </div>
            </dl>
            <p className={styles.expandLabel}>Histórico por competência</p>
            <RevenueGoalHistoryList points={revenueGoalData.history} />
            <div>
              <Button variant="secondary" size="sm" onClick={openGoalEditor}>
                {revenueGoalData.target === null ? 'Definir meta' : 'Editar meta'}
              </Button>
            </div>
          </div>
        </WidgetExpandDialog>
      ) : null}

      <RevenueGoalEditDialog
        open={goalEditOpen}
        monthLabel={monthLabel}
        currentTarget={revenueGoalData?.target ?? null}
        saving={goalSaving}
        error={goalSaveError}
        onSubmit={saveRevenueGoal}
        onClose={() => setGoalEditOpen(false)}
      />

      {expandKind === 'daily' && revenueData && expenseData ? (
        <WidgetExpandDialog
          open
          title="Movimentação diária da competência"
          subtitle={`Competência de ${monthLabel}`}
          onClose={() => setExpandKind(null)}
        >
          <div className={styles.expandBody}>
            <CompetenceDailyBars
              revenueDaily={revenueData.receivables.daily}
              expenseDaily={expenseData.payables.daily}
              monthKey={selectedMonthKey}
            />
          </div>
        </WidgetExpandDialog>
      ) : null}
    </div>
  );
}
