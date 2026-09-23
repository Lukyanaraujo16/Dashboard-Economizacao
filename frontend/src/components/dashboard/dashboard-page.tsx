'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import { isPlatformRole, useAuth } from '../../auth';
import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../lib/format-money-brl';
import {
  buildDashboardMonthSearchParams,
  currentDashboardMonthKey,
  dashboardMonthPhase,
  isValidDashboardMonthKey,
  resolveSelectedDashboardMonthKey,
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
  dashboardCashBalanceHistoryCacheKey,
  dashboardCashExpectedHorizonCacheKey,
  dashboardCashFlowCacheKey,
  dashboardCashMovementHistoryCacheKey,
  dashboardOverviewCacheKey,
} from '../../lib/dashboard-filter-cache';
import { getDashboardCashBalanceHistory } from '../../services/dashboard/cash-balance-history';
import type { DashboardCashBalanceHistoryResponse } from '../../services/dashboard/cash-balance-history.types';
import { DashboardCashBalanceHistoryRequestError } from '../../services/dashboard/cash-balance-history.types';
import { getDashboardCashExpectedHorizon } from '../../services/dashboard/cash-expected-horizon';
import {
  DashboardCashExpectedHorizonRequestError,
  type DashboardCashExpectedHorizonResponse,
} from '../../services/dashboard/cash-expected-horizon.types';
import { getDashboardCostCenters } from '../../services/dashboard/cost-centers';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import { getDashboardCategories } from '../../services/dashboard/categories';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import { getDashboardCashMovementHistory } from '../../services/dashboard/cash-movement-history';
import {
  DashboardCashMovementHistoryRequestError,
  type DashboardCashMovementHistoryResponse,
} from '../../services/dashboard/cash-movement-history.types';
import { getDashboardMonthlyCashFlow } from '../../services/dashboard/monthly-cash-flow';
import {
  DashboardMonthlyCashFlowRequestError,
  type DashboardMonthlyCashFlowResponse,
} from '../../services/dashboard/monthly-cash-flow.types';
import { getDashboardExpectedReceivableDetails } from '../../services/dashboard/expected-receivable-details';
import {
  DashboardExpectedReceivableDetailsRequestError,
  type DashboardExpectedReceivableDetailsResponse,
} from '../../services/dashboard/expected-receivable-details.types';
import { getDashboardExpectedPayableDetails } from '../../services/dashboard/expected-payable-details';
import {
  DashboardExpectedPayableDetailsRequestError,
  type DashboardExpectedPayableDetailsResponse,
} from '../../services/dashboard/expected-payable-details.types';
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
import { CashCategoryRanking } from './cash-category-ranking';
import { CashCategoryDrilldown } from './cash-category-drilldown';
import { CashRealizedCategoryPanel } from './cash-realized-category-panel';
import { ExpectedReceivableDetailsPanel } from './expected-receivable-details-panel';
import expectedReceivableStyles from './expected-receivable-details-panel.module.css';
import { ExpectedPayableDetailsPanel } from './expected-payable-details-panel';
import expectedPayableStyles from './expected-payable-details-panel.module.css';
import {
  formatPeakDayLabel,
  peakNonZeroDailyPoint,
} from './dashboard-cash-modal-view';
import {
  CASH_PAYABLE_SPARKLINE_CAPTION,
  CASH_RECEIVABLE_SPARKLINE_CAPTION,
  cashReceivableDailySeries,
  moneyOrDashCash,
  toCashBillingKpi,
  toCashExpensesKpi,
  toCashManagerialResultKpi,
  toCashOverdueReceivablesKpi,
  toCashPayableKpi,
  toCashReceivableKpi,
  toOverviewDelinquencyRateKpi,
} from './dashboard-cash-kpis-view';
import {
  CASH_DAILY_EXPECTED_CAPTION,
  CASH_DAILY_REALIZED_CAPTION,
  CASH_EXPECTED_HORIZON_CAPTION,
  CASH_EXPENSES_SPARKLINE_CAPTION,
  CASH_MONTHLY_REALIZED_CAPTION,
  CASH_RESULT_SPARKLINE_CAPTION,
  cashBillingCoverageRatio,
  cashExpectedHorizonSubtitle,
  cashExpectedPayablesSeries,
  cashExpectedReceivablesSeries,
  cashExpensesComposedSeries,
  cashManagerialResultComposedSeries,
  cashRealizedInflowsSeries,
  cashRealizedOutflowsSeries,
} from './dashboard-cash-series-view';
import {
  balanceByDate,
  balanceByMonthKey,
  formatCivilDatePtBr,
} from './cash-balance-series-view';
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
  resolveOperationalTenantId,
  shouldSkipOverviewFetch,
} from './dashboard-overview-view';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices } from './category-donut-view';
import {
  CashMonthlyGroupedBars,
  CompetenceDailyBars,
  ExecutiveKpiCard,
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
  type CashMonthlyGroupedBarsBucket,
  type DailyPoint,
  type ExecutiveKpiState,
} from './v2';
import styles from './dashboard-page.module.css';

const FIRST_SYNC_EMPTY = 'Aguardando a primeira sincronização';
const BLOCKED_EMPTY = 'Disponível junto com os indicadores da empresa.';
/** Split de caixa ausente (filtro por centro de custo) — nunca cair para R$ 0. */
const CASH_SERIES_UNAVAILABLE =
  'Séries diárias de caixa indisponíveis para os filtros selecionados.';
const CASH_CATEGORY_EMPTY = 'Sem movimentação de caixa realizada neste mês.';
const CASH_CATEGORY_UNAVAILABLE =
  'Composição por categoria indisponível para os filtros selecionados.';
type OverviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'never-sync' }
  | { readonly kind: 'ready'; readonly data: DashboardOverviewResponse };

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

/** Histórico de 12 meses — modo Mensal da Movimentação financeira (Correção 08-B). */
type CashMovementHistoryView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardCashMovementHistoryResponse };

/** Previsto multi-mês à frente (Diária → Previsto → 3|6|12). */
type CashExpectedHorizonView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardCashExpectedHorizonResponse };

/** Saldo bancário por snapshots (Correção 08-C). Erro não derruba barras. */
type CashBalanceHistoryView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardCashBalanceHistoryResponse };

type ExpectedReceivableDetailsView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardExpectedReceivableDetailsResponse };

type ExpectedPayableDetailsView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: DashboardExpectedPayableDetailsResponse };

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
  | 'receivable'
  | 'payable'
  | 'expense'
  | 'result'
  | 'categories-revenue'
  | 'categories-expense'
  | 'daily'
  | 'goal'
  | 'delinquency';

/** Recorte Mensal da Movimentação: histórico realizado ou previsão à frente. */
type MonthlyCashMode = 'realized' | 'expected';

/** Granularidade temporal da Movimentação financeira (Correção 08-B). */
type PeriodMode = 'daily' | 'monthly';

/** Horizonte do Previsto mensal (3|6|12). Sem “Mês atual” / horizon=1. */
type ExpectedHorizon = 3 | 6 | 12;

function zeroSeriesLike(points: readonly DailyPoint[]): readonly DailyPoint[] {
  return points.map((point) => ({ date: point.date, amount: '0' }));
}

const MONTHLY_CASH_MODES: readonly { readonly id: MonthlyCashMode; readonly label: string }[] = [
  { id: 'realized', label: 'Realizado' },
  { id: 'expected', label: 'Previsto' },
];

const PERIOD_MODES: readonly { readonly id: PeriodMode; readonly label: string }[] = [
  { id: 'daily', label: 'Diária' },
  { id: 'monthly', label: 'Mensal' },
];

const EXPECTED_HORIZON_MODES: readonly {
  readonly id: ExpectedHorizon;
  readonly label: string;
}[] = [
  { id: 3, label: '3 meses' },
  { id: 6, label: '6 meses' },
  { id: 12, label: '12 meses' },
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
  const [monthlyCashFlowView, setMonthlyCashFlowView] = useState<MonthlyCashFlowLoadView>({
    kind: 'idle',
  });
  const [cashMovementHistoryView, setCashMovementHistoryView] =
    useState<CashMovementHistoryView>({ kind: 'idle' });
  const [cashExpectedHorizonView, setCashExpectedHorizonView] = useState<CashExpectedHorizonView>({
    kind: 'idle',
  });
  const [cashBalanceHistoryView, setCashBalanceHistoryView] = useState<CashBalanceHistoryView>({
    kind: 'idle',
  });
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
  const [expectedReceivableDetailsView, setExpectedReceivableDetailsView] =
    useState<ExpectedReceivableDetailsView>({ kind: 'idle' });
  const [expectedPayableDetailsView, setExpectedPayableDetailsView] =
    useState<ExpectedPayableDetailsView>({ kind: 'idle' });
  const [monthlyCashMode, setMonthlyCashMode] = useState<MonthlyCashMode>('realized');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily');
  const [expectedHorizon, setExpectedHorizon] = useState<ExpectedHorizon>(3);
  const expectedHorizonLabelId = useId();
  const expectedHorizonExpandLabelId = useId();

  const viewRef = useRef(view);
  viewRef.current = view;
  const monthlyCashFlowViewRef = useRef(monthlyCashFlowView);
  monthlyCashFlowViewRef.current = monthlyCashFlowView;
  const cashMovementHistoryViewRef = useRef(cashMovementHistoryView);
  cashMovementHistoryViewRef.current = cashMovementHistoryView;
  const cashExpectedHorizonViewRef = useRef(cashExpectedHorizonView);
  cashExpectedHorizonViewRef.current = cashExpectedHorizonView;
  const cashBalanceHistoryViewRef = useRef(cashBalanceHistoryView);
  cashBalanceHistoryViewRef.current = cashBalanceHistoryView;

  const overviewCacheRef = useRef(createDashboardFilterCache<DashboardOverviewResponse>());
  const cashFlowCacheRef = useRef(createDashboardFilterCache<DashboardMonthlyCashFlowResponse>());
  const cashMovementHistoryCacheRef = useRef(
    createDashboardFilterCache<DashboardCashMovementHistoryResponse>(),
  );
  const cashExpectedHorizonCacheRef = useRef(
    createDashboardFilterCache<DashboardCashExpectedHorizonResponse>(),
  );
  const cashBalanceHistoryCacheRef = useRef(
    createDashboardFilterCache<DashboardCashBalanceHistoryResponse>(),
  );
  const expectedReceivableDetailsCacheRef = useRef(
    createDashboardFilterCache<DashboardExpectedReceivableDetailsResponse>(),
  );
  const expectedPayableDetailsCacheRef = useRef(
    createDashboardFilterCache<DashboardExpectedPayableDetailsResponse>(),
  );
  const expectedReceivableDetailsViewRef = useRef(expectedReceivableDetailsView);
  expectedReceivableDetailsViewRef.current = expectedReceivableDetailsView;
  const expectedPayableDetailsViewRef = useRef(expectedPayableDetailsView);
  expectedPayableDetailsViewRef.current = expectedPayableDetailsView;

  const operationalTenantId = useMemo(
    () => resolveOperationalTenantId(user, support),
    [user, support],
  );
  const operationalTenantIdRef = useRef(operationalTenantId);
  operationalTenantIdRef.current = operationalTenantId;
  const catalogTenantIdRef = useRef<string | null>(null);
  const catalogLoadGenerationRef = useRef(0);
  const costCenterLoadGenerationRef = useRef(0);

  const loadOverview = useCallback(
    async (signal: AbortSignal, costCenterId: string | null, options?: SoftLoadOptions) => {
      if (shouldSkipOverviewFetch(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setCashMovementHistoryView({ kind: 'idle' });
        setCashBalanceHistoryView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
        setCostCenters([]);
        return;
      }
      if (!hasOperationalDashboardTenant(user, support)) {
        setView({ kind: 'forbidden' });
        setMonthlyCashFlowView({ kind: 'idle' });
        setCashMovementHistoryView({ kind: 'idle' });
        setCashBalanceHistoryView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
        setCostCenters([]);
        return;
      }

      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        setView({ kind: 'forbidden' });
        return;
      }

      const soft = options?.soft === true;
      const cacheKey = dashboardOverviewCacheKey(tenantId, costCenterId);
      const cached = overviewCacheRef.current.get(cacheKey);
      if (soft && cached && !isNeverSynced(cached)) {
        setView({ kind: 'ready', data: cached });
      } else if (!(soft && viewRef.current.kind === 'ready')) {
        setView({ kind: 'loading' });
      }

      try {
        const data = await getDashboardOverview(costCenterId);
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        if (isNeverSynced(data)) {
          setView({ kind: 'never-sync' });
          setMonthlyCashFlowView({ kind: 'idle' });
            setCashMovementHistoryView({ kind: 'idle' });
            setCashBalanceHistoryView({ kind: 'idle' });
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
          setMonthlyCashFlowView({ kind: 'idle' });
            setCashMovementHistoryView({ kind: 'idle' });
            setCashBalanceHistoryView({ kind: 'idle' });
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
        setMonthlyCashFlowView({ kind: 'idle' });
        setCashMovementHistoryView({ kind: 'idle' });
        setCashBalanceHistoryView({ kind: 'idle' });
        setRevenueGoalView({ kind: 'idle' });
      }
    },
    [support, user],
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
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const soft = options?.soft === true;
      const cacheKey = dashboardCashFlowCacheKey(tenantId, monthKey, costCenterId, categoryId);
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
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
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

  const loadExpectedReceivableDetails = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      categoryId: string | null,
    ) => {
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const cacheKey = dashboardCashFlowCacheKey(tenantId, monthKey, costCenterId, categoryId);
      const cached = expectedReceivableDetailsCacheRef.current.get(cacheKey);
      if (cached) {
        setExpectedReceivableDetailsView({ kind: 'ready', data: cached });
      } else {
        setExpectedReceivableDetailsView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardExpectedReceivableDetails(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          categoryId,
        );
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        expectedReceivableDetailsCacheRef.current.set(cacheKey, data);
        setExpectedReceivableDetailsView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (expectedReceivableDetailsViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardExpectedReceivableDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os recebimentos previstos.';
        setExpectedReceivableDetailsView({ kind: 'error', message });
      }
    },
    [],
  );

  const loadExpectedPayableDetails = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      categoryId: string | null,
    ) => {
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const cacheKey = dashboardCashFlowCacheKey(tenantId, monthKey, costCenterId, categoryId);
      const cached = expectedPayableDetailsCacheRef.current.get(cacheKey);
      if (cached) {
        setExpectedPayableDetailsView({ kind: 'ready', data: cached });
      } else {
        setExpectedPayableDetailsView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardExpectedPayableDetails(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          categoryId,
        );
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        expectedPayableDetailsCacheRef.current.set(cacheKey, data);
        setExpectedPayableDetailsView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (expectedPayableDetailsViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardExpectedPayableDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os pagamentos previstos.';
        setExpectedPayableDetailsView({ kind: 'error', message });
      }
    },
    [],
  );

  /** Histórico de 12 meses de caixa realizado — modo Mensal da Movimentação financeira. */
  const loadCashMovementHistory = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      costCenterId: string | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const soft = options?.soft === true;
      const cacheKey = dashboardCashMovementHistoryCacheKey(
        tenantId,
        monthKey,
        costCenterId,
        categoryId,
      );
      const cached = cashMovementHistoryCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setCashMovementHistoryView({ kind: 'ready', data: cached });
      } else if (!(soft && cashMovementHistoryViewRef.current.kind === 'ready')) {
        setCashMovementHistoryView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardCashMovementHistory(
          monthKey === todayMonthKey ? null : monthKey,
          costCenterId,
          categoryId,
        );
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        cashMovementHistoryCacheRef.current.set(cacheKey, data);
        setCashMovementHistoryView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && cashMovementHistoryViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardCashMovementHistoryRequestError
            ? error.message
            : 'Não foi possível carregar o histórico de movimentação.';
        setCashMovementHistoryView({ kind: 'error', message });
      }
    },
    [],
  );

  /** Previsto multi-mês — Mensal → Previsto → horizonte 3|6|12. */
  const loadCashExpectedHorizon = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      horizon: 3 | 6 | 12,
      costCenterId: string | null,
      categoryId: string | null,
      options?: SoftLoadOptions,
    ) => {
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const soft = options?.soft === true;
      const cacheKey = dashboardCashExpectedHorizonCacheKey(
        tenantId,
        monthKey,
        horizon,
        costCenterId,
        categoryId,
      );
      const cached = cashExpectedHorizonCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setCashExpectedHorizonView({ kind: 'ready', data: cached });
      } else if (!(soft && cashExpectedHorizonViewRef.current.kind === 'ready')) {
        setCashExpectedHorizonView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardCashExpectedHorizon({
          monthKey: monthKey === todayMonthKey ? null : monthKey,
          horizon,
          costCenterId,
          categoryId,
          signal,
        });
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        cashExpectedHorizonCacheRef.current.set(cacheKey, data);
        setCashExpectedHorizonView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        if (soft && cashExpectedHorizonViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardCashExpectedHorizonRequestError
            ? error.message
            : 'Não foi possível carregar a previsão do horizonte.';
        setCashExpectedHorizonView({ kind: 'error', message });
      }
    },
    [],
  );

  /** Saldo bancário real (snapshots). Lazy; erro não derruba Movimentação. */
  const loadCashBalanceHistory = useCallback(
    async (
      signal: AbortSignal,
      monthKey: string,
      todayMonthKey: string,
      options?: SoftLoadOptions,
    ) => {
      const tenantId = operationalTenantIdRef.current;
      if (tenantId === null) {
        return;
      }
      const soft = options?.soft === true;
      const cacheKey = dashboardCashBalanceHistoryCacheKey(tenantId, monthKey);
      const cached = cashBalanceHistoryCacheRef.current.get(cacheKey);
      if (soft && cached) {
        setCashBalanceHistoryView({ kind: 'ready', data: cached });
      } else if (!(soft && cashBalanceHistoryViewRef.current.kind === 'ready')) {
        setCashBalanceHistoryView({ kind: 'loading' });
      }
      try {
        const data = await getDashboardCashBalanceHistory(
          monthKey === todayMonthKey ? null : monthKey,
        );
        if (signal.aborted || operationalTenantIdRef.current !== tenantId) {
          return;
        }
        cashBalanceHistoryCacheRef.current.set(cacheKey, data);
        setCashBalanceHistoryView({ kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (soft && cashBalanceHistoryViewRef.current.kind === 'ready') {
          return;
        }
        const message =
          error instanceof DashboardCashBalanceHistoryRequestError
            ? error.message
            : 'Não foi possível carregar o saldo bancário.';
        setCashBalanceHistoryView({ kind: 'error', message });
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
    if (status !== 'authenticated' || operationalTenantId === null) {
      setCategories([]);
      setCostCenters([]);
      catalogTenantIdRef.current = null;
      return;
    }

    overviewCacheRef.current.clear();
    cashFlowCacheRef.current.clear();
    cashMovementHistoryCacheRef.current.clear();
    cashExpectedHorizonCacheRef.current.clear();
    cashBalanceHistoryCacheRef.current.clear();

    setCashBalanceHistoryView({ kind: 'idle' });
    setCashMovementHistoryView({ kind: 'idle' });
    setCashExpectedHorizonView({ kind: 'idle' });

    setCategories([]);
    setCostCenters([]);
    setCategoriesError(false);
    catalogTenantIdRef.current = null;
    setCategoriesLoading(true);
    setCostCentersLoading(true);
  }, [operationalTenantId, status]);

  const todayMonthKey =
    view.kind === 'ready' ? view.data.today.slice(0, 7) : currentDashboardMonthKey();

  const selectedMonthKey = useMemo(
    () => resolveSelectedDashboardMonthKey(searchParams, todayMonthKey),
    [searchParams, todayMonthKey],
  );

  useEffect(() => {
    if (status !== 'authenticated' || operationalTenantId === null) {
      setCategories([]);
      setCategoriesLoading(false);
      return;
    }

    setCategories([]);
    setCategoriesError(false);
    setCategoriesLoading(true);
    catalogLoadGenerationRef.current += 1;
    const generation = catalogLoadGenerationRef.current;
    const tenantId = operationalTenantId;
    const monthKey = selectedMonthKey;
    const controller = new AbortController();

    void (async () => {
      try {
        const categoryResult = await getDashboardCategories({ monthKey });
        if (
          controller.signal.aborted ||
          catalogLoadGenerationRef.current !== generation ||
          operationalTenantIdRef.current !== tenantId
        ) {
          return;
        }
        setCategories(categoryResult.items);
        catalogTenantIdRef.current = tenantId;
      } catch {
        if (
          controller.signal.aborted ||
          catalogLoadGenerationRef.current !== generation ||
          operationalTenantIdRef.current !== tenantId
        ) {
          return;
        }
        setCategories([]);
        setCategoriesError(true);
      } finally {
        if (
          !controller.signal.aborted &&
          catalogLoadGenerationRef.current === generation &&
          operationalTenantIdRef.current === tenantId
        ) {
          setCategoriesLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      catalogLoadGenerationRef.current += 1;
    };
  }, [operationalTenantId, selectedMonthKey, status]);

  useEffect(() => {
    if (status !== 'authenticated' || operationalTenantId === null) {
      setCostCenters([]);
      setCostCentersLoading(false);
      return;
    }

    setCostCenters([]);
    setCostCentersLoading(true);
    costCenterLoadGenerationRef.current += 1;
    const generation = costCenterLoadGenerationRef.current;
    const tenantId = operationalTenantId;
    const monthKey = selectedMonthKey;
    const controller = new AbortController();

    void (async () => {
      try {
        const costCenterResult = await getDashboardCostCenters({ monthKey });
        if (
          controller.signal.aborted ||
          costCenterLoadGenerationRef.current !== generation ||
          operationalTenantIdRef.current !== tenantId
        ) {
          return;
        }
        setCostCenters(costCenterResult.items);
      } catch {
        if (
          controller.signal.aborted ||
          costCenterLoadGenerationRef.current !== generation ||
          operationalTenantIdRef.current !== tenantId
        ) {
          return;
        }
        setCostCenters([]);
      } finally {
        if (
          !controller.signal.aborted &&
          costCenterLoadGenerationRef.current === generation &&
          operationalTenantIdRef.current === tenantId
        ) {
          setCostCentersLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      costCenterLoadGenerationRef.current += 1;
    };
  }, [operationalTenantId, selectedMonthKey, status]);

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

  useEffect(() => {
    if (
      operationalTenantId === null ||
      catalogTenantIdRef.current !== operationalTenantId ||
      categoriesLoading ||
      costCentersLoading
    ) {
      return;
    }
    let nextParams: URLSearchParams | null = null;
    if (
      selectedCategoryId !== null &&
      !categories.some((item) => item.id === selectedCategoryId)
    ) {
      nextParams = buildDashboardCategorySearchParams(nextParams ?? searchParams, null);
    }
    if (
      selectedCostCenterId !== null &&
      !costCenters.some((item) => item.id === selectedCostCenterId)
    ) {
      nextParams = buildDashboardCostCenterSearchParams(nextParams ?? searchParams, null);
    }
    if (nextParams) {
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [
    categories,
    categoriesLoading,
    costCenters,
    costCentersLoading,
    operationalTenantId,
    pathname,
    router,
    searchParams,
    selectedCategoryId,
    selectedCostCenterId,
  ]);

  const selectedMonthPhase = dashboardMonthPhase(selectedMonthKey, todayMonthKey);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const controller = new AbortController();
    const soft = viewRef.current.kind === 'ready';
    void loadOverview(controller.signal, selectedCostCenterId, { soft });
    return () => controller.abort();
  }, [loadOverview, operationalTenantId, selectedCostCenterId, status]);

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
    if (periodMode !== 'monthly' || view.kind !== 'ready') {
      if (view.kind !== 'ready') {
        setCashMovementHistoryView({ kind: 'idle' });
      }
      return;
    }
    const controller = new AbortController();
    const soft = cashMovementHistoryViewRef.current.kind === 'ready';
    void loadCashMovementHistory(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    loadCashMovementHistory,
    periodMode,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    const wantsHorizon = periodMode === 'monthly' && monthlyCashMode === 'expected';
    if (!wantsHorizon || view.kind !== 'ready') {
      if (!wantsHorizon) {
        setCashExpectedHorizonView({ kind: 'idle' });
      }
      return;
    }
    const controller = new AbortController();
    const soft = cashExpectedHorizonViewRef.current.kind === 'ready';
    void loadCashExpectedHorizon(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      expectedHorizon,
      selectedCostCenterId,
      selectedCategoryId,
      { soft },
    );
    return () => controller.abort();
  }, [
    monthlyCashMode,
    expectedHorizon,
    loadCashExpectedHorizon,
    periodMode,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    if (view.kind !== 'ready') {
      setCashBalanceHistoryView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const soft = cashBalanceHistoryViewRef.current.kind === 'ready';
    void loadCashBalanceHistory(controller.signal, selectedMonthKey, todayMonthKey, { soft });
    return () => controller.abort();
  }, [loadCashBalanceHistory, selectedMonthKey, todayMonthKey, view.kind]);

  useEffect(() => {
    if (expandKind !== 'receivable' || view.kind !== 'ready') {
      setExpectedReceivableDetailsView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    void loadExpectedReceivableDetails(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
    );
    return () => controller.abort();
  }, [
    expandKind,
    loadExpectedReceivableDetails,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
    todayMonthKey,
    view.kind,
  ]);

  useEffect(() => {
    if (expandKind !== 'payable' || view.kind !== 'ready') {
      setExpectedPayableDetailsView({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    void loadExpectedPayableDetails(
      controller.signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
    );
    return () => controller.abort();
  }, [
    expandKind,
    loadExpectedPayableDetails,
    selectedCategoryId,
    selectedCostCenterId,
    selectedMonthKey,
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
  const retryCashFlow = () => {
    void loadMonthlyCashFlow(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
    );
  };
  const retryCashMovementHistory = () => {
    void loadCashMovementHistory(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      selectedCostCenterId,
      selectedCategoryId,
    );
  };
  const retryCashExpectedHorizon = () => {
    void loadCashExpectedHorizon(
      new AbortController().signal,
      selectedMonthKey,
      todayMonthKey,
      expectedHorizon,
      selectedCostCenterId,
      selectedCategoryId,
    );
  };

  const retryRevenueGoal = () => {
    void loadRevenueGoal(new AbortController().signal, selectedMonthKey, todayMonthKey);
  };

  const selectPeriodMode = (mode: PeriodMode) => {
    setPeriodMode(mode);
    setMonthlyCashMode('realized');
  };

  const selectMonthlyCashMode = (mode: MonthlyCashMode) => {
    if (mode === 'expected' && monthlyCashMode !== 'expected') {
      setExpectedHorizon(3);
    }
    setMonthlyCashMode(mode);
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

  const revenueGoalData = revenueGoalView.kind === 'ready' ? revenueGoalView.data : null;
  const revenueGoalError = revenueGoalView.kind === 'error' ? revenueGoalView.message : null;
  const canExpandGoal = gate === 'ready' && revenueGoalData !== null;

  const billingKpi = cashFlowModel
    ? toCashBillingKpi(cashFlowModel, selectedMonthPhase)
    : { title: 'Faturamento' as const };
  const billingSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashBillingKpi(model, selectedMonthPhase),
  );
  const receivableSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashReceivableKpi(model, selectedMonthPhase),
  );
  const expensesSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashExpensesKpi(model, selectedMonthPhase),
  );
  const payableSlot = cashKpiSlot(gate, monthlyCashFlowView, (model) =>
    toCashPayableKpi(model, selectedMonthPhase),
  );
  const managerialResultSlot = cashKpiSlot(gate, monthlyCashFlowView, toCashManagerialResultKpi);
  const overdueSlot = cashKpiSlot(gate, monthlyCashFlowView, toCashOverdueReceivablesKpi);
  const delinquencySlot =
    gate !== 'ready' || view.kind !== 'ready'
      ? (gateSlot(gate) ?? { state: 'loading' as const })
      : kpiViewSlot(toOverviewDelinquencyRateKpi(view.data));

  const receivableShareLabel =
    cashFlowModel &&
    receivableSlot.state === 'ready' &&
    cashFlowModel.receivable !== null
      ? shareLabel(cashFlowModel.receivable, cashFlowModel.billing)
      : undefined;

  const cashHasSplit = cashFlowModel !== null && cashFlowModel.costCenterCashSplit;

  const receivableDaily = useMemo(
    () => (cashFlowModel ? cashReceivableDailySeries(cashFlowModel) : undefined),
    [cashFlowModel],
  );
  const payableDaily = useMemo(
    () => (cashFlowModel ? cashExpectedPayablesSeries(cashFlowModel) : undefined),
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
  const dailySeries = {
    inflows: realizedInflows,
    outflows: realizedOutflows,
  };
  const dailySeriesReady =
    dailySeries.inflows !== undefined && dailySeries.outflows !== undefined;

  const historyError =
    cashMovementHistoryView.kind === 'error' ? cashMovementHistoryView.message : null;
  const historyPending =
    cashMovementHistoryView.kind === 'idle' || cashMovementHistoryView.kind === 'loading';
  const historyData =
    cashMovementHistoryView.kind === 'ready' ? cashMovementHistoryView.data : null;
  const historyMonthsUnavailable =
    historyData !== null &&
    (!historyData.costCenterCashSplit ||
      historyData.months.some(
        (month) =>
          month.realized.inflows === null ||
          month.realized.outflows === null ||
          month.realized.result === null,
      ));
  const monthlyHistoryBuckets = useMemo<readonly CashMonthlyGroupedBarsBucket[] | null>(() => {
    if (historyData === null || historyMonthsUnavailable) {
      return null;
    }
    return historyData.months.map((month) => ({
      monthKey: month.monthKey,
      inflows: month.realized.inflows,
      outflows: month.realized.outflows,
      result: month.realized.result,
    }));
  }, [historyData, historyMonthsUnavailable]);

  const showExpectedHorizon = periodMode === 'monthly' && monthlyCashMode === 'expected';
  const horizonError =
    cashExpectedHorizonView.kind === 'error' ? cashExpectedHorizonView.message : null;
  const horizonPending =
    cashExpectedHorizonView.kind === 'idle' || cashExpectedHorizonView.kind === 'loading';
  const horizonData =
    cashExpectedHorizonView.kind === 'ready' ? cashExpectedHorizonView.data : null;
  const horizonUnavailable =
    horizonData !== null &&
    (!horizonData.costCenterCashSplit ||
      horizonData.months.some(
        (month) =>
          month.expected.receivables === null ||
          month.expected.payables === null ||
          month.expected.result === null,
      ));
  const expectedHorizonBuckets = useMemo<readonly CashMonthlyGroupedBarsBucket[] | null>(() => {
    if (horizonData === null || horizonUnavailable) {
      return null;
    }
    return horizonData.months.map((month) => ({
      monthKey: month.monthKey,
      inflows: month.expected.receivables,
      outflows: month.expected.payables,
      result: month.expected.result,
    }));
  }, [horizonData, horizonUnavailable]);

  /** Linha de saldo: só Realizado (diário) / Mensal, sem category/CC, com pontos reais. */
  const balanceFiltersClear = selectedCategoryId === null && selectedCostCenterId === null;
  const balanceData =
    cashBalanceHistoryView.kind === 'ready' ? cashBalanceHistoryView.data : null;
  const showDailyBalanceLine =
    periodMode === 'daily' &&
    balanceFiltersClear &&
    balanceData !== null &&
    balanceData.coverage !== 'none' &&
    balanceData.daily.length > 0;
  const showMonthlyBalanceLine =
    periodMode === 'monthly' &&
    monthlyCashMode === 'realized' &&
    balanceFiltersClear &&
    balanceData !== null &&
    balanceData.coverage !== 'none' &&
    balanceData.monthly.length > 0;
  const dailyBalanceMap = useMemo(
    () => (showDailyBalanceLine && balanceData ? balanceByDate(balanceData.daily) : undefined),
    [balanceData, showDailyBalanceLine],
  );
  const monthlyBalanceMap = useMemo(
    () =>
      showMonthlyBalanceLine && balanceData ? balanceByMonthKey(balanceData.monthly) : undefined,
    [balanceData, showMonthlyBalanceLine],
  );
  const balanceCoverageNote =
    balanceFiltersClear &&
    balanceData !== null &&
    balanceData.coverage === 'partial' &&
    balanceData.availableFrom !== null
      ? `Saldo bancário disponível a partir de ${formatCivilDatePtBr(balanceData.availableFrom)}`
      : null;

  const managerialMargin =
    cashFlowModel &&
    cashFlowModel.managerialResult !== null &&
    cashFlowModel.billing !== null
      ? managerialMarginLabel(cashFlowModel.managerialResult, cashFlowModel.billing)
      : undefined;

  const canExpandMovement =
    gate === 'ready' &&
    (periodMode === 'daily'
      ? dailySeriesReady
      : showExpectedHorizon
        ? expectedHorizonBuckets !== null && expectedHorizonBuckets.length > 0
        : monthlyHistoryBuckets !== null && monthlyHistoryBuckets.length > 0);
  const canExpandCashDetail = gate === 'ready' && cashHasSplit && cashFlowModel !== null;
  const canExpandBilling =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.billing !== null;
  const canExpandReceivable =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.receivable !== null;
  const canExpandExpenses =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.monthlyExpenses !== null;
  const canExpandPayable =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.payable !== null;
  const canExpandResult =
    canExpandCashDetail && cashFlowModel !== null && cashFlowModel.managerialResult !== null;
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
  const canExpandDelinquency = gate === 'ready' && monthlyCashFlowView.kind === 'ready';

  const closeExpand = useCallback(() => {
    setExpandKind(null);
    setExpectedReceivableDetailsView({ kind: 'idle' });
    setExpectedPayableDetailsView({ kind: 'idle' });
  }, []);

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
            onExpand={canExpandExpenses ? () => setExpandKind('expense') : undefined}
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
            title="Contas a pagar"
            tone="expense"
            state={payableSlot.state}
            value={payableSlot.value}
            meta={payableSlot.meta}
            emptyMessage={payableSlot.emptyMessage}
            sparklinePoints={payableDaily}
            sparklineAriaLabel={CASH_PAYABLE_SPARKLINE_CAPTION}
            sparklineCaption={CASH_PAYABLE_SPARKLINE_CAPTION}
            expandable={canExpandPayable}
            onExpand={canExpandPayable ? () => setExpandKind('payable') : undefined}
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
          id="movimentacao-financeira"
          sectionId="movimentacao-financeira"
          title="Movimentação financeira"
          subtitle={
            periodMode === 'monthly'
              ? monthlyCashMode === 'expected'
                ? cashExpectedHorizonSubtitle(expectedHorizon)
                : `Entradas e saídas realizadas · 12 meses até ${monthLabel}`
              : 'Entradas e saídas por dia de baixa'
          }
          expandable={canExpandMovement}
          onExpand={canExpandMovement ? () => setExpandKind('daily') : undefined}
        >
          <div
            className={styles.segmented}
            role="group"
            aria-label="Granularidade da movimentação financeira"
            data-stop-expand
          >
            {PERIOD_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.segmentedOption}
                aria-pressed={periodMode === mode.id}
                onClick={() => selectPeriodMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {periodMode === 'monthly' ? (
            <div
              className={styles.segmented}
              role="group"
              aria-label="Recorte da movimentação financeira"
              data-stop-expand
            >
              {MONTHLY_CASH_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={styles.segmentedOption}
                  aria-pressed={monthlyCashMode === mode.id}
                  onClick={() => selectMonthlyCashMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          ) : null}
          {showExpectedHorizon ? (
            <div className={styles.expectedHorizonControl} data-stop-expand>
              <p id={expectedHorizonLabelId} className={styles.expectedHorizonLabel}>
                Horizonte da previsão
              </p>
              <div
                className={styles.segmented}
                role="group"
                aria-labelledby={expectedHorizonLabelId}
              >
                {EXPECTED_HORIZON_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={styles.segmentedOption}
                    aria-pressed={expectedHorizon === mode.id}
                    onClick={() => setExpectedHorizon(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <WidgetBody
            gate={gate}
            loadingLabel="Carregando movimentação financeira"
            error={
              periodMode === 'monthly'
                ? showExpectedHorizon
                  ? horizonError
                  : historyError
                : cashFlowError
            }
            onRetry={
              periodMode === 'monthly'
                ? showExpectedHorizon
                  ? retryCashExpectedHorizon
                  : retryCashMovementHistory
                : retryCashFlow
            }
            pending={
              periodMode === 'monthly'
                ? showExpectedHorizon
                  ? horizonPending
                  : historyPending
                : cashFlowPending
            }
          >
            {periodMode === 'monthly' ? (
              showExpectedHorizon ? (
                expectedHorizonBuckets && horizonData ? (
                  <>
                    <dl className={`${styles.statsRow} ${styles.expectedHorizonSummary}`}>
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>A receber</dt>
                        <dd className={styles.statsValue}>
                          {horizonData.totals.receivables === null
                            ? '—'
                            : formatMoneyBrl(horizonData.totals.receivables)}
                        </dd>
                      </div>
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>A pagar</dt>
                        <dd className={styles.statsValue}>
                          {horizonData.totals.payables === null
                            ? '—'
                            : formatMoneyBrl(horizonData.totals.payables)}
                        </dd>
                      </div>
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>Saldo previsto</dt>
                        <dd className={styles.statsValue}>
                          {horizonData.totals.result === null
                            ? '—'
                            : formatMoneyBrl(horizonData.totals.result)}
                        </dd>
                      </div>
                    </dl>
                    <CashMonthlyGroupedBars
                      buckets={expectedHorizonBuckets}
                      ariaLabel={cashExpectedHorizonSubtitle(expectedHorizon)}
                      caption={CASH_EXPECTED_HORIZON_CAPTION}
                      emptyMessage="Sem vencimentos previstos no prazo neste horizonte."
                      inflowLabel="A receber"
                      outflowLabel="A pagar"
                      resultLabel="Saldo previsto"
                    />
                  </>
                ) : (
                  <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
                )
              ) : monthlyHistoryBuckets ? (
                <CashMonthlyGroupedBars
                  buckets={monthlyHistoryBuckets}
                  ariaLabel={`Entradas e saídas realizadas por mês de baixa · 12 meses até ${monthLabel}`}
                  caption={CASH_MONTHLY_REALIZED_CAPTION}
                  emptyMessage={`Sem baixas de caixa nos 12 meses até ${monthLabel}.`}
                  balanceByMonthKey={monthlyBalanceMap}
                  balanceCoverageNote={showMonthlyBalanceLine ? balanceCoverageNote : null}
                />
              ) : (
                <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
              )
            ) : dailySeries.inflows && dailySeries.outflows ? (
              <CompetenceDailyBars
                revenueDaily={dailySeries.inflows}
                expenseDaily={dailySeries.outflows}
                monthKey={selectedMonthKey}
                revenueLabel="Entradas"
                expenseLabel="Saídas"
                ariaLabel={`Entradas e saídas de caixa por dia de baixa em ${monthLabel}`}
                caption={CASH_DAILY_REALIZED_CAPTION}
                emptyMessage={`Sem baixas de caixa em ${monthLabel}.`}
                balanceByDate={dailyBalanceMap}
                balanceCoverageNote={showDailyBalanceLine ? balanceCoverageNote : null}
              />
            ) : (
              <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
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
        data-cols="2"
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
            {cashFlowModel.realizedInflowsByCategory &&
            cashFlowModel.realizedInflowsByCategory.items.length > 0 &&
            operationalTenantId !== null ? (
              <>
                <p className={styles.expandLabel}>Categorias das entradas realizadas</p>
                <CashCategoryDrilldown
                  composition={cashFlowModel.realizedInflowsByCategory}
                  direction="inflows"
                  monthKey={selectedMonthKey}
                  tenantId={operationalTenantId}
                  costCenterId={selectedCostCenterId}
                  categoryId={selectedCategoryId}
                  sectionTitle="Categorias das entradas realizadas"
                  colorVar="--color-series-revenue"
                  emptyMessage="Sem entradas categorizadas neste mês."
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
              {expectedReceivables
                ? (() => {
                    const peak = peakNonZeroDailyPoint(expectedReceivables);
                    return peak ? (
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>Maior vencimento previsto</dt>
                        <dd className={styles.statsValue}>
                          {formatPeakDayLabel(peak.date)} · {formatMoneyBrl(peak.amount)}
                        </dd>
                      </div>
                    ) : null;
                  })()
                : null}
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
            <h3 className={expectedReceivableStyles.sectionTitle}>Recebimentos previstos</h3>
            {expectedReceivableDetailsView.kind === 'loading' ? (
              <p className={expectedReceivableStyles.loading}>Carregando detalhes…</p>
            ) : null}
            {expectedReceivableDetailsView.kind === 'error' ? (
              <p className={expectedReceivableStyles.error} role="alert">
                {expectedReceivableDetailsView.message}
              </p>
            ) : null}
            {expectedReceivableDetailsView.kind === 'ready' &&
            expectedReceivableDetailsView.data.available ? (
              <ExpectedReceivableDetailsPanel items={expectedReceivableDetailsView.data.items} />
            ) : null}
            {expectedReceivableDetailsView.kind === 'ready' &&
            !expectedReceivableDetailsView.data.available ? (
              <p className={expectedReceivableStyles.empty}>
                Detalhamento indisponível para o centro de custo selecionado.
              </p>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'payable' && cashFlowModel && cashFlowModel.payable !== null ? (
        <WidgetExpandDialog
          open
          title="Contas a pagar"
          subtitle={`Previsto no prazo · ${monthLabel}`}
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <dl className={styles.statsRow}>
              <div className={styles.statsItem}>
                <dt className={styles.statsLabel}>Total a pagar</dt>
                <dd className={styles.statsValue}>{formatMoneyBrl(cashFlowModel.payable)}</dd>
              </div>
              {expectedPayables
                ? (() => {
                    const peak = peakNonZeroDailyPoint(expectedPayables);
                    return peak ? (
                      <div className={styles.statsItem}>
                        <dt className={styles.statsLabel}>Maior vencimento previsto</dt>
                        <dd className={styles.statsValue}>
                          {formatPeakDayLabel(peak.date)} · {formatMoneyBrl(peak.amount)}
                        </dd>
                      </div>
                    ) : null;
                  })()
                : null}
            </dl>
            {expectedPayables && expectedPayables.length > 0 ? (
              <CompetenceDailyBars
                revenueDaily={zeroSeriesLike(expectedPayables)}
                expenseDaily={expectedPayables}
                monthKey={selectedMonthKey}
                revenueLabel="—"
                expenseLabel="A pagar"
                ariaLabel={`A pagar por dia de vencimento em ${monthLabel}`}
                caption={CASH_DAILY_EXPECTED_CAPTION}
                emptyMessage={`Sem valores a pagar no prazo em ${monthLabel}.`}
              />
            ) : (
              <p className={styles.expandLabel}>
                Sem previsão a pagar no prazo neste mês.
              </p>
            )}
            <h3 className={expectedPayableStyles.sectionTitle}>Pagamentos previstos</h3>
            {expectedPayableDetailsView.kind === 'loading' ? (
              <p className={expectedPayableStyles.loading}>Carregando detalhes…</p>
            ) : null}
            {expectedPayableDetailsView.kind === 'error' ? (
              <p className={expectedPayableStyles.error} role="alert">
                {expectedPayableDetailsView.message}
              </p>
            ) : null}
            {expectedPayableDetailsView.kind === 'ready' &&
            expectedPayableDetailsView.data.available ? (
              <ExpectedPayableDetailsPanel items={expectedPayableDetailsView.data.items} />
            ) : null}
            {expectedPayableDetailsView.kind === 'ready' &&
            !expectedPayableDetailsView.data.available ? (
              <p className={expectedPayableStyles.empty}>
                Detalhamento indisponível para o centro de custo selecionado.
              </p>
            ) : null}
          </div>
        </WidgetExpandDialog>
      ) : null}

      {expandKind === 'expense' && cashFlowModel && cashFlowModel.monthlyExpenses !== null ? (
        <WidgetExpandDialog
          open
          title="Despesas"
          subtitle={`Caixa de ${monthLabel}`}
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
            {realizedOutflows ? (
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
                <p className={styles.expandLabel}>
                  Saídas realizadas acumuladas (dia de baixa)
                </p>
                <div className={styles.expandChart}>
                  <Sparkline
                    points={accumulate(realizedOutflows)}
                    colorVar="--color-series-expense"
                    interactive
                    ariaLabel="Saídas realizadas acumuladas por dia de baixa"
                    valueCaption="acumulado de caixa"
                  />
                </div>
              </div>
            ) : null}
            {expectedPayables && expectedPayables.length > 0 ? (
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
              <p className={styles.expandLabel}>Sem valores a pagar no prazo neste mês.</p>
            )}
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
            {operationalTenantId !== null ? (
              <CashCategoryDrilldown
                composition={cashFlowModel.realizedInflowsByCategory}
                direction="inflows"
                monthKey={selectedMonthKey}
                tenantId={operationalTenantId}
                costCenterId={selectedCostCenterId}
                categoryId={selectedCategoryId}
                sectionTitle="Receitas por categoria"
                colorVar="--color-series-revenue"
                emptyMessage={CASH_CATEGORY_EMPTY}
              />
            ) : null}
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
            {operationalTenantId !== null ? (
              <CashCategoryDrilldown
                composition={cashFlowModel.realizedOutflowsByCategory}
                direction="outflows"
                monthKey={selectedMonthKey}
                tenantId={operationalTenantId}
                costCenterId={selectedCostCenterId}
                categoryId={selectedCategoryId}
                sectionTitle="Despesas por categoria"
                colorVar="--color-series-expense"
                emptyMessage={CASH_CATEGORY_EMPTY}
              />
            ) : null}
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

      {expandKind === 'daily' ? (
        <WidgetExpandDialog
          open
          title="Movimentação financeira"
          subtitle={
            periodMode === 'monthly'
              ? monthlyCashMode === 'expected'
                ? cashExpectedHorizonSubtitle(expectedHorizon)
                : `Entradas e saídas realizadas · 12 meses até ${monthLabel}`
              : `${monthLabel} · ${CASH_DAILY_REALIZED_CAPTION}`
          }
          onClose={closeExpand}
        >
          <div className={styles.expandBody}>
            <div
              className={styles.segmented}
              role="group"
              aria-label="Granularidade da movimentação financeira"
              data-stop-expand
            >
              {PERIOD_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={styles.segmentedOption}
                  aria-pressed={periodMode === mode.id}
                  onClick={() => selectPeriodMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {periodMode === 'monthly' ? (
              <>
                <div
                  className={styles.segmented}
                  role="group"
                  aria-label="Recorte da movimentação financeira"
                  data-stop-expand
                >
                  {MONTHLY_CASH_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={styles.segmentedOption}
                      aria-pressed={monthlyCashMode === mode.id}
                      onClick={() => selectMonthlyCashMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {showExpectedHorizon ? (
                  <div className={styles.expectedHorizonControl} data-stop-expand>
                    <p id={expectedHorizonExpandLabelId} className={styles.expectedHorizonLabel}>
                      Horizonte da previsão
                    </p>
                    <div
                      className={styles.segmented}
                      role="group"
                      aria-labelledby={expectedHorizonExpandLabelId}
                    >
                      {EXPECTED_HORIZON_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          className={styles.segmentedOption}
                          aria-pressed={expectedHorizon === mode.id}
                          onClick={() => setExpectedHorizon(mode.id)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {showExpectedHorizon ? (
                  horizonPending ? (
                    <StateWrapper
                      state="loading"
                      loadingLabel="Carregando movimentação financeira"
                    />
                  ) : horizonError ? (
                    <StateWrapper
                      state="error"
                      errorMessage={horizonError}
                      onRetry={retryCashExpectedHorizon}
                      align="start"
                    />
                  ) : expectedHorizonBuckets && horizonData ? (
                    <>
                      <dl className={`${styles.statsRow} ${styles.expectedHorizonSummary}`}>
                        <div className={styles.statsItem}>
                          <dt className={styles.statsLabel}>A receber</dt>
                          <dd className={styles.statsValue}>
                            {horizonData.totals.receivables === null
                              ? '—'
                              : formatMoneyBrl(horizonData.totals.receivables)}
                          </dd>
                        </div>
                        <div className={styles.statsItem}>
                          <dt className={styles.statsLabel}>A pagar</dt>
                          <dd className={styles.statsValue}>
                            {horizonData.totals.payables === null
                              ? '—'
                              : formatMoneyBrl(horizonData.totals.payables)}
                          </dd>
                        </div>
                        <div className={styles.statsItem}>
                          <dt className={styles.statsLabel}>Saldo previsto</dt>
                          <dd className={styles.statsValue}>
                            {horizonData.totals.result === null
                              ? '—'
                              : formatMoneyBrl(horizonData.totals.result)}
                          </dd>
                        </div>
                      </dl>
                      <CashMonthlyGroupedBars
                        buckets={expectedHorizonBuckets}
                        ariaLabel={cashExpectedHorizonSubtitle(expectedHorizon)}
                        caption={CASH_EXPECTED_HORIZON_CAPTION}
                        emptyMessage="Sem vencimentos previstos no prazo neste horizonte."
                        inflowLabel="A receber"
                        outflowLabel="A pagar"
                        resultLabel="Saldo previsto"
                      />
                    </>
                  ) : (
                    <StateWrapper
                      state="empty"
                      emptyMessage={CASH_SERIES_UNAVAILABLE}
                      align="start"
                    />
                  )
                ) : historyPending ? (
                  <StateWrapper state="loading" loadingLabel="Carregando movimentação financeira" />
                ) : historyError ? (
                  <StateWrapper
                    state="error"
                    errorMessage={historyError}
                    onRetry={retryCashMovementHistory}
                    align="start"
                  />
                ) : monthlyHistoryBuckets ? (
                  <CashMonthlyGroupedBars
                    buckets={monthlyHistoryBuckets}
                    ariaLabel={`Entradas e saídas realizadas por mês de baixa · 12 meses até ${monthLabel}`}
                    caption={CASH_MONTHLY_REALIZED_CAPTION}
                    emptyMessage={`Sem baixas de caixa nos 12 meses até ${monthLabel}.`}
                    balanceByMonthKey={monthlyBalanceMap}
                    balanceCoverageNote={showMonthlyBalanceLine ? balanceCoverageNote : null}
                  />
                ) : (
                  <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
                )}
              </>
            ) : dailySeries.inflows && dailySeries.outflows ? (
              <CompetenceDailyBars
                revenueDaily={dailySeries.inflows}
                expenseDaily={dailySeries.outflows}
                monthKey={selectedMonthKey}
                revenueLabel="Entradas"
                expenseLabel="Saídas"
                ariaLabel={`Entradas e saídas de caixa por dia de baixa em ${monthLabel}`}
                caption={CASH_DAILY_REALIZED_CAPTION}
                emptyMessage={`Sem baixas de caixa em ${monthLabel}.`}
                balanceByDate={dailyBalanceMap}
                balanceCoverageNote={showDailyBalanceLine ? balanceCoverageNote : null}
              />
            ) : (
              <StateWrapper state="empty" emptyMessage={CASH_SERIES_UNAVAILABLE} align="start" />
            )}
          </div>
        </WidgetExpandDialog>
      ) : null}
    </div>
  );
}
