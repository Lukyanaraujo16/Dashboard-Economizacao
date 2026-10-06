'use client';

import { useEffect, useState } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import { getDashboardCashRealizedMonthDetails } from '../../services/dashboard/cash-realized-month-details';
import type { DashboardCashRealizedMonthDetailsResponse } from '../../services/dashboard/cash-realized-month-details.types';
import { DashboardCashRealizedMonthDetailsRequestError } from '../../services/dashboard/cash-realized-month-details.types';
import type { DashboardCashRealizedDayDetailItem } from '../../services/dashboard/cash-realized-day-details.types';
import { Spinner } from '../ui';
import styles from './cash-realized-day-panel.module.css';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

export type CashRealizedMonthPanelProps = {
  readonly monthKey: string;
  readonly direction: 'inflows' | 'outflows';
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
  readonly title: string;
};

type ReadyState = {
  readonly completeness: DashboardCashRealizedMonthDetailsResponse['completeness'];
  readonly total: string | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly items: readonly DashboardCashRealizedDayDetailItem[];
};

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ReadyState }
  | { readonly kind: 'error'; readonly message: string };

function formatMonthHeading(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (match === null) {
    return monthKey;
  }
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) {
    return monthKey;
  }
  return `${month} ${match[1]}`;
}

function lineMeta(item: DashboardCashRealizedDayDetailItem): string | null {
  const parts: string[] = [];
  const description = item.description?.trim() ?? '';
  if (description !== '' && description !== item.displayLabel) {
    parts.push(description);
  }
  const category = item.categoryNames.filter((name) => name.trim() !== '').join(', ');
  if (category !== '') {
    parts.push(category);
  }
  if (item.costCenterLabel !== null && item.costCenterLabel.trim() !== '') {
    parts.push(item.costCenterLabel.trim());
  }
  const occurred = item.occurredOn.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(occurred)) {
    const [, , day] = occurred.split('-');
    parts.push(`${Number(day)}/${occurred.slice(5, 7)}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

export function CashRealizedMonthPanel({
  monthKey,
  direction,
  costCenterId,
  categoryId,
  title,
}: CashRealizedMonthPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    setLoadingMore(false);
    void getDashboardCashRealizedMonthDetails({
      monthKey,
      direction,
      costCenterId,
      categoryId,
      offset: 0,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({
            kind: 'ready',
            data: {
              completeness: data.completeness,
              total: data.total,
              hasMore: data.hasMore,
              itemCount: data.itemCount,
              items: data.items,
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof DashboardCashRealizedMonthDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os lançamentos deste mês.';
        setState({ kind: 'error', message });
      });
    return () => controller.abort();
  }, [categoryId, costCenterId, direction, monthKey]);

  const loadMore = () => {
    if (state.kind !== 'ready' || !state.data.hasMore || loadingMore) {
      return;
    }
    const offset = state.data.items.length;
    setLoadingMore(true);
    void getDashboardCashRealizedMonthDetails({
      monthKey,
      direction,
      costCenterId,
      categoryId,
      offset,
    })
      .then((data) => {
        setState((current) => {
          if (current.kind !== 'ready') {
            return current;
          }
          const seen = new Set(current.data.items.map((item, index) => `${item.occurredOn}|${item.displayLabel}|${index}`));
          const appended = data.items.filter((item, index) => {
            const key = `${item.occurredOn}|${item.displayLabel}|${offset + index}`;
            return !seen.has(key);
          });
          return {
            kind: 'ready',
            data: {
              completeness: data.hasMore ? 'PARTIAL' : 'COMPLETE',
              total: data.total,
              hasMore: data.hasMore,
              itemCount: data.itemCount,
              items: [...current.data.items, ...appended],
            },
          };
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof DashboardCashRealizedMonthDetailsRequestError
            ? error.message
            : 'Não foi possível carregar mais lançamentos deste mês.';
        setState({ kind: 'error', message });
      })
      .finally(() => setLoadingMore(false));
  };

  const heading = formatMonthHeading(monthKey);
  const ready = state.kind === 'ready' ? state.data : null;
  const showTotal = ready !== null && ready.completeness !== 'UNAVAILABLE' && ready.total !== null;
  const shownCount = ready?.items.length ?? 0;
  const countLabel =
    ready !== null && ready.completeness === 'COMPLETE' && ready.itemCount > 0 && shownCount === ready.itemCount
      ? `${ready.itemCount} ${ready.itemCount === 1 ? 'lançamento' : 'lançamentos'}`
      : null;
  const partialLabel =
    ready !== null && ready.itemCount > shownCount
      ? `Exibindo ${shownCount} de ${ready.itemCount}`
      : null;

  return (
    <section
      className={styles.panel}
      data-cash-month-panel="true"
      data-direction={direction}
      data-completeness={ready?.completeness ?? state.kind}
      aria-busy={state.kind === 'loading'}
      aria-label={`${title} em ${heading}`}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <p className={styles.kicker}>
            <span className={styles.accent} aria-hidden="true" />
            {title}
          </p>
          <p className={styles.date}>{heading}</p>
        </div>
        {showTotal && ready !== null ? (
          <div className={styles.summary}>
            <p className={styles.total} data-cash-month-total="true">
              <span className={styles.srOnly}>Total do mês: </span>
              {formatMoneyBrl(ready.total ?? '0')}
            </p>
            {countLabel !== null ? <p className={styles.count}>{countLabel}</p> : null}
            {partialLabel !== null ? <p className={styles.count}>{partialLabel}</p> : null}
          </div>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <div className={styles.loading}>
          <div className={styles.loadingRow}>
            <Spinner size="sm" label="Carregando lançamentos" />
            <p className={styles.status}>Carregando lançamentos…</p>
          </div>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {ready?.completeness === 'UNAVAILABLE' ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>
            Não foi possível detalhar os lançamentos deste mês para o recorte selecionado.
          </p>
        </div>
      ) : null}

      {showTotal && ready !== null && ready.itemCount > shownCount ? (
        <p className={styles.note}>
          <span>Exibindo parte dos lançamentos deste mês.</span>{' '}
          <span>O valor acima é o total do mês.</span>
        </p>
      ) : null}

      {showTotal && ready !== null && ready.items.length === 0 ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>Nenhum lançamento neste mês.</p>
        </div>
      ) : null}

      {showTotal && ready !== null && ready.items.length > 0 ? (
        <ul className={styles.list}>
          {ready.items.map((item, index) => {
            const meta = lineMeta(item);
            return (
              <li className={styles.item} key={`${item.occurredOn}-${item.displayLabel}-${index}`}>
                <div className={styles.copy}>
                  <span className={styles.label}>{item.displayLabel}</span>
                  {meta ? <span className={styles.meta}>{meta}</span> : null}
                </div>
                <span className={styles.amount}>{formatMoneyBrl(item.attributedAmount)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {ready !== null && ready.hasMore ? (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando…' : 'Mostrar mais lançamentos'}
        </button>
      ) : null}
    </section>
  );
}
