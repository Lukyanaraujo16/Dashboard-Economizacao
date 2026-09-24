import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { ReportType } from '../../lib/reports-query';
import type {
  ReportCashDetailItem,
  ReportCashDetailSituation,
} from '../../services/reports/details.types';
import { Button, Typography } from '../ui';
import { StateWrapper } from '../financial';
import { ReportTransactionsTable } from './report-transactions-table';
import {
  formatReportLaunchCount,
  reportTransactionsBlockTitle,
  reportTransactionsEmptyMessage,
  reportTransactionsUnavailableMessage,
} from './report-transactions-view';
import styles from './reports-page.module.css';

export type ReportTransactionsBlockState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly available: boolean;
      readonly unavailableReason: 'COST_CENTER_SPLIT' | null;
      readonly totalAmount: string | null;
      readonly itemCount: number;
      readonly items: readonly ReportCashDetailItem[];
      readonly loadingMore: boolean;
      readonly loadMoreError: string | null;
    };

export type ReportTransactionsBlockProps = {
  readonly type: ReportType;
  readonly situation: ReportCashDetailSituation;
  readonly state: ReportTransactionsBlockState;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
};

export function ReportTransactionsBlock({
  type,
  situation,
  state,
  onRetry,
  onLoadMore,
}: ReportTransactionsBlockProps) {
  const title = reportTransactionsBlockTitle(type, situation);
  const titleId = `report-tx-${situation.toLowerCase()}-title`;
  const loadedCount = state.kind === 'ready' ? state.items.length : 0;
  const hasMore = state.kind === 'ready' && state.available && loadedCount < state.itemCount;

  return (
    <section
      className={styles.transactionsBlock}
      aria-labelledby={titleId}
      data-report-transactions-block={situation}
      data-report-transactions-state={state.kind}
    >
      <header className={styles.transactionsBlockHeader}>
        <Typography as="h3" variant="title" id={titleId} className={styles.transactionsBlockTitle}>
          {title}
        </Typography>
        {state.kind === 'ready' && state.available ? (
          <div className={styles.transactionsBlockMeta}>
            <Typography
              as="p"
              variant="numeric"
              className={styles.transactionsTotal}
              data-report-transactions-total="true"
            >
              {state.totalAmount === null ? '—' : formatMoneyBrl(state.totalAmount)}
            </Typography>
            <Typography
              as="p"
              variant="caption"
              className={styles.transactionsCount}
              data-report-transactions-count="true"
            >
              {formatReportLaunchCount(state.itemCount)}
            </Typography>
          </div>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <StateWrapper state="loading" loadingLabel="Carregando lançamentos" align="start" />
      ) : null}

      {state.kind === 'error' ? (
        <StateWrapper
          state="error"
          errorMessage={state.message}
          onRetry={onRetry}
          align="start"
        />
      ) : null}

      {state.kind === 'ready' && !state.available ? (
        <Typography
          as="p"
          variant="body"
          className={styles.transactionsStatus}
          data-report-transactions-unavailable="COST_CENTER_SPLIT"
        >
          {reportTransactionsUnavailableMessage()}
        </Typography>
      ) : null}

      {state.kind === 'ready' && state.available && state.itemCount === 0 ? (
        <Typography as="p" variant="body" className={styles.transactionsStatus}>
          {reportTransactionsEmptyMessage(type, situation)}
        </Typography>
      ) : null}

      {state.kind === 'ready' && state.available && state.itemCount > 0 ? (
        <>
          <ReportTransactionsTable type={type} items={state.items} caption={title} />
          {hasMore ? (
            <div className={styles.transactionsLoadMore}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={state.loadingMore}
                disabled={state.loadingMore}
                aria-label={`Carregar mais ${title.toLowerCase()}`}
                onClick={onLoadMore}
              >
                Carregar mais ({loadedCount} de {state.itemCount})
              </Button>
              {state.loadMoreError ? (
                <Typography as="p" variant="caption" role="alert">
                  {state.loadMoreError}
                </Typography>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
