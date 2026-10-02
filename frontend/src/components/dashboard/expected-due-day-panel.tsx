'use client';

import type { ReactNode } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import { Spinner } from '../ui';
import styles from './cash-realized-day-panel.module.css';
import {
  sumExpectedDueDayAmounts,
  titlesComposingExpectedDueDay,
  type ExpectedDueDayTitle,
} from './expected-due-day-drilldown';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

export type ExpectedDueDayDetailsState<T extends ExpectedDueDayTitle> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly data: {
        readonly available: boolean;
        readonly items: readonly T[];
      };
    };

export type ExpectedDueDayPanelProps<T extends ExpectedDueDayTitle> = {
  readonly date: string;
  readonly direction: 'receivable' | 'payable';
  /** Valor da barra. Null = ausência, não zero. */
  readonly chartAmount: string | null;
  readonly details: ExpectedDueDayDetailsState<T>;
  readonly renderItems: (items: readonly T[]) => ReactNode;
};

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

function titleNoun(count: number): string {
  return count === 1 ? 'título' : 'títulos';
}

/**
 * Detalhe do dia selecionado no gráfico de vencimento.
 * Reusa o painel visual do drill-down de faturamento/despesas.
 */
export function ExpectedDueDayPanel<T extends ExpectedDueDayTitle>({
  date,
  direction,
  chartAmount,
  details,
  renderItems,
}: ExpectedDueDayPanelProps<T>) {
  const nature = direction === 'receivable' ? 'A receber' : 'A pagar';
  const heading = formatDayHeading(date);
  const cashDirection = direction === 'payable' ? 'outflows' : 'inflows';
  const readyItems =
    details.kind === 'ready' && details.data.available
      ? titlesComposingExpectedDueDay(details.data.items, date)
      : null;
  const total = readyItems === null ? null : sumExpectedDueDayAmounts(readyItems);
  const showTotal = chartAmount !== null && total !== null;
  const emptyMessage =
    direction === 'receivable'
      ? 'Nenhum título a receber no prazo neste dia.'
      : 'Nenhum título a pagar no prazo neste dia.';

  return (
    <section
      className={styles.panel}
      data-expected-due-day-panel="true"
      data-direction={cashDirection}
      data-due-date={date}
      aria-busy={details.kind === 'loading' || details.kind === 'idle'}
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
        {showTotal && total !== null && readyItems !== null ? (
          <div className={styles.summary}>
            <p className={styles.total} data-expected-due-day-total="true">
              <span className={styles.srOnly}>Total do dia: </span>
              {formatMoneyBrl(total)}
            </p>
            {readyItems.length > 0 ? (
              <p className={styles.count}>
                {readyItems.length} {titleNoun(readyItems.length)}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {chartAmount === null ? (
        <div className={styles.statusBlock}>
          <p className={styles.status} data-expected-due-day-absent="true">
            Este dia não possui valor no gráfico.
          </p>
        </div>
      ) : null}

      {chartAmount !== null && (details.kind === 'loading' || details.kind === 'idle') ? (
        <div className={styles.loading}>
          <div className={styles.loadingRow}>
            <Spinner size="sm" label="Carregando títulos" />
            <p className={styles.status}>Carregando títulos…</p>
          </div>
        </div>
      ) : null}

      {chartAmount !== null && details.kind === 'error' ? (
        <p className={styles.error} role="alert">
          {details.message}
        </p>
      ) : null}

      {chartAmount !== null && details.kind === 'ready' && !details.data.available ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>
            Detalhamento indisponível para o centro de custo selecionado.
          </p>
        </div>
      ) : null}

      {showTotal && readyItems !== null && readyItems.length === 0 ? (
        <div className={styles.statusBlock}>
          <p className={styles.status} data-expected-due-day-empty="true">
            {emptyMessage}
          </p>
        </div>
      ) : null}

      {showTotal && readyItems !== null && readyItems.length > 0
        ? renderItems(readyItems)
        : null}
    </section>
  );
}
