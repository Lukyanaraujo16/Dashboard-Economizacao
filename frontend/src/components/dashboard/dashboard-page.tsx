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
  isDashboardSituation,
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
} from '../../lib/dashboard-filter-cache';
import { getDashboardCostCenters } from '../../services/dashboard/cost-centers';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import { getDashboardCategories } from '../../services/dashboard/categories';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import { getDashboardMonthlyCashFlow } from '../../services/dashboard/monthly-cash-flow';
import {
  DashboardMonthlyCashFlowRequestError,
  type DashboardMonthlyCashFlowResponse,
} from '../../services/dashboard/monthly-cash-flow.types';
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
import { buildCashExecutiveReading } from './dashboard-cash-executive-reading';
import { CashExecutiveReading } from './cash-executive-reading';
import { CashCategoryRanking } from './cash-category-ranking';
import { CashRealizedCategoryPanel } from './cash-realized-category-panel';
import {
  countNonZeroDailyPoints,
  formatPeakDayLabel,
  peakNonZeroDailyPoint,
} from './dashboard-cash-modal-view';
import {
  CASH_RECEIVABLE_SPARKLINE_CAPTION,
  CASH_RECEIVED_SPARKLINE_CAPTION,
  cashReceivableDailySeries,
  cashReceivedDailySeries,
  moneyOrDashCash,
  toCashBillingKpi,
  toCashExpensesKpi,
  toCashManagerialResultKpi,
  toCashOverdueReceivablesKpi,
  toCashReceivableKpi,
  toCashReceivedKpi,
  toOverviewDelinquencyRateKpi,
} from './dashboard-cash-kpis-view';
import {
  CASH_DAILY_EXPECTED_CAPTION,
  CASH_DAILY_REALIZED_CAPTION,
  CASH_EXPENSES_SPARKLINE_CAPTION,
  CASH_REALIZED_COMPARISON_CAPTION,
  CASH_RESULT_SPARKLINE_CAPTION,
  cashBillingCoverageRatio,
  cashExpectedPayablesSeries,
  cashExpectedReceivablesSeries,
  cashExpensesComposedSeries,
  cashManagerialResultComposedSeries,
  cashRealizedInflowsSeries,
  cashRealizedOutflowsSeries,
} from './dashboard-cash-series-view';
import {
  toMonthlyCashFlowView,
  type MonthlyCashFlowView,
} from './dashboard-monthly-cash-flow-view';
import { type MonthlyContextKpiView } from './dashboard-monthly-kpis-view';
import { DashboardCostCenterSelector } from './dashboard-cost-center-selector';
import { DashboardMonthSelector } from './dashboard-month-selector';
import { DashboardCategorySelector } from './dashboard-category-selector';
import { formatMonthKeyPtBr } from './dashboard-forecast-view';
import {
  formatSyncTimestamp,
  hasOperationalDashboardTenant,
  isNeverSynced,
  shouldSkipOverviewFetch,
} from './dashboard-overview-view';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices } from './category-donut-view';
import {
  CompactMonthEnd,
  CategoryRanking,
  CompetenceComparisonChart,
  CompetenceDailyBars,
  ExecutiveKpiCard,
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
  revenueGoalStatusLabel,
  signedSharePercent,
  subtractDecimalStrings,
  type CategoryRankingItem,
  type DailyPoint,
  type ExecutiveKpiState,
  type MonthlyComparePeriod,
  type MonthlyCompareRow,
} from './v2';
import styles from './dashboard-page.module.css';

const FIRST_SYNC_EMPTY = 'Aguardando a primeira sincronização';
const BLOCKED_EMPTY = 'Disponível junto com os indicadores da empresa.';
const PREVIOUS_MONTH_ERROR = 'Não foi possível carregar o mês anterior para comparação.';
/** Split de caixa ausente (filtro por centro de custo) — nunca cair para R$ 0. */
const CASH_SERIES_UNAVAILABLE =
  'Séries diárias de caixa indisponíveis para os filtros selecionados.';
const CASH_CATEGORY_EMPTY = 'Sem movimentação de caixa realizada neste mês.';
const CASH_CATEGORY_UNAVAILABLE =
  'Composição por categoria indisponível para os filtros selecionados.';
const DAY_MS = 86_400_000;

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

/** Fonte única dos KPIs (CASH-4B) e dos gráficos da Home (CASH-4C). */
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

/** Mês civil anterior em regime de caixa — usado apenas no comparativo mensal. */
type PreviousMonthView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly data: DashboardMonthlyCashFlowResponse;
      readonly model: MonthlyCashFlowView;
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
  | 'received'
  | 'receivable'
  | 'expense'
  | 'result'
  | 'comparison'
  | 'categories-revenue'
  | 'categories-expense'
  | 'compare'
  | 'daily'
  | 'goal'
  | 'month-end'
  | 'delinquency'
  | 'forecast';

/** Destaque opcional no modal de Despesas (navegação da Leitura executiva). */
type ExpenseExpandFocus = 'paid' | 'payable' | null;

/** Recorte das barras diárias de caixa: baixas realizadas ou vencimentos previstos. */
type DailyCashMode = 'realized' | 'expected';

function toRankingItems(
  items: readonly { readonly name: string; readonly amount: string; readonly percentage: string }[],
): readonly CategoryRankingItem[] {
  return items.map((item) => ({
    name: item.name,
    amount: item.amount,
    percentage: item.percentage,
  }));
}

function zeroSeriesLike(points: readonly DailyPoint[]): readonly DailyPoint[] {
  return points.map((point) => ({ date: point.date, amount: '0' }));
}

/** Recorte civil a partir de `fromDate` (inclusive) — usado em Até o fim do mês. */
function seriesFromDate(
  points: readonly DailyPoint[] | undefined,
  fromDate: string,
): readonly DailyPoint[] | undefined {
  if (!points) {
    return undefined;
  }
  const filtered = points.filter((point) => point.date >= fromDate);
  return filtered.length > 0 ? filtered : undefined;
}

const DAILY_MODES: readonly { readonly id: DailyCashMode; readonly label: string }[] = [
  { id: 'realized', label: 'Realizado' },
  { id: 'expected', label: 'Previsto' },
];

/** Mantém dados anteriores / cache enquanto busca (troca de filtro CC1.3.1). */
type SoftLoadOptions = {
  readonly soft?: boolean;
};

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

function cashKpiSlot(
  gate: WidgetGate,
  cashFlow: MonthlyCashFlowLoadView,
  build: (model: MonthlyCashFlowView) => MonthlyContextKpiView,
): KpiSlot {
  const gated = gateSlot(gate);
  if (gated) {
    return gated;
  }
  if (cashFlow.kind === 'error') {
    return { state: 'empty', emptyMessage: cashFlow.message };
  }
  if (cashFlow.kind === 'idle' || cashFlow.kind === 'loading') {
    return { state: 'loading' };
  }
  return kpiViewSlot(build(cashFlow.model));
}

/** Dias restantes do mês corrente, incluindo hoje. */
function remainingDaysInMonth(today: string, monthEnd: string): number | undefined {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${monthEnd}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return undefined;
  }
  const days = Math.round((to - from) / DAY_MS) + 1;
  return days >= 0 ? days : undefined;
}

/** AGO — rótulo curto do mês para o comparativo. */
function compactMonthLabel(monthKey: string): string {
  return monthShortLabelPtBr(monthKey).toUpperCase();
}

/** Participação da parte no total — legenda secundária dos KPIs de caixa. */
function shareLabel(part: string | null, total: string | null): string | undefined {
  if (part === null || total === null || isDecimalZero(total)) {
    return undefined;
  }
  const share = signedSharePercent(part, total);
  return share === null ? undefined : `${formatDelinquencyRate(share)} do faturamento`;
}

/**
 * Margem = resultado ÷ faturamento de caixa do mês, com sinal preservado.
 * `undefined` quando não há faturamento — não existe margem a declarar.
 */
function managerialMarginLabel(result: string, revenueTotal: string): string | undefined {
  if (isDecimalZero(revenueTotal)) {
    return undefined;
  }
  const margin = signedSharePercent(result, revenueTotal);
  return margin === null ? undefined : formatDelinquencyRate(margin);
}

type KpiFooterItem = { readonly label: string; readonly value: string };

/** Quebra do total do mês no pé do card de KPI. */
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
 * Dashboard da empresa cliente — KPIs e gráficos por regime de caixa (CASH-4C).
 * Fonte única de números e séries: MonthlyCashFlow do mês selecionado.
 */
export function DashboardPage() {
  const { user, support, status } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<OverviewView>({ kind: 'loading' });
  const [monthEndView, setMonthEndView] = useState<MonthEndView>({ kind: 'idle' });
  const [forecastView, setForecastView] = useState<ForecastView>({ kind: 'idle' });
  const [monthlyCashFlowView, setMonthlyCashFlowView] = useState<MonthlyCashFlowLoadView>({
    kind: 'idle',
  });
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
  const [expenseExpandFocus, setExpenseExpandFocus] = useState<ExpenseExpandFocus>(null);
  const [dailyMode, setDailyMode] = useState<DailyCashMode>('realized');

  const viewRef = useRef(view);
  viewRef.current = view;
  const monthEndViewRef = useRef(monthEndView);
  monthEndViewRef.current = monthEndView;
  const forecastViewRef = useRef(forecastView);
  forecastViewRef.current = forecastView;
  const monthlyCashFlowViewRef = useRef(monthlyCashFlowView);
  monthlyCashFlowViewRef.current = monthlyCashFlowView;
  const previousMonthViewRef = useRef(previousMonthView);
  previousMonthViewRef.current = previousMonthView;

  const overviewCacheRef = useRef(createDashboardFilterCache<DashboardOverviewResponse>());
  const cashFlowCacheRef = useRef(createDashboardFilterCache<DashboardMonthlyCashFlowResponse>());
  const previousMonthCacheRef = useRef(
    createDashboardFilterCache<DashboardMonthlyCashFlowResponse>(),
  );
  const monthEndCacheRef = useRef(createDashboardFilterCache<DashboardMonthEndCashPressureResponse>());
  const forecastCacheRef = useRef(createDashboardFilterCache<DashboardCashFlowForecastResponse>());

  const loadOverview = useCallback(
    async (signal: AbortSignal, costCenterId: string | null, options?: SoftLoadOptions) => {
      if (shouldSkipOverviewFetch(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthEndView({ kind: 'idle' });
        setForecastView({ kind: 'idle' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setPreviousMonthView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
        setCostCenters([]);
        return;
      }
      if (!hasOperationalDashboardTenant(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthEndView({ kind: 'idle' });
        setForecastView({ kind: 'idle' });
        setMonthlyCashFlowView({ kind: 'idle' });
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
          setMonthlyCashFlowView({ kind: 'idle' });
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
          setMonthlyCashFlowView({ kind: 'idle' });
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
        setMonthlyCashFlowView({ kind: 'idle' });
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

  /** Mês civil anterior em caixa — mesmos filtros da Home, sem situação. */
  const loadPreviousMonth = useCallback(
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
      const cached = previousMonthCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setPreviousMonthView({
          kind: 'ready',
          data: cached,
          model: toMonthlyCashFlowView(cached),
        });
      } else if (!(soft && previousMonthViewRef.current.kind === 'ready')) {
        setPreviousMonthView({ kind: 'loading' });
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
        previousMonthCacheRef.current.set(cacheKey, data);
        setPreviousMonthView({ kind: 'ready', data, model: toMonthlyCashFlowView(data) });
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
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    loadPreviousMonth,
    previousMonthKey,
    selectedCategoryId,
    selectedCostCenterId,
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
  const retryCashFlow = () => {
    void loadMonthlyCashFlow(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
    );
  };
  const retryPreviousMonth = () => {
    void loadPreviousMonth(
      new AbortController().signal,
      previousMonthKey,
      todayMonthKey,
      selectedCostCenterId,
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
      : 'Visão executiva · Fluxo de caixa do mês',
    selectedCategoryName,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  const sliceFilterActive =
    selectedCostCenterId !== null || selectedCategoryId !== null;

  const cashFlowModel =
    monthlyCashFlowView.kind === 'ready' ? monthlyCashFlowView.model : null;
  const cashFlowError =
    monthlyCashFlowView.kind === 'error' ? monthlyCashFlowView.message : null;
  const cashFlowPending = cashFlowModel === null && cashFlowError === null;

  const previousMonthError =
    previousMonthView.kind === 'error' ? previousMonthView.message : null;
  const revenueGoalData = revenueGoalView.kind === 'ready' ? revenueGoalView.data : null;
  const revenueGoalError = revenueGoalView.kind === 'error' ? revenueGoalView.message : null;
  const canExpandGoal = gate === 'ready' && revenueGoalData !== null;
  const monthEndError = monthEndView.kind === 'error' ? monthEndView.message : null;
  const forecastError = forecastView.kind === 'error' ? forecastView.message : null;

  const billingKpi = cashFlowModel
    ? toCashBillingKpi(cashFlowModel, selectedMonthPhase)
    : { title: 'Faturamento' as const };
  const billingSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashBillingKpi(model, selectedMonthPhase),
  );
  const receivedSlot = cashKpiSlot(gate, monthlyCashFlowView, toCashReceivedKpi);
  const receivableSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashReceivableKpi(model, selectedMonthPhase),
  );
  const expensesSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashExpensesKpi(model, selectedMonthPhase),
  );
  const managerialResultSlot = cashKpiSlot(gate, monthlyCashFlowView, toCashManagerialResultKpi);
  const overdueSlot = cashKpiSlot(gate, monthlyCashFlowView, toCashOverdueReceivablesKpi);
  const delinquencySlot =
    gate !== 'ready' || view.kind !== 'ready'
      ? (gateSlot(gate) ?? { state: 'loading' as const })
      : kpiViewSlot(toOverviewDelinquencyRateKpi(view.data));

  const receivedShareLabel =
    cashFlowModel && receivedSlot.state === 'ready' && cashFlowModel.received !== null
      ? shareLabel(cashFlowModel.received, cashFlowModel.billing)
      : undefined;
  const receivableShareLabel =
    cashFlowModel &&
    receivableSlot.state === 'ready' &&
    cashFlowModel.receivable !== null
      ? shareLabel(cashFlowModel.receivable, cashFlowModel.billing)
      : undefined;

  const cashHasSplit = cashFlowModel !== null && cashFlowModel.costCenterCashSplit;

  const receivedDaily = useMemo(
    () => (cashFlowModel ? cashReceivedDailySeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const receivableDaily = useMemo(
    () => (cashFlowModel ? cashReceivableDailySeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const expensesComposed = useMemo(
    () => (cashFlowModel ? cashExpensesComposedSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const resultComposed = useMemo(
    () => (cashFlowModel ? cashManagerialResultComposedSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const billingCoverage = useMemo(
    () => (cashFlowModel ? cashBillingCoverageRatio(cashFlowModel) : undefined),
    [cashFlowModel],
  );

  const realizedInflows = useMemo(
    () => (cashFlowModel ? cashRealizedInflowsSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const realizedOutflows = useMemo(
    () => (cashFlowModel ? cashRealizedOutflowsSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const expectedReceivables = useMemo(
    () => (cashFlowModel ? cashExpectedReceivablesSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const expectedPayables = useMemo(
    () => (cashFlowModel ? cashExpectedPayablesSeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const cashReading = useMemo(
    () => (cashFlowModel ? buildCashExecutiveReading(cashFlowModel) : null),
    [cashFlowModel],
  );

  const dailySeries =
    dailyMode === 'realized'
      ? { inflows: realizedInflows, outflows: realizedOutflows }
      : { inflows: expectedReceivables, outflows: expectedPayables };
  const dailySeriesReady =
    dailySeries.inflows !== undefined && dailySeries.outflows !== undefined;

  const managerialMargin =
    cashFlowModel &&
    cashFlowModel.managerialResult !== null &&
    cashFlowModel.billing !== null
      ? managerialMarginLabel(cashFlowModel.managerialResult, cashFlowModel.billing)
      : undefined;

  const monthEndSummary = monthEndView.kind === 'ready' ? monthEndView.data.summary : null;
  const monthEndRemainingDays =
    view.kind === 'ready' && monthEndView.kind === 'ready'
      ? remainingDaysInMonth(view.data.today, monthEndView.data.to)
      : undefined;

  const comparePeriods = useMemo<readonly MonthlyComparePeriod[]>(
    () => [
      { id: previousMonthKey, label: compactMonthLabel(previousMonthKey) },
      { id: selectedMonthKey, label: compactMonthLabel(selectedMonthKey) },
    ],
    [previousMonthKey, selectedMonthKey],
  );

  /**
   * Comparativo em caixa realizado: só entra o par de meses cujo split de caixa
   * está disponível nos dois lados. Null em qualquer perna vira vazio, não R$ 0.
   */
  const compareRows = useMemo<readonly MonthlyCompareRow[]>(() => {
    if (previousMonthView.kind !== 'ready' || cashFlowModel === null) {
      return [];
    }
    const previous = previousMonthView.model;
    const pairs: readonly {
      readonly id: string;
      readonly label: string;
      readonly tone: MonthlyCompareRow['tone'];
      readonly previous: string | null;
      readonly current: string | null;
    }[] = [
      {
        id: 'cash-inflows',
        label: 'Entradas realizadas',
        tone: 'revenue',
        previous: previous.realizedInflows,
        current: cashFlowModel.realizedInflows,
      },
      {
        id: 'cash-outflows',
        label: 'Saídas realizadas',
        tone: 'expense',
        previous: previous.realizedOutflows,
        current: cashFlowModel.realizedOutflows,
      },
      {
        id: 'cash-result',
        label: 'Resultado realizado',
        tone: 'result',
        previous: previous.realizedResult,
        current: cashFlowModel.realizedResult,
      },
    ];
    if (pairs.some((pair) => pair.previous === null || pair.current === null)) {
      return [];
    }
    return pairs.map((pair) => ({
      id: pair.id,
      label: pair.label,
      tone: pair.tone,
      amounts: [pair.previous as string, pair.current as string],
    }));
  }, [cashFlowModel, previousMonthView]);

  const comparePending =
    cashFlowPending || previousMonthView.kind === 'idle' || previousMonthView.kind === 'loading';
  const canExpandCompare = gate === 'ready' && compareRows.length > 0;
  const canExpandDaily = gate === 'ready' && dailySeriesReady;
  const canExpandCashDetail = gate === 'ready' && cashHasSplit && cashFlowModel !== null;
  const canExpandBilling =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.billing !== null;
  const canExpandReceived =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.received !== null;
  const canExpandReceivable =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.receivable !== null;
  const canExpandExpenses =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.monthlyExpenses !== null;
  const canExpandResult =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.managerialResult !== null;
  const canExpandComparison =
    canExpandCashDetail && realizedInflows !== undefined && realizedOutflows !== undefined;
  const canExpandCategoriesRevenue =
    canExpandCashDetail &&
    cashFlowModel !== null &&
    cashFlowModel.realizedInflowsByCategory !== null &&
    cashFlowModel.realizedInflowsByCategory.items.length > 0;
  const canExpandCategoriesExpense =
    canExpandCashDetail &&
    cashFlowModel !== null &&
    cashFlowModel.realizedOutflowsByCategory !== null &&
    cashFlowModel.realizedOutflowsByCategory.items.length > 0;
  const canExpandMonthEnd = gate === 'ready' && cashWindowsApply && monthEndSummary !== null;
  const canExpandDelinquency = gate === 'ready' && monthlyCashFlowView.kind === 'ready';
  const canExpandForecast = gate === 'ready' && cashWindowsApply && forecastView.kind === 'ready';

  const closeExpand = useCallback(() => {
    setExpandKind(null);
    setExpenseExpandFocus(null);
  }, []);

  const openExpenseExpand = useCallback((focus: ExpenseExpandFocus = null) => {
    setExpenseExpandFocus(focus);
    setExpandKind('expense');
  }, []);

  const activateExecutiveMetric = useCallback(
    (metricId: string) => {
      switch (metricId) {
        case 'cash-received':
          if (canExpandReceived) {
            setExpenseExpandFocus(null);
            setExpandKind('received');
          }
          return;
        case 'cash-receivable':
          if (canExpandReceivable) {
            setExpenseExpandFocus(null);
            setExpandKind('receivable');
          }
          return;
        case 'cash-paid':
          if (canExpandExpenses) {
            openExpenseExpand('paid');
          }
          return;
        case 'cash-payable':
          if (canExpandExpenses) {
            openExpenseExpand('payable');
          }
          return;
        case 'cash-result':
          if (canExpandResult) {
            setExpenseExpandFocus(null);
            setExpandKind('result');
          }
          return;
        case 'cash-coverage':
          if (canExpandBilling) {
            setExpenseExpandFocus(null);
            setExpandKind('billing');
          }
          return;
        default:
          return;
      }
    },
    [
      canExpandBilling,
      canExpandExpenses,
      canExpandReceivable,
      canExpandReceived,
      canExpandResult,
      openExpenseExpand,
    ],
  );

  const todayIso = view.kind === 'ready' ? view.data.today : null;
  const remainingExpectedReceivables = useMemo(
    () => (todayIso ? seriesFromDate(expectedReceivables, todayIso) : expectedReceivables),
    [expectedReceivables, todayIso],
  );
  const remainingExpectedPayables = useMemo(
    () => (todayIso ? seriesFromDate(expectedPayables, todayIso) : expectedPayables),
    [expectedPayables, todayIso],
  );

  return (
    <div
      className={styles.root}
      data-dashboard-page="true"
      data-overview-state={view.kind}
      data-cash-flow-state={monthlyCashFlowView.kind}
      data-filter-stable={view.kind === 'ready' ? 'true' : undefined}
      data-situation="all"
      data-category={selectedCategoryId ?? 'all'}
      data-cash-kpis="true"
    >
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <h1 className={styles.pageTitle}>Dashboard financeiro</h1>
          <p className={styles.pageSubtitle}>{pageSubtitle}</p>
        </div>
        <div className={styles.controlsCluster} data-v2-section="periodo">
          <DashboardMonthSelector
            selectedMonthKey={selectedMonthKey}
            todayMonthKey={todayMonthKey}
            onSelect={selectMonth}
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
        aria-label="Resumo financeiro de caixa do mês"
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
            ratioValue={billingCoverage?.ratio}
            ratioLabel={billingCoverage?.label}
            expandable={canExpandBilling}
            onExpand={canExpandBilling ? () => setExpandKind('billing') : undefined}
            footer={
              cashFlowModel && billingSlot.state === 'ready' && cashHasSplit ? (
                <KpiFooter
                  items={[
                    {
                      label: 'Recebido',
                      value: moneyOrDashCash(cashFlowModel.received),
                    },
                    {
                      label: 'A receber',
                      value: moneyOrDashCash(cashFlowModel.receivable),
                    },
                  ]}
                />
              ) : undefined
            }
          />
          <ExecutiveKpiCard
            title="Já recebido"
            tone="received"
            state={receivedSlot.state}
            value={receivedSlot.value}
            meta={receivedSlot.meta}
            emptyMessage={receivedSlot.emptyMessage}
            sparklinePoints={receivedDaily}
            sparklineAriaLabel={CASH_RECEIVED_SPARKLINE_CAPTION}
            sparklineCaption={CASH_RECEIVED_SPARKLINE_CAPTION}
            expandable={canExpandReceived}
            onExpand={canExpandReceived ? () => setExpandKind('received') : undefined}
            footer={receivedShareLabel ? <p className={styles.kpiNote}>{receivedShareLabel}</p> : undefined}
          />
          <ExecutiveKpiCard
            title="A receber"
            tone="receivable"
            state={receivableSlot.state}
            value={receivableSlot.value}
            meta={receivableSlot.meta}
            emptyMessage={receivableSlot.emptyMessage}
            sparklinePoints={receivableDaily}
            sparklineAriaLabel={CASH_RECEIVABLE_SPARKLINE_CAPTION}
            sparklineCaption={CASH_RECEIVABLE_SPARKLINE_CAPTION}
            expandable={canExpandReceivable}
            onExpand={canExpandReceivable ? () => setExpandKind('receivable') : undefined}
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
            sparklinePoints={expensesComposed}
            sparklineAriaLabel={CASH_EXPENSES_SPARKLINE_CAPTION}
            sparklineCaption={CASH_EXPENSES_SPARKLINE_CAPTION}
            expandable={canExpandExpenses}
            onExpand={canExpandExpenses ? () => openExpenseExpand(null) : undefined}
            footer={
              cashFlowModel && expensesSlot.state === 'ready' && cashHasSplit ? (
                <KpiFooter
                  items={[
                    { label: 'Pago', value: moneyOrDashCash(cashFlowModel.paid) },
                    {
                      label: 'A pagar',
                      value: moneyOrDashCash(cashFlowModel.payable),
                    },
                  ]}
                />
              ) : undefined
            }
          />
          <ExecutiveKpiCard
            title="Resultado"
            tone="result"
            state={managerialResultSlot.state}
            value={managerialResultSlot.value}
            meta={managerialResultSlot.meta}
            emptyMessage={managerialResultSlot.emptyMessage}
            sparklinePoints={resultComposed}
            sparklineAriaLabel={CASH_RESULT_SPARKLINE_CAPTION}
            sparklineCaption={CASH_RESULT_SPARKLINE_CAPTION}
            sparklineSigned
            expandable={canExpandResult}
            onExpand={canExpandResult ? () => setExpandKind('result') : undefined}
            footer={
              managerialMargin && managerialResultSlot.state === 'ready' ? (
                <KpiFooter items={[{ label: 'Margem', value: managerialMargin }]} />
              ) : undefined
            }
          />
        </div>

        {gate === 'ready' && cashFlowError ? (
          <StateWrapper
            state="error"
            errorMessage={cashFlowError}
            onRetry={retryCashFlow}
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
          id="entradas-saidas"
          sectionId="entradas-saidas"
          title="Entradas × Saídas"
          subtitle="Entradas e saídas realizadas no mês"
          expandable={canExpandComparison}
          onExpand={canExpandComparison ? () => setExpandKind('comparison') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando entradas e saídas do caixa"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {realizedInflows && realizedOutflows ? (
              <CompetenceComparisonChart
                revenueDaily={realizedInflows}
                expenseDaily={realizedOutflows}
                monthKey={selectedMonthKey}
                revenueLabel="Entradas"
                expenseLabel="Saídas"
                ariaLabel={`Entradas e saídas de caixa acumuladas em ${monthLabel}`}
                caption={CASH_REALIZED_COMPARISON_CAPTION}
                emptyMessage={`Sem entradas ou saídas de caixa em ${monthLabel}.`}
              />
            ) : (
              <StateWrapper
                state="empty"
                emptyMessage={CASH_SERIES_UNAVAILABLE}
                align="start"
              />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className={styles.categoryGrid}>
        <WidgetShell
          id="despesas-categoria"
          sectionId="despesas-categoria"
          title="Despesas por categoria"
          subtitle={`Pagamentos realizados em ${monthLabel}`}
          expandable={canExpandCategoriesExpense}
          onExpand={
            canExpandCategoriesExpense ? () => setExpandKind('categories-expense') : undefined
          }
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando despesas por categoria"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {!cashHasSplit ? (
              <StateWrapper
                state="empty"
                emptyMessage={CASH_CATEGORY_UNAVAILABLE}
                align="start"
              />
            ) : cashFlowModel?.realizedOutflowsByCategory &&
              cashFlowModel.realizedOutflowsByCategory.items.length > 0 ? (
              <CashRealizedCategoryPanel
                composition={cashFlowModel.realizedOutflowsByCategory}
                ariaLabel={`Despesas de caixa realizadas por categoria em ${monthLabel}`}
                centerCaption="Pago"
              />
            ) : (
              <StateWrapper state="empty" emptyMessage={CASH_CATEGORY_EMPTY} align="start" />
            )}
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="receitas-categoria"
          sectionId="receitas-categoria"
          title="Receitas por categoria"
          subtitle={`Recebimentos realizados em ${monthLabel}`}
          expandable={canExpandCategoriesRevenue}
          onExpand={
            canExpandCategoriesRevenue ? () => setExpandKind('categories-revenue') : undefined
          }
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando receitas por categoria"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {!cashHasSplit ? (
              <StateWrapper
                state="empty"
                emptyMessage={CASH_CATEGORY_UNAVAILABLE}
                align="start"
              />
            ) : cashFlowModel?.realizedInflowsByCategory &&
              cashFlowModel.realizedInflowsByCategory.items.length > 0 ? (
              <CashRealizedCategoryPanel
                composition={cashFlowModel.realizedInflowsByCategory}
                ariaLabel={`Receitas de caixa realizadas por categoria em ${monthLabel}`}
                centerCaption="Recebido"
              />
            ) : (
              <StateWrapper state="empty" emptyMessage={CASH_CATEGORY_EMPTY} align="start" />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div
        className={styles.compactSecondaryGrid}
        data-cols={cashWindowsApply ? '3' : '2'}
        data-home-band="compact-kpis"
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
            subtitle="Previsto até o fim do mês"
            expandable={canExpandMonthEnd}
            onExpand={canExpandMonthEnd ? () => setExpandKind('month-end') : undefined}
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
          id="inadimplencia"
          sectionId="inadimplencia"
          title="Inadimplência"
          subtitle="Vencido agora · carteira global (D1)"
          expandable={canExpandDelinquency}
          onExpand={canExpandDelinquency ? () => setExpandKind('delinquency') : undefined}
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando inadimplência"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {delinquencySlot.state === 'ready' || overdueSlot.state === 'ready' ? (
              <dl className={styles.factList}>
                <div className={styles.factRow}>
                  <dt className={styles.factLabel}>Vencido agora</dt>
                  <dd className={styles.factValue}>
                    {overdueSlot.state === 'ready' ? (overdueSlot.value ?? '—') : '—'}
                  </dd>
                </div>
                <div className={styles.factRow}>
                  <dt className={styles.factLabel}>Taxa global (D1)</dt>
                  <dd className={styles.factValue}>
                    {delinquencySlot.state === 'ready' ? delinquencySlot.value : '—'}
                  </dd>
                </div>
              </dl>
            ) : (
              <StateWrapper
                state="empty"
                emptyMessage={
                  overdueSlot.emptyMessage ??
                  delinquencySlot.emptyMessage ??
                  'Sem títulos vencidos agora'
                }
                align="start"
              />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className={styles.executiveRow} data-home-band="executive-reading">
        <WidgetShell
          id="leitura-executiva"
          sectionId="leitura-executiva"
          title="Leitura executiva"
          subtitle="Sinais do fluxo de caixa do mês"
        >
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando leitura executiva"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {cashReading ? (
              <CashExecutiveReading
                model={cashReading}
                emptyMessage="Sem movimentação de caixa para leitura neste mês."
                onMetricActivate={activateExecutiveMetric}
              />
            ) : null}
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
            error={previousMonthError ?? cashFlowError}
            onRetry={previousMonthError ? retryPreviousMonth : retryCashFlow}
            pending={comparePending}
          >
            <MonthlyCompare
              periods={comparePeriods}
              rows={compareRows}
              emptyMessage={`Sem caixa realizado em ${previousMonthLabel} para comparar.`}
            />
          </WidgetBody>
        </WidgetShell>

        <WidgetShell
          id="movimentacao-diaria"
          sectionId="movimentacao-diaria"
          title="Movimentação diária"
          subtitle={
            dailyMode === 'realized'
              ? `Entradas e saídas por dia · ${monthLabel}`
              : `A receber e a pagar por dia · ${monthLabel}`
          }
          expandable={canExpandDaily}
          onExpand={canExpandDaily ? () => setExpandKind('daily') : undefined}
        >
          <div
            className={styles.segmented}
            role="group"
            aria-label="Recorte da movimentação diária"
            data-stop-expand
          >
            {DAILY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.segmentedOption}
                aria-pressed={dailyMode === mode.id}
                onClick={() => setDailyMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando movimentação diária"
            error={cashFlowError}
            onRetry={retryCashFlow}
            pending={cashFlowPending}
          >
            {dailySeries.inflows && dailySeries.outflows ? (
              <CompetenceDailyBars
                revenueDaily={dailySeries.inflows}
                expenseDaily={dailySeries.outflows}
                monthKey={selectedMonthKey}
                revenueLabel={dailyMode === 'realized' ? 'Entradas' : 'A receber'}
                expenseLabel={dailyMode === 'realized' ? 'Saídas' : 'A pagar'}
                ariaLabel={
                  dailyMode === 'realized'
                    ? `Entradas e saídas de caixa por dia de baixa em ${monthLabel}`
                    : `A receber e a pagar por dia de vencimento em ${monthLabel}`
                }
                caption={
                  dailyMode === 'realized'
                    ? CASH_DAILY_REALIZED_CAPTION
                    : CASH_DAILY_EXPECTED_CAPTION
                }
                emptyMessage={
                  dailyMode === 'realized'
                    ? `Sem baixas de caixa em ${monthLabel}.`
                    : `Sem vencimentos previstos no prazo em ${monthLabel}.`
                }
              />
            ) : (
              <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
            )}
          </WidgetBody>
        </WidgetShell>
      </div>

      {cashWindowsApply ? (
        <WidgetShell
          id="fluxo-previsto"
          sectionId="fluxo-previsto"
          title="Fluxo previsto"
          subtitle="Entradas e saídas previstas para os próximos 90 dias"
          expandable={canExpandForecast}
          onExpand={canExpandForecast ? () => setExpandKind('forecast') : undefined}
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

      <p className={styles.hint}>
        Clique em um card ou gráfico para abrir o detalhe em regime de caixa do mês selecionado.
      </p>

      {expandKind === 'billing' && cashFlowModel && cashFlowModel.billing !== null ? (
        <WidgetExpandDialog
          open
          title={billingKpi.title}
          subtitle={`Caixa de ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Faturamento</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(cashFlowModel.billing)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Entradas realizadas</dt>
                <dd className={styles.statsValue}>
                  {moneyOrDashCash(cashFlowModel.realizedInflows)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>A receber</dt>
                <dd className={styles.statsValue}>{moneyOrDashCash(cashFlowModel.receivable)}</dd>
              </div>
              {billingCoverage ? (
                <div className={styles.statsItem}>
                  <dt className={styles.statsLabel}>Cobertura realizada</dt>
                  <dd className={styles.statsValue}>{billingCoverage.label}</dd>
                </div>
              ) : null}
            </dl>
            {realizedInflows ? (
              <>
                <p className={styles.expandLabel}>Entradas por dia de baixa</p>
                <div className={styles.expandChart}>
                  <Sparkline
                    points={realizedInflows}
                    colorVar="--color-series-revenue"
                    interactive
                    ariaLabel="Entradas realizadas por dia de baixa"
                    valueCaption="realizado no dia"
                  />
                </div>
                <p className={styles.expandLabel}>Entradas realizadas acumuladas (dia de baixa)</p>
                <div className={styles.expandChart}>
                  <Sparkline
                    points={accumulate(realizedInflows)}
                    colorVar="--color-series-revenue"
                    interactive
                    ariaLabel="Entradas realizadas acumuladas por dia de baixa"
                    valueCaption="acumulado de caixa"
                  />
                </div>
              </>
            ) : null}
            {expectedReceivables && expectedReceivables.length > 0 ? (
              <>
                <p className={styles.expandLabel}>A receber restante por vencimento (no prazo)</p>
                <div className={styles.expandChart}>
                  <Sparkline
                    points={expectedReceivables}
                    colorVar="--color-series-receivable"
                    interactive
                    ariaLabel="A receber por dia de vencimento no prazo"
                    valueCaption="previsto no prazo"
                  />
                </div>
              </>
            ) : (
              <p className={styles.expandLabel}>Sem valores a receber no prazo neste mês.</p>
            )}
            {cashFlowModel.realizedInflowsByCategory &&
            cashFlowModel.realizedInflowsByCategory.items.length > 0 ? (
              <>
                <p className={styles.expandLabel}>
                  Maiores categorias das entradas realizadas
                </p>
                <CashCategoryRanking
                  composition={cashFlowModel.realizedInflowsByCategory}
                  sectionTitle="Maiores categorias das entradas realizadas"
                  colorVar="--color-series-revenue"
                  emptyMessage="Sem entradas categorizadas neste mês."
                />
              </>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'received' && cashFlowModel && cashFlowModel.received !== null ? (
        <WidgetExpandDialog
          open
          title="Já recebido"
          subtitle={`Caixa de ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Total recebido</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(cashFlowModel.received)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Dias com entrada</dt>
                <dd className={styles.statsValue}>
                  {realizedInflows
                    ? String(countNonZeroDailyPoints(realizedInflows))
                    : '—'}
                </dd>
              </div>
              {(() => {
                const peak = peakNonZeroDailyPoint(realizedInflows);
                return peak ? (
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Maior dia de entrada</dt>
                    <dd className={styles.statsValue}>
                      {formatPeakDayLabel(peak.date)} · {formatMoneyBrl(peak.amount)}
                    </dd>
                  </div>
                ) : null;
              })()}
            </dl>
            {realizedInflows ? (
              <CompetenceDailyBars
                revenueDaily={realizedInflows}
                expenseDaily={zeroSeriesLike(realizedInflows)}
                monthKey={selectedMonthKey}
                revenueLabel="Entradas"
                expenseLabel="—"
                ariaLabel={`Entradas de caixa por dia de baixa em ${monthLabel}`}
                caption={CASH_DAILY_REALIZED_CAPTION}
                emptyMessage={`Sem entradas de caixa em ${monthLabel}.`}
              />
            ) : (
              <p className={styles.expandLabel}>{CASH_SERIES_UNAVAILABLE}</p>
            )}
            {cashFlowModel.realizedInflowsByCategory &&
            cashFlowModel.realizedInflowsByCategory.items.length > 0 ? (
              <>
                <p className={styles.expandLabel}>
                  Principais categorias dos recebimentos realizados
                </p>
                <CashCategoryRanking
                  composition={cashFlowModel.realizedInflowsByCategory}
                  sectionTitle="Principais categorias dos recebimentos realizados"
                  colorVar="--color-series-revenue"
                  emptyMessage="Sem recebimentos categorizados neste mês."
                />
              </>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'receivable' && cashFlowModel && cashFlowModel.receivable !== null ? (
        <WidgetExpandDialog
          open
          title="A receber"
          subtitle={`Previsto no prazo · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Total a receber</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(cashFlowModel.receivable)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Vencidos</dt>
                <dd className={styles.statsValue}>não entram neste total</dd>
              </div>
              {expectedReceivables ? (
                <>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Dias com vencimento</dt>
                    <dd className={styles.statsValue}>
                      {String(countNonZeroDailyPoints(expectedReceivables))}
                    </dd>
                  </div>
                  {(() => {
                    const peak = peakNonZeroDailyPoint(expectedReceivables);
                    return peak ? (
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>Maior vencimento previsto</dt>
                        <dd className={styles.statsValue}>
                          {formatPeakDayLabel(peak.date)} · {formatMoneyBrl(peak.amount)}
                        </dd>
                      </div>
                    ) : null;
                  })()}
                </>
              ) : null}
            </dl>
            {expectedReceivables && expectedReceivables.length > 0 ? (
              <CompetenceDailyBars
                revenueDaily={expectedReceivables}
                expenseDaily={zeroSeriesLike(expectedReceivables)}
                monthKey={selectedMonthKey}
                revenueLabel="A receber"
                expenseLabel="—"
                ariaLabel={`A receber por dia de vencimento em ${monthLabel}`}
                caption={CASH_DAILY_EXPECTED_CAPTION}
                emptyMessage={`Sem valores a receber no prazo em ${monthLabel}.`}
              />
            ) : (
              <p className={styles.expandLabel}>
                Sem previsão a receber no prazo neste mês.
              </p>
            )}
            <p className={styles.expandLabel}>
              Composição por categoria do previsto não disponível no DTO atual.
            </p>
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'expense' && cashFlowModel && cashFlowModel.monthlyExpenses !== null ? (
        <WidgetExpandDialog
          open
          title="Despesas"
          subtitle={
            expenseExpandFocus === 'paid'
              ? `Pago (realizado) · ${monthLabel}`
              : expenseExpandFocus === 'payable'
                ? `A pagar (previsto no prazo) · ${monthLabel}`
                : `Caixa de ${monthLabel}`
          }
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Despesas do mês</dt>
                <dd className={styles.statsValue}>
                  {formatMoneyBrl(cashFlowModel.monthlyExpenses)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Pago</dt>
                <dd className={styles.statsValue}>{moneyOrDashCash(cashFlowModel.paid)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>A pagar</dt>
                <dd className={styles.statsValue}>{moneyOrDashCash(cashFlowModel.payable)}</dd>
              </div>
            </dl>
            {(expenseExpandFocus === 'payable'
              ? (['payable', 'paid'] as const)
              : (['paid', 'payable'] as const)
            ).map((section) => {
              if (section === 'paid') {
                return realizedOutflows ? (
                  <div key="paid">
                    <p className={styles.expandLabel}>Pago por dia de baixa</p>
                    <div className={styles.expandChart}>
                      <Sparkline
                        points={realizedOutflows}
                        colorVar="--color-series-expense"
                        interactive
                        ariaLabel="Saídas realizadas por dia de baixa"
                        valueCaption="pago no dia"
                      />
                    </div>
                  </div>
                ) : null;
              }
              return expectedPayables && expectedPayables.length > 0 ? (
                <div key="payable">
                  <p className={styles.expandLabel}>A pagar por vencimento (no prazo)</p>
                  <div className={styles.expandChart}>
                    <Sparkline
                      points={expectedPayables}
                      colorVar="--color-series-expense"
                      interactive
                      ariaLabel="A pagar por dia de vencimento no prazo"
                      valueCaption="previsto no prazo"
                    />
                  </div>
                </div>
              ) : (
                <p key="payable-empty" className={styles.expandLabel}>
                  Sem valores a pagar no prazo neste mês.
                </p>
              );
            })}
            {cashFlowModel.realizedOutflowsByCategory &&
            cashFlowModel.realizedOutflowsByCategory.items.length > 0 ? (
              <>
                <p className={styles.expandLabel}>Maiores categorias das saídas realizadas</p>
                <CashCategoryRanking
                  composition={cashFlowModel.realizedOutflowsByCategory}
                  sectionTitle="Maiores categorias das saídas realizadas"
                  colorVar="--color-series-expense"
                  emptyMessage="Sem saídas categorizadas neste mês."
                />
              </>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'result' && cashFlowModel && cashFlowModel.managerialResult !== null ? (
        <WidgetExpandDialog
          open
          title="Resultado"
          subtitle={`Caixa de ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <div className={styles.expandFormula} role="group" aria-label="Composição do resultado">
              <div className={styles.expandFormulaRow}>
                <p className={styles.expandFormulaLabel}>Faturamento</p>
                <p className={styles.expandFormulaValue}>
                  {cashFlowModel.billing !== null
                    ? formatMoneyBrl(cashFlowModel.billing)
                    : '—'}
                </p>
              </div>
              <div className={styles.expandFormulaRow}>
                <p className={styles.expandFormulaLabel}>(−) Despesas</p>
                <p className={styles.expandFormulaValue}>
                  {cashFlowModel.monthlyExpenses !== null
                    ? formatMoneyBrl(cashFlowModel.monthlyExpenses)
                    : '—'}
                </p>
              </div>
              <div className={`${styles.expandFormulaRow} ${styles.expandFormulaTotal}`}>
                <p className={styles.expandFormulaLabel}>Resultado projetado</p>
                <p className={styles.expandFormulaValue}>
                  {formatMoneyBrl(cashFlowModel.managerialResult)}
                </p>
              </div>
            </div>
            <div className={styles.expandSplit}>
              <div>
                <p className={styles.expandLabel}>Realizado</p>
                <dl className={styles.statsRow}>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Resultado realizado</dt>
                    <dd className={styles.statsValue}>
                      {moneyOrDashCash(cashFlowModel.realizedResult)}
                    </dd>
                  </div>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Entradas realizadas</dt>
                    <dd className={styles.statsValue}>
                      {moneyOrDashCash(cashFlowModel.realizedInflows)}
                    </dd>
                  </div>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Saídas realizadas</dt>
                    <dd className={styles.statsValue}>
                      {moneyOrDashCash(cashFlowModel.realizedOutflows)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className={styles.expandLabel}>Previsto restante</p>
                <dl className={styles.statsRow}>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>A receber</dt>
                    <dd className={styles.statsValue}>
                      {moneyOrDashCash(cashFlowModel.receivable)}
                    </dd>
                  </div>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>A pagar</dt>
                    <dd className={styles.statsValue}>{moneyOrDashCash(cashFlowModel.payable)}</dd>
                  </div>
                  <div className={styles.statsItem}>
                    <dt className={styles.statsLabel}>Previsto líquido restante</dt>
                    <dd className={styles.statsValue}>
                      {moneyOrDashCash(
                        cashFlowModel.receivable !== null && cashFlowModel.payable !== null
                          ? subtractDecimalStrings(
                              cashFlowModel.receivable,
                              cashFlowModel.payable,
                            )
                          : null,
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            {resultComposed ? (
              <>
                <p className={styles.expandLabel}>{CASH_RESULT_SPARKLINE_CAPTION}</p>
                <div className={styles.expandChart}>
                  <Sparkline
                    points={resultComposed}
                    colorVar="--color-series-result"
                    interactive
                    signed
                    ariaLabel="Resultado projetado do mês ao longo dos dias"
                    valueCaption="projetado (realizado + previsto no prazo)"
                  />
                </div>
              </>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'comparison' && realizedInflows && realizedOutflows ? (
        <WidgetExpandDialog
          open
          title="Entradas × Saídas"
          subtitle={`Caixa realizado · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Entradas realizadas</dt>
                <dd className={styles.statsValue}>
                  {moneyOrDashCash(cashFlowModel?.realizedInflows)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Saídas realizadas</dt>
                <dd className={styles.statsValue}>
                  {moneyOrDashCash(cashFlowModel?.realizedOutflows)}
                </dd>
              </div>
            </dl>
            <CompetenceComparisonChart
              revenueDaily={realizedInflows}
              expenseDaily={realizedOutflows}
              monthKey={selectedMonthKey}
              revenueLabel="Entradas"
              expenseLabel="Saídas"
              ariaLabel={`Entradas e saídas de caixa acumuladas em ${monthLabel}`}
              caption={CASH_REALIZED_COMPARISON_CAPTION}
              emptyMessage={`Sem entradas ou saídas de caixa em ${monthLabel}.`}
            />
            {cashFlowModel?.realizedInflowsByCategory || cashFlowModel?.realizedOutflowsByCategory ? (
              <div className={styles.expandColumns}>
                <div>
                  <p className={styles.expandLabel}>Principais entradas por categoria</p>
                  <CashCategoryRanking
                    composition={cashFlowModel.realizedInflowsByCategory}
                    sectionTitle="Principais entradas por categoria"
                    colorVar="--color-series-revenue"
                    emptyMessage="Sem entradas categorizadas neste mês."
                  />
                </div>
                <div>
                  <p className={styles.expandLabel}>Principais saídas por categoria</p>
                  <CashCategoryRanking
                    composition={cashFlowModel.realizedOutflowsByCategory}
                    sectionTitle="Principais saídas por categoria"
                    colorVar="--color-series-expense"
                    emptyMessage="Sem saídas categorizadas neste mês."
                  />
                </div>
              </div>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'categories-revenue' &&
      cashFlowModel?.realizedInflowsByCategory &&
      cashFlowModel.realizedInflowsByCategory.items.length > 0 ? (
        <WidgetExpandDialog
          open
          title="Receitas por categoria"
          subtitle={`Recebimentos realizados · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Total realizado</dt>
                <dd className={styles.statsValue}>
                  {formatMoneyBrl(cashFlowModel.realizedInflowsByCategory.total)}
                </dd>
              </div>
            </dl>
            <CategoryDonutChart
              slices={presentTopCategoryDonutSlices(
                cashFlowModel.realizedInflowsByCategory.items,
                cashFlowModel.realizedInflowsByCategory.items.length,
              )}
              ariaLabel={`Receitas de caixa realizadas por categoria em ${monthLabel}`}
              centerLabel={formatCompactBrl(Number(cashFlowModel.realizedInflowsByCategory.total))}
              centerCaption="Recebido"
              interactive
              size="md"
            />
            <CategoryRanking
              items={toRankingItems(cashFlowModel.realizedInflowsByCategory.items)}
              maxItems={cashFlowModel.realizedInflowsByCategory.items.length}
              colorVar="--color-series-revenue"
              emptyMessage={CASH_CATEGORY_EMPTY}
            />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'categories-expense' &&
      cashFlowModel?.realizedOutflowsByCategory &&
      cashFlowModel.realizedOutflowsByCategory.items.length > 0 ? (
        <WidgetExpandDialog
          open
          title="Despesas por categoria"
          subtitle={`Pagamentos realizados · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Total realizado</dt>
                <dd className={styles.statsValue}>
                  {formatMoneyBrl(cashFlowModel.realizedOutflowsByCategory.total)}
                </dd>
              </div>
            </dl>
            <CategoryDonutChart
              slices={presentTopCategoryDonutSlices(
                cashFlowModel.realizedOutflowsByCategory.items,
                cashFlowModel.realizedOutflowsByCategory.items.length,
              )}
              ariaLabel={`Despesas de caixa realizadas por categoria em ${monthLabel}`}
              centerLabel={formatCompactBrl(Number(cashFlowModel.realizedOutflowsByCategory.total))}
              centerCaption="Pago"
              interactive
              size="md"
            />
            <CategoryRanking
              items={toRankingItems(cashFlowModel.realizedOutflowsByCategory.items)}
              maxItems={cashFlowModel.realizedOutflowsByCategory.items.length}
              colorVar="--color-series-expense"
              emptyMessage={CASH_CATEGORY_EMPTY}
            />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'month-end' && monthEndSummary ? (
        <WidgetExpandDialog
          open
          title="Até o fim do mês"
          subtitle={`Compromissos previstos no prazo · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>A receber restante</dt>
                <dd className={styles.statsValue}>
                  {formatMoneyBrl(monthEndSummary.receivable)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>A pagar restante</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(monthEndSummary.payable)}</dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Diferença prevista</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(monthEndSummary.net)}</dd>
              </div>
              {monthEndRemainingDays !== undefined ? (
                <div className={styles.statsItem}>
                  <dt className={styles.statsLabel}>Dias restantes</dt>
                  <dd className={styles.statsValue}>{String(monthEndRemainingDays)}</dd>
                </div>
              ) : null}
            </dl>
            {remainingExpectedReceivables || remainingExpectedPayables ? (
              <CompetenceDailyBars
                revenueDaily={remainingExpectedReceivables ?? []}
                expenseDaily={
                  remainingExpectedPayables ??
                  (remainingExpectedReceivables
                    ? zeroSeriesLike(remainingExpectedReceivables)
                    : [])
                }
                monthKey={selectedMonthKey}
                revenueLabel="Entradas previstas"
                expenseLabel="Saídas previstas"
                ariaLabel={`Compromissos previstos por dia de vencimento até o fim de ${monthLabel}`}
                caption="Previsto no prazo por dia de vencimento · não é saldo bancário"
                emptyMessage={`Sem compromissos previstos no prazo até o fim de ${monthLabel}.`}
              />
            ) : (
              <p className={styles.expandLabel}>
                Sem distribuição diária prevista disponível para os filtros selecionados.
              </p>
            )}
            <p className={styles.expandLabel}>Vencidos não entram nesta leitura.</p>
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'delinquency' && cashFlowModel ? (
        <WidgetExpandDialog
          open
          title="Inadimplência"
          subtitle="Vencido agora · carteira global (D1)"
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Vencido agora</dt>
                <dd className={styles.statsValue}>
                  {cashFlowModel.overdueReceivables === null
                    ? '—'
                    : formatMoneyBrl(cashFlowModel.overdueReceivables)}
                </dd>
              </div>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Taxa global (D1)</dt>
                <dd className={styles.statsValue}>
                  {delinquencySlot.state === 'ready'
                    ? (delinquencySlot.value ?? '—')
                    : delinquencySlot.state === 'empty'
                      ? '0%'
                      : '—'}
                </dd>
              </div>
            </dl>
            {cashFlowModel.overdueReceivables !== null &&
            isDecimalZero(cashFlowModel.overdueReceivables) ? (
              <p className={styles.expandLabel}>
                Nenhum valor a receber vencido no momento.
              </p>
            ) : null}
            <p className={styles.expandLabel}>
              Lista de títulos vencidos ainda não disponível neste detalhe analítico.
            </p>
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'forecast' && forecastView.kind === 'ready' ? (
        <WidgetExpandDialog
          open
          title="Fluxo previsto"
          subtitle={`Horizonte de ${forecastView.data.horizonDays} dias · entradas e saídas previstas`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <ForecastPanel buckets={forecastView.data.buckets} />
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'compare' && compareRows.length > 0 ? (
        <WidgetExpandDialog
          open
          title="Comparativo mensal"
          subtitle={`${monthLabel} × ${previousMonthLabel}`}
          onClose={closeExpand}
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
          subtitle={monthLabel}
          onClose={closeExpand}
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
            <p className={styles.expandLabel}>Histórico mensal</p>
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

      {expandKind === 'daily' && dailySeries.inflows && dailySeries.outflows ? (
        <WidgetExpandDialog
          open
          title="Movimentação diária"
          subtitle={`${monthLabel} · ${
            dailyMode === 'realized' ? CASH_DAILY_REALIZED_CAPTION : CASH_DAILY_EXPECTED_CAPTION
          }`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <div
              className={styles.segmented}
              role="group"
              aria-label="Recorte da movimentação diária"
              data-stop-expand
            >
              {DAILY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={styles.segmentedOption}
                  aria-pressed={dailyMode === mode.id}
                  onClick={() => setDailyMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <CompetenceDailyBars
              revenueDaily={dailySeries.inflows}
              expenseDaily={dailySeries.outflows}
              monthKey={selectedMonthKey}
              revenueLabel={dailyMode === 'realized' ? 'Entradas' : 'A receber'}
              expenseLabel={dailyMode === 'realized' ? 'Saídas' : 'A pagar'}
              ariaLabel={
                dailyMode === 'realized'
                  ? `Entradas e saídas de caixa por dia de baixa em ${monthLabel}`
                  : `A receber e a pagar por dia de vencimento em ${monthLabel}`
              }
              caption={
                dailyMode === 'realized'
                  ? CASH_DAILY_REALIZED_CAPTION
                  : CASH_DAILY_EXPECTED_CAPTION
              }
            />
          </div>
        </WidgetExpandDialog>
      ) : null}
    </div>
  );
}
