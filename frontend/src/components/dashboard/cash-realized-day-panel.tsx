'use client';

import { useEffect, useState } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import { getDashboardCashRealizedDayDetails } from '../../services/dashboard/cash-realized-day-details';
import type { DashboardCashRealizedDayDetailsResponse } from '../../services/dashboard/cash-realized-day-details.types';
import { DashboardCashRealizedDayDetailsRequestError } from '../../services/dashboard/cash-realized-day-details.types';
import { Spinner } from '../ui';
import styles from './cash-realized-day-panel.module.css';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: DashboardCashRealizedDayDetailsResponse }
  | { readonly kind: 'error'; readonly message: string };

export type CashRealizedDayPanelProps = {
  readonly date: string;
  readonly direction: 'inflows' | 'outflows';
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
};

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

function formatDayHeading(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (match === null) {
    return date;
  }
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) {
    return date;
  }
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function movementNoun(direction: 'inflows' | 'outflows', count: number): string {
  if (direction === 'inflows') {
    return count === 1 ? 'recebimento' : 'recebimentos';
  }
  return count === 1 ? 'pagamento' : 'pagamentos';
}

function lineMeta(item: DashboardCashRealizedDayDetailsResponse['items'][number]): string | null {
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
  return parts.length === 0 ? null : parts.join(' · ');
}

export function CashRealizedDayPanel({
  date,
  direction,
  costCenterId,
  categoryId,
}: CashRealizedDayPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void getDashboardCashRealizedDayDetails({
      date,
      direction,
      costCenterId,
      categoryId,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'ready', data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof DashboardCashRealizedDayDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os lançamentos deste dia.';
        setState({ kind: 'error', message });
      });
    return () => controller.abort();
  }, [categoryId, costCenterId, date, direction]);

  const nature = direction === 'inflows' ? 'Recebimentos' : 'Pagamentos';
  const heading = formatDayHeading(date);
  const ready = state.kind === 'ready' ? state.data : null;
  const showTotal = ready !== null && ready.completeness !== 'UNAVAILABLE' && ready.total !== null;
  const countLabel =
    ready !== null && ready.completeness === 'COMPLETE' && ready.itemCount > 0
      ? `${ready.itemCount} ${movementNoun(direction, ready.itemCount)}`
      : null;
  const partialLabel =
    ready !== null && ready.completeness === 'PARTIAL' && ready.hasMore && ready.itemCount > ready.items.length
      ? `Exibindo ${ready.items.length} de ${ready.itemCount}`
      : null;

  return (
    <section
      className={styles.panel}
      data-cash-day-panel="true"
      data-direction={direction}
      data-completeness={ready?.completeness ?? state.kind}
      aria-busy={state.kind === 'loading'}
      aria-label={`${nature} em ${heading}`}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <p className={styles.kicker}>
            <span className={styles.accent} aria-hidden="true" />
            {nature}
          </p>
          <p className={styles.date}>{heading}</p>
        </div>
        {showTotal && ready !== null ? (
          <div className={styles.summary}>
            <p className={styles.total} data-cash-day-total="true">
              <span className={styles.srOnly}>Total do dia: </span>
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
          <span className={styles.skeleton} aria-hidden="true">
            <span className={styles.skeletonAmount} />
            <span className={styles.skeletonLine} />
          </span>
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
            Não foi possível detalhar os lançamentos deste dia para o recorte selecionado.
          </p>
        </div>
      ) : null}

      {showTotal && ready !== null && ready.completeness === 'PARTIAL' ? (
        <p className={styles.note}>
          <span>Exibindo parte dos lançamentos deste dia.</span>{' '}
          <span>O valor acima é o total do dia.</span>
        </p>
      ) : null}

      {showTotal && ready !== null && ready.items.length === 0 ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>Nenhum lançamento neste dia.</p>
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
    </section>
  );
}
