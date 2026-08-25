'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { isPlatformRole, useAuth } from '../../auth';
import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import { currentDashboardMonthKey } from '../../lib/dashboard-month';
import {
  REPORT_TYPE_EXPENSES,
  REPORT_TYPE_REVENUE,
  buildReportsSearchParams,
  isReportType,
  parseReportsQuery,
  validateReportMonthRange,
  type ReportType,
} from '../../lib/reports-query';
import type { DashboardSituation } from '../../lib/dashboard-situation';
import { getDashboardCategories } from '../../services/dashboard/categories';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import { getDashboardCostCenters } from '../../services/dashboard/cost-centers';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import {
  downloadReportsExpensesExport,
  getReportsExpenses,
} from '../../services/reports/expenses';
import {
  ReportsExpensesRequestError,
  type ReportsExpensesResponse,
} from '../../services/reports/expenses.types';
import {
  downloadReportsRevenueExport,
  getReportsRevenue,
  type ReportsRevenueExportFormat,
} from '../../services/reports/revenue';
import {
  ReportsRevenueRequestError,
  type ReportsRevenueResponse,
} from '../../services/reports/revenue.types';
import { FinancialGrid, FinancialSection, KpiCard, StateWrapper } from '../financial';
import { DashboardCategorySelector } from '../dashboard/dashboard-category-selector';
import { DashboardCostCenterSelector } from '../dashboard/dashboard-cost-center-selector';
import { DashboardMonthSelector } from '../dashboard/dashboard-month-selector';
import { DashboardSituationSelector } from '../dashboard/dashboard-situation-selector';
import { hasOperationalDashboardTenant } from '../dashboard/dashboard-overview-view';
import { formatMonthKeyPtBr } from '../dashboard/dashboard-forecast-view';
import { Button, Typography } from '../ui';
import { isExpensesReportEmpty } from './reports-expenses-view';
import { isRevenueReportEmpty, revenueReportPeriodLabel } from './reports-revenue-view';
import styles from './reports-page.module.css';

type ViewState = 'idle' | 'loading' | 'empty' | 'error' | 'ready';

type AppliedFilters = {
  readonly type: ReportType;
  readonly from: string;
  readonly to: string;
  readonly costCenterId: string | null;
  readonly situation: DashboardSituation | null;
  readonly categoryId: string | null;
};

function moneyOrDash(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMoneyBrl(value);
}

function situationLabel(situation: DashboardSituation | null): string {
  if (situation === 'settled') return 'Quitado';
  if (situation === 'open') return 'Em aberto';
  if (situation === 'overdue') return 'Vencido';
  return 'Todas';
}

function isReportRequestError(
  error: unknown,
): error is ReportsRevenueRequestError | ReportsExpensesRequestError {
  return (
    error instanceof ReportsRevenueRequestError || error instanceof ReportsExpensesRequestError
  );
}

export function ReportsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, support, refreshSession } = useAuth();
  const typeSelectId = useId();
  const todayMonthKey = currentDashboardMonthKey();
  const parsed = useMemo(
    () => parseReportsQuery(searchParams),
    [searchParams],
  );

  const [reportType, setReportType] = useState<ReportType>(parsed.type);
  const [fromKey, setFromKey] = useState(parsed.from ?? todayMonthKey);
  const [toKey, setToKey] = useState(parsed.to ?? todayMonthKey);
  const [situation, setSituation] = useState<DashboardSituation | null>(parsed.situation);
  const [categoryId, setCategoryId] = useState<string | null>(parsed.categoryId);
  const [costCenterId, setCostCenterId] = useState<string | null>(parsed.costCenterId);
  const [categories, setCategories] = useState<readonly DashboardCategoryItem[]>([]);
  const [costCenters, setCostCenters] = useState<readonly DashboardCostCenterItem[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revenueData, setRevenueData] = useState<ReportsRevenueResponse | null>(null);
  const [expensesData, setExpensesData] = useState<ReportsExpensesResponse | null>(null);
  const [rangeHint, setRangeHint] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters | null>(null);
  const [exporting, setExporting] = useState<ReportsRevenueExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const lastRequestKey = useRef<string | null>(null);
  const exportLock = useRef(false);

  const hasTenant = hasOperationalDashboardTenant(user, support);
  const canQuery = hasTenant && Boolean(user);

  const requestKeyOf = useCallback(
    (next: {
      readonly type: ReportType;
      readonly from: string;
      readonly to: string;
      readonly costCenterId: string | null;
      readonly situation: DashboardSituation | null;
      readonly categoryId: string | null;
    }) =>
      `${next.type}|${next.from}|${next.to}|${next.costCenterId ?? ''}|${next.situation ?? ''}|${next.categoryId ?? ''}|${canQuery ? '1' : '0'}`,
    [canQuery],
  );

  const loadFilterCatalogs = useCallback(async () => {
    if (!canQuery) {
      setCategories([]);
      setCostCenters([]);
      return;
    }
    setFiltersLoading(true);
    try {
      const [categoryResult, costCenterResult] = await Promise.all([
        getDashboardCategories(),
        getDashboardCostCenters(),
      ]);
      setCategories(categoryResult.items);
      setCostCenters(costCenterResult.items);
    } catch {
      setCategories([]);
      setCostCenters([]);
    } finally {
      setFiltersLoading(false);
    }
  }, [canQuery]);

  useEffect(() => {
    void loadFilterCatalogs();
  }, [loadFilterCatalogs]);

  const fetchReport = useCallback(
    async (next: AppliedFilters) => {
      const issue = validateReportMonthRange(next.from, next.to);
      if (issue === 'inverted') {
        setRangeHint('O mês inicial não pode ser posterior ao mês final.');
        return;
      }
      if (issue === 'too_large') {
        setRangeHint('O intervalo não pode exceder 24 meses.');
        return;
      }
      if (issue === 'invalid') {
        setRangeHint('Informe um intervalo de meses válido (YYYY-MM).');
        return;
      }
      setRangeHint(null);
      if (!canQuery) {
        setViewState('error');
        setErrorMessage('Selecione uma empresa pelo modo suporte para visualizar este relatório.');
        return;
      }
      lastRequestKey.current = requestKeyOf(next);
      setViewState('loading');
      setErrorMessage(null);
      setExportError(null);
      setExporting(null);
      try {
        if (next.type === REPORT_TYPE_EXPENSES) {
          const result = await getReportsExpenses({
            from: next.from,
            to: next.to,
            costCenterId: next.costCenterId,
            situation: next.situation,
            categoryId: next.categoryId,
          });
          setExpensesData(result);
          setRevenueData(null);
          setAppliedFilters(next);
          setViewState(isExpensesReportEmpty(result) ? 'empty' : 'ready');
          return;
        }
        const result = await getReportsRevenue({
          from: next.from,
          to: next.to,
          costCenterId: next.costCenterId,
          situation: next.situation,
          categoryId: next.categoryId,
        });
        setRevenueData(result);
        setExpensesData(null);
        setAppliedFilters(next);
        setViewState(isRevenueReportEmpty(result) ? 'empty' : 'ready');
      } catch (error) {
        if (isReportRequestError(error) && error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setRevenueData(null);
        setExpensesData(null);
        setAppliedFilters(null);
        setViewState('error');
        setErrorMessage(
          isReportRequestError(error)
            ? error.message
            : next.type === REPORT_TYPE_EXPENSES
              ? 'Não foi possível carregar o relatório de despesas.'
              : 'Não foi possível carregar o relatório de receita.',
        );
      }
    },
    [canQuery, refreshSession, requestKeyOf, router],
  );

  const visualize = useCallback(
    (next: AppliedFilters) => {
      const qs = buildReportsSearchParams(next);
      router.replace(`${pathname}?${qs.toString()}`);
      void fetchReport(next);
    },
    [fetchReport, pathname, router],
  );

  useEffect(() => {
    if (!parsed.from || !parsed.to) {
      return;
    }
    setReportType(parsed.type);
    setFromKey(parsed.from);
    setToKey(parsed.to);
    setSituation(parsed.situation);
    setCategoryId(parsed.categoryId);
    setCostCenterId(parsed.costCenterId);
    const next = {
      type: parsed.type,
      from: parsed.from,
      to: parsed.to,
      costCenterId: parsed.costCenterId,
      situation: parsed.situation,
      categoryId: parsed.categoryId,
    };
    if (lastRequestKey.current === requestKeyOf(next)) {
      return;
    }
    void fetchReport(next);
  }, [
    parsed.type,
    parsed.from,
    parsed.to,
    parsed.costCenterId,
    parsed.situation,
    parsed.categoryId,
    canQuery,
    fetchReport,
    requestKeyOf,
  ]);

  const snapshotFrom = revenueData?.from ?? expensesData?.from;
  const snapshotTo = revenueData?.to ?? expensesData?.to;
  const copyType = appliedFilters?.type ?? reportType;

  const appliedSummary = useMemo(() => {
    if (!appliedFilters || snapshotFrom === undefined || snapshotTo === undefined) {
      return null;
    }
    const categoryName =
      appliedFilters.categoryId === null
        ? 'Todas'
        : (categories.find((item) => item.id === appliedFilters.categoryId)?.name ??
          'Categoria selecionada');
    const centerName =
      appliedFilters.costCenterId === null
        ? 'Todos'
        : (costCenters.find((item) => item.id === appliedFilters.costCenterId)?.name ??
          'Centro selecionado');
    const typeLabel = appliedFilters.type === REPORT_TYPE_EXPENSES ? 'Despesas' : 'Receita';
    return `${typeLabel} · ${revenueReportPeriodLabel(snapshotFrom, snapshotTo)} · Centro ${centerName} · Situação ${situationLabel(appliedFilters.situation)} · Categoria ${categoryName}`;
  }, [appliedFilters, categories, costCenters, snapshotFrom, snapshotTo]);

  const draftKey = requestKeyOf({
    type: reportType,
    from: fromKey,
    to: toKey,
    costCenterId,
    situation,
    categoryId,
  });
  const filtersInSync = appliedFilters !== null && requestKeyOf(appliedFilters) === draftKey;
  const visualized =
    (viewState === 'ready' || viewState === 'empty') &&
    (revenueData !== null || expensesData !== null);
  const exportReady = visualized && filtersInSync && canQuery;

  const exportReport = useCallback(
    async (format: ReportsRevenueExportFormat) => {
      if (!appliedFilters || !exportReady || exportLock.current) {
        return;
      }
      exportLock.current = true;
      setExporting(format);
      setExportError(null);
      try {
        const payload = {
          from: appliedFilters.from,
          to: appliedFilters.to,
          costCenterId: appliedFilters.costCenterId,
          situation: appliedFilters.situation,
          categoryId: appliedFilters.categoryId,
          format,
        };
        if (appliedFilters.type === REPORT_TYPE_EXPENSES) {
          await downloadReportsExpensesExport(payload);
        } else {
          await downloadReportsRevenueExport(payload);
        }
      } catch (error) {
        if (isReportRequestError(error) && error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setExportError(
          isReportRequestError(error)
            ? error.message
            : format === 'pdf'
              ? 'Não foi possível exportar o PDF.'
              : 'Não foi possível exportar o Excel.',
        );
      } finally {
        exportLock.current = false;
        setExporting(null);
      }
    },
    [appliedFilters, exportReady, refreshSession, router],
  );

  const filtersDisabled = viewState === 'loading' || !canQuery;
  const draftFilters: AppliedFilters = {
    type: reportType,
    from: fromKey,
    to: toKey,
    costCenterId,
    situation,
    categoryId,
  };

  return (
    <div className={styles.root} data-reports-page="true">
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Relatórios</h1>
        <p className={styles.pageSubtitle}>
          {reportType === REPORT_TYPE_EXPENSES
            ? 'Despesas por competência no intervalo de meses.'
            : 'Receita por competência no intervalo de meses.'}
        </p>
      </header>

      <form
        className={styles.filters}
        data-reports-filters="true"
        onSubmit={(event) => {
          event.preventDefault();
          visualize(draftFilters);
        }}
      >
        <div className={styles.filtersRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={typeSelectId}>
              Tipo
            </label>
            <select
              id={typeSelectId}
              className={styles.typeSelect}
              value={reportType}
              disabled={filtersDisabled}
              aria-label="Tipo de relatório"
              onChange={(event) => {
                const value = event.target.value;
                if (isReportType(value)) {
                  setReportType(value);
                }
              }}
            >
              <option value={REPORT_TYPE_REVENUE}>Receita</option>
              <option value={REPORT_TYPE_EXPENSES}>Despesas</option>
            </select>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel} id="report-from-label">
              De
            </span>
            <DashboardMonthSelector
              selectedMonthKey={fromKey}
              todayMonthKey={todayMonthKey}
              onSelect={setFromKey}
              disabled={filtersDisabled}
              groupLabel="De"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel} id="report-to-label">
              Até
            </span>
            <DashboardMonthSelector
              selectedMonthKey={toKey}
              todayMonthKey={todayMonthKey}
              onSelect={setToKey}
              disabled={filtersDisabled}
              groupLabel="Até"
            />
          </div>
          <DashboardSituationSelector
            selected={situation}
            onSelect={setSituation}
            disabled={filtersDisabled}
          />
          <DashboardCategorySelector
            items={categories}
            selectedId={categoryId}
            onSelect={setCategoryId}
            disabled={filtersDisabled}
            loading={filtersLoading}
          />
        </div>
        {costCenters.length > 0 ? (
          <div className={styles.costCenterField}>
            <span className={styles.fieldLabel} id="report-cost-center-label">
              Centro de custo
            </span>
            <div className={styles.costCenterRow}>
              <DashboardCostCenterSelector
                items={costCenters}
                selectedId={costCenterId}
                onSelect={setCostCenterId}
                disabled={filtersDisabled}
                loading={filtersLoading}
              />
            </div>
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button type="submit" disabled={filtersDisabled} aria-label="Visualizar relatório">
            Visualizar
          </Button>
        </div>
        {rangeHint ? (
          <Typography as="p" variant="caption" role="alert">
            {rangeHint}
          </Typography>
        ) : null}
      </form>

      <div className={styles.result} data-reports-result={viewState}>
        {visualized ? (
          <div className={styles.resultActions} data-reports-export="true">
            <Button
              type="button"
              variant="secondary"
              loading={exporting === 'pdf'}
              disabled={!exportReady || exporting !== null}
              aria-label="Exportar PDF"
              onClick={() => void exportReport('pdf')}
            >
              Exportar PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={exporting === 'xlsx'}
              disabled={!exportReady || exporting !== null}
              aria-label="Exportar Excel"
              onClick={() => void exportReport('xlsx')}
            >
              Exportar Excel
            </Button>
            {!filtersInSync ? (
              <Typography as="p" variant="caption">
                Filtros alterados — clique em Visualizar para atualizar o relatório antes de exportar.
              </Typography>
            ) : null}
            {exportError ? (
              <Typography as="p" variant="caption" role="alert">
                {exportError}
              </Typography>
            ) : null}
          </div>
        ) : null}

        {viewState === 'idle' ? (
          <p className={styles.idle}>
            {canQuery
              ? 'Selecione o intervalo e clique em Visualizar.'
              : user && isPlatformRole(user.role)
                ? 'Selecione uma empresa pelo modo suporte para visualizar este relatório.'
                : 'Selecione o intervalo e clique em Visualizar.'}
          </p>
        ) : null}

        {viewState === 'loading' || viewState === 'empty' || viewState === 'error' ? (
          <StateWrapper
            state={viewState === 'loading' ? 'loading' : viewState}
            loadingLabel="Gerando relatório"
            emptyMessage={
              copyType === REPORT_TYPE_EXPENSES
                ? 'Não há despesa de competência no intervalo selecionado.'
                : 'Não há receita de competência no intervalo selecionado.'
            }
            errorMessage={
              errorMessage ??
              (copyType === REPORT_TYPE_EXPENSES
                ? 'Não foi possível carregar o relatório de despesas.'
                : 'Não foi possível carregar o relatório de receita.')
            }
            onRetry={
              viewState === 'error'
                ? () => void visualize(draftFilters)
                : undefined
            }
          />
        ) : null}

        {viewState === 'ready' && revenueData ? (
          <>
            <p className={styles.applied}>{appliedSummary}</p>
            <FinancialGrid minItemWidth="12rem">
              <KpiCard
                title="Receita"
                state="ready"
                value={formatMoneyBrl(revenueData.receivables.total)}
                meta={revenueReportPeriodLabel(revenueData.from, revenueData.to)}
              />
              <KpiCard
                title="Recebido"
                state="ready"
                value={moneyOrDash(revenueData.receivables.received)}
                meta="Snapshot atual dos títulos do intervalo"
              />
              <KpiCard
                title="A receber"
                state="ready"
                value={moneyOrDash(revenueData.receivables.outstanding)}
              />
              <KpiCard
                title="Vencido"
                state="ready"
                value={moneyOrDash(revenueData.receivables.overdue)}
              />
              <KpiCard
                title="Cobertura"
                state="ready"
                value={formatDelinquencyRate(revenueData.receivables.coverageRate)}
                meta="Classificados sobre o total (D9)"
              />
            </FinancialGrid>

            <FinancialSection
              id="receita-composicao"
              title="Composição por categoria"
              subtitle="Participação no total de competência do intervalo."
            >
              <ul className={styles.compositionList}>
                {revenueData.receivables.items.map((item, index) => (
                  <li key={`${item.kind}:${index}:${item.name}`} className={styles.compositionRow}>
                    <span className={styles.compositionName}>{item.name}</span>
                    <span className={styles.compositionAmount}>{formatMoneyBrl(item.amount)}</span>
                    <span className={styles.compositionShare}>
                      {formatDelinquencyRate(item.percentage)}
                    </span>
                  </li>
                ))}
              </ul>
            </FinancialSection>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>Receita por mês de competência</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Receita</th>
                    <th scope="col">Recebido</th>
                    <th scope="col">A receber</th>
                    <th scope="col">Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.months.map((month) => (
                    <tr key={month.monthKey}>
                      <th scope="row">{formatMonthKeyPtBr(month.monthKey)}</th>
                      <td>{formatMoneyBrl(month.receivables.total)}</td>
                      <td>{moneyOrDash(month.receivables.received)}</td>
                      <td>{moneyOrDash(month.receivables.outstanding)}</td>
                      <td>{moneyOrDash(month.receivables.overdue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {viewState === 'ready' && expensesData ? (
          <>
            <p className={styles.applied}>{appliedSummary}</p>
            <FinancialGrid minItemWidth="12rem">
              <KpiCard
                title="Despesas"
                state="ready"
                value={formatMoneyBrl(expensesData.payables.total)}
                meta={revenueReportPeriodLabel(expensesData.from, expensesData.to)}
              />
              <KpiCard
                title="Pago"
                state="ready"
                value={moneyOrDash(expensesData.payables.paid)}
                meta="Snapshot atual dos títulos do intervalo"
              />
              <KpiCard
                title="A pagar"
                state="ready"
                value={moneyOrDash(expensesData.payables.outstanding)}
              />
              <KpiCard
                title="Vencido"
                state="ready"
                value={moneyOrDash(expensesData.payables.overdue)}
              />
              <KpiCard
                title="Cobertura"
                state="ready"
                value={formatDelinquencyRate(expensesData.payables.coverageRate)}
                meta="Classificados sobre o total (D9)"
              />
            </FinancialGrid>

            <FinancialSection
              id="despesas-composicao"
              title="Composição por categoria"
              subtitle="Participação no total de competência do intervalo."
            >
              <ul className={styles.compositionList}>
                {expensesData.payables.items.map((item, index) => (
                  <li key={`${item.kind}:${index}:${item.name}`} className={styles.compositionRow}>
                    <span className={styles.compositionName}>{item.name}</span>
                    <span className={styles.compositionAmount}>{formatMoneyBrl(item.amount)}</span>
                    <span className={styles.compositionShare}>
                      {formatDelinquencyRate(item.percentage)}
                    </span>
                  </li>
                ))}
              </ul>
            </FinancialSection>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>Despesas por mês de competência</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Despesas</th>
                    <th scope="col">Pago</th>
                    <th scope="col">A pagar</th>
                    <th scope="col">Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesData.months.map((month) => (
                    <tr key={month.monthKey}>
                      <th scope="row">{formatMonthKeyPtBr(month.monthKey)}</th>
                      <td>{formatMoneyBrl(month.payables.total)}</td>
                      <td>{moneyOrDash(month.payables.paid)}</td>
                      <td>{moneyOrDash(month.payables.outstanding)}</td>
                      <td>{moneyOrDash(month.payables.overdue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
