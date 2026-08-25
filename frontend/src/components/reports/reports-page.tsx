'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { isPlatformRole, useAuth } from '../../auth';
import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import { currentDashboardMonthKey } from '../../lib/dashboard-month';
import {
  REPORT_TYPE_REVENUE,
  buildReportsSearchParams,
  parseReportsQuery,
  validateReportMonthRange,
} from '../../lib/reports-query';
import type { DashboardSituation } from '../../lib/dashboard-situation';
import { getDashboardCategories } from '../../services/dashboard/categories';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import { getDashboardCostCenters } from '../../services/dashboard/cost-centers';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import { getReportsRevenue } from '../../services/reports/revenue';
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
import { isRevenueReportEmpty, revenueReportPeriodLabel } from './reports-revenue-view';
import styles from './reports-page.module.css';

type ViewState = 'idle' | 'loading' | 'empty' | 'error' | 'ready';

function moneyOrDash(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMoneyBrl(value);
}

function situationLabel(situation: DashboardSituation | null): string {
  if (situation === 'settled') return 'Quitado';
  if (situation === 'open') return 'Em aberto';
  if (situation === 'overdue') return 'Vencido';
  return 'Todas';
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
  const [data, setData] = useState<ReportsRevenueResponse | null>(null);
  const [rangeHint, setRangeHint] = useState<string | null>(null);

  const lastRequestKey = useRef<string | null>(null);

  const hasTenant = hasOperationalDashboardTenant(user, support);
  const canQuery = hasTenant && Boolean(user);

  const requestKeyOf = useCallback(
    (next: {
      readonly from: string;
      readonly to: string;
      readonly costCenterId: string | null;
      readonly situation: DashboardSituation | null;
      readonly categoryId: string | null;
    }) =>
      `${next.from}|${next.to}|${next.costCenterId ?? ''}|${next.situation ?? ''}|${next.categoryId ?? ''}|${canQuery ? '1' : '0'}`,
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
    async (next: {
      readonly from: string;
      readonly to: string;
      readonly costCenterId: string | null;
      readonly situation: DashboardSituation | null;
      readonly categoryId: string | null;
    }) => {
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
      try {
        const result = await getReportsRevenue({
          from: next.from,
          to: next.to,
          costCenterId: next.costCenterId,
          situation: next.situation,
          categoryId: next.categoryId,
        });
        setData(result);
        setViewState(isRevenueReportEmpty(result) ? 'empty' : 'ready');
      } catch (error) {
        if (error instanceof ReportsRevenueRequestError && error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setData(null);
        setViewState('error');
        setErrorMessage(
          error instanceof ReportsRevenueRequestError
            ? error.message
            : 'Não foi possível carregar o relatório de receita.',
        );
      }
    },
    [canQuery, refreshSession, requestKeyOf, router],
  );

  const visualize = useCallback(
    (next: {
      readonly from: string;
      readonly to: string;
      readonly costCenterId: string | null;
      readonly situation: DashboardSituation | null;
      readonly categoryId: string | null;
    }) => {
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
    setFromKey(parsed.from);
    setToKey(parsed.to);
    setSituation(parsed.situation);
    setCategoryId(parsed.categoryId);
    setCostCenterId(parsed.costCenterId);
    const next = {
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
    parsed.from,
    parsed.to,
    parsed.costCenterId,
    parsed.situation,
    parsed.categoryId,
    canQuery,
    fetchReport,
    requestKeyOf,
  ]);

  const appliedSummary = useMemo(() => {
    if (!data) {
      return null;
    }
    const categoryName =
      categoryId === null
        ? 'Todas'
        : (categories.find((item) => item.id === categoryId)?.name ?? 'Categoria selecionada');
    const centerName =
      costCenterId === null
        ? 'Todos'
        : (costCenters.find((item) => item.id === costCenterId)?.name ?? 'Centro selecionado');
    return `Receita · ${revenueReportPeriodLabel(data.from, data.to)} · Centro ${centerName} · Situação ${situationLabel(situation)} · Categoria ${categoryName}`;
  }, [data, categoryId, categories, costCenterId, costCenters, situation]);

  const filtersDisabled = viewState === 'loading' || !canQuery;

  return (
    <div className={styles.root} data-reports-page="true">
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Relatórios</h1>
        <p className={styles.pageSubtitle}>Receita por competência no intervalo de meses.</p>
      </header>

      <form
        className={styles.filters}
        data-reports-filters="true"
        onSubmit={(event) => {
          event.preventDefault();
          visualize({
            from: fromKey,
            to: toKey,
            costCenterId,
            situation,
            categoryId,
          });
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
              value={REPORT_TYPE_REVENUE}
              disabled={filtersDisabled}
              aria-label="Tipo de relatório"
              onChange={() => undefined}
            >
              <option value={REPORT_TYPE_REVENUE}>Receita</option>
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
            emptyMessage="Não há receita de competência no intervalo selecionado."
            errorMessage={errorMessage ?? 'Não foi possível carregar o relatório de receita.'}
            onRetry={
              viewState === 'error'
                ? () =>
                    void visualize({
                      from: fromKey,
                      to: toKey,
                      costCenterId,
                      situation,
                      categoryId,
                    })
                : undefined
            }
          />
        ) : null}

        {viewState === 'ready' && data ? (
          <>
            <p className={styles.applied}>{appliedSummary}</p>
            <FinancialGrid minItemWidth="12rem">
              <KpiCard
                title="Receita"
                state="ready"
                value={formatMoneyBrl(data.receivables.total)}
                meta={revenueReportPeriodLabel(data.from, data.to)}
              />
              <KpiCard
                title="Recebido"
                state="ready"
                value={moneyOrDash(data.receivables.received)}
                meta="Snapshot atual dos títulos do intervalo"
              />
              <KpiCard
                title="A receber"
                state="ready"
                value={moneyOrDash(data.receivables.outstanding)}
              />
              <KpiCard
                title="Vencido"
                state="ready"
                value={moneyOrDash(data.receivables.overdue)}
              />
              <KpiCard
                title="Cobertura"
                state="ready"
                value={formatDelinquencyRate(data.receivables.coverageRate)}
                meta="Classificados sobre o total (D9)"
              />
            </FinancialGrid>

            <FinancialSection
              id="receita-composicao"
              title="Composição por categoria"
              subtitle="Participação no total de competência do intervalo."
            >
              <ul className={styles.compositionList}>
                {data.receivables.items.map((item) => (
                  <li key={`${item.kind}-${item.name}`} className={styles.compositionRow}>
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
                  {data.months.map((month) => (
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
      </div>
    </div>
  );
}
