'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import { getDashboardExpectedPayableDetails } from '../../services/dashboard/expected-payable-details';
import type { DashboardExpectedPayableDetailsResponse } from '../../services/dashboard/expected-payable-details.types';
import { DashboardExpectedPayableDetailsRequestError } from '../../services/dashboard/expected-payable-details.types';
import { getDashboardExpectedReceivableDetails } from '../../services/dashboard/expected-receivable-details';
import type { DashboardExpectedReceivableDetailsResponse } from '../../services/dashboard/expected-receivable-details.types';
import { DashboardExpectedReceivableDetailsRequestError } from '../../services/dashboard/expected-receivable-details.types';
import { Spinner } from '../ui';
import styles from './cash-realized-day-panel.module.css';
import { ExpectedPayableDetailsPanel } from './expected-payable-details-panel';
import { ExpectedReceivableDetailsPanel } from './expected-receivable-details-panel';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

export type CashExpectedMonthPanelsProps = {
  readonly monthKey: string;
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
};

type LoadState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: T }
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

function ExpectedSide<T extends { readonly available: boolean; readonly total: string | null; readonly items: readonly unknown[] }>({
  title,
  direction,
  heading,
  state,
  unavailableMessage,
  emptyMessage,
  children,
}: {
  readonly title: string;
  readonly direction: 'inflows' | 'outflows';
  readonly heading: string;
  readonly state: LoadState<T>;
  readonly unavailableMessage: string;
  readonly emptyMessage: string;
  readonly children: (data: T) => ReactNode;
}) {
  const ready = state.kind === 'ready' ? state.data : null;
  const showTotal = ready !== null && ready.available && ready.total !== null;
  return (
    <section
      className={styles.panel}
      data-cash-expected-month-panel="true"
      data-direction={direction}
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
            <p className={styles.total} data-cash-expected-month-total="true">
              <span className={styles.srOnly}>Total do mês: </span>
              {formatMoneyBrl(ready.total ?? '0')}
            </p>
            <p className={styles.count}>
              {ready.items.length} {ready.items.length === 1 ? 'título' : 'títulos'}
            </p>
          </div>
        ) : null}
      </header>
      {state.kind === 'loading' ? (
        <div className={styles.loading}>
          <div className={styles.loadingRow}>
            <Spinner size="sm" label="Carregando títulos" />
            <p className={styles.status}>Carregando títulos…</p>
          </div>
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
      {ready !== null && !ready.available ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>{unavailableMessage}</p>
        </div>
      ) : null}
      {ready !== null && ready.available && ready.items.length === 0 ? (
        <div className={styles.statusBlock}>
          <p className={styles.status}>{emptyMessage}</p>
        </div>
      ) : null}
      {ready !== null && ready.available && ready.items.length > 0 ? children(ready) : null}
    </section>
  );
}

export function CashExpectedMonthPanels({
  monthKey,
  costCenterId,
  categoryId,
}: CashExpectedMonthPanelsProps) {
  const [receivables, setReceivables] = useState<LoadState<DashboardExpectedReceivableDetailsResponse>>({
    kind: 'loading',
  });
  const [payables, setPayables] = useState<LoadState<DashboardExpectedPayableDetailsResponse>>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    setReceivables({ kind: 'loading' });
    setPayables({ kind: 'loading' });
    void getDashboardExpectedReceivableDetails(monthKey, costCenterId, categoryId)
      .then((data) => {
        if (!cancelled) {
          setReceivables({ kind: 'ready', data });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof DashboardExpectedReceivableDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os recebimentos previstos.';
        setReceivables({ kind: 'error', message });
      });
    void getDashboardExpectedPayableDetails(monthKey, costCenterId, categoryId)
      .then((data) => {
        if (!cancelled) {
          setPayables({ kind: 'ready', data });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof DashboardExpectedPayableDetailsRequestError
            ? error.message
            : 'Não foi possível carregar os pagamentos previstos.';
        setPayables({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, costCenterId, monthKey]);

  const heading = formatMonthHeading(monthKey);

  return (
    <div data-cash-movement-details="expected">
      <ExpectedSide
        title="A receber"
        direction="inflows"
        heading={heading}
        state={receivables}
        unavailableMessage="Não foi possível detalhar os recebimentos previstos deste mês para o recorte selecionado."
        emptyMessage="Nenhum título a receber no prazo neste mês."
      >
        {(data) => (
          <ExpectedReceivableDetailsPanel
            items={data.items}
            ariaLabel={`Títulos a receber em ${heading}`}
          />
        )}
      </ExpectedSide>
      <ExpectedSide
        title="A pagar"
        direction="outflows"
        heading={heading}
        state={payables}
        unavailableMessage="Não foi possível detalhar os pagamentos previstos deste mês para o recorte selecionado."
        emptyMessage="Nenhum título a pagar no prazo neste mês."
      >
        {(data) => (
          <ExpectedPayableDetailsPanel items={data.items} ariaLabel={`Títulos a pagar em ${heading}`} />
        )}
      </ExpectedSide>
    </div>
  );
}
