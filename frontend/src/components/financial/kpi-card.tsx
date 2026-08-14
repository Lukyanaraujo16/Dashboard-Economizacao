import { Card, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import { StateWrapper } from './state-wrapper';
import type { FinancialDataState } from './types';
import styles from './kpi-card.module.css';

export type KpiCardProps = {
  readonly title: string;
  readonly state?: FinancialDataState;
  /** Valor exibido somente em `ready` — fornecido pelo consumidor via props. */
  readonly value?: string;
  readonly meta?: string;
  readonly emptyMessage?: string;
  readonly loadingLabel?: string;
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
};

/**
 * Card de KPI reutilizável — loading, empty, ready e error.
 * Sem origem de dados embutida; valores apenas via props em `ready`.
 */
export function KpiCard({
  title,
  state = 'empty',
  value,
  meta,
  emptyMessage = 'Disponível após sincronização.',
  loadingLabel,
  errorMessage,
  onRetry,
  className,
}: KpiCardProps) {
  return (
    <Card className={cx(styles.root, className)} data-kpi-card data-state={state}>
      <Typography as="h3" variant="label" className={styles.title}>
        {title}
      </Typography>

      <div
        className={cx(
          styles.body,
          state === 'loading' && styles.loadingBody,
          state === 'error' && styles.errorBody,
        )}
      >
        {state === 'empty' ? (
          <div className={styles.metric} data-kpi-empty="true">
            <Typography
              as="p"
              variant="numeric"
              className={styles.valuePlaceholder}
              aria-hidden="true"
            >
              —
            </Typography>
            <Typography as="p" variant="caption" className={styles.meta}>
              {emptyMessage}
            </Typography>
          </div>
        ) : null}

        {state === 'loading' || state === 'error' ? (
          <StateWrapper
            state={state}
            loadingLabel={loadingLabel}
            errorMessage={errorMessage}
            onRetry={onRetry}
            align="start"
          />
        ) : null}

        {state === 'ready' ? (
          <StateWrapper state="ready">
            <div className={styles.metric} data-kpi-ready="true">
              <Typography as="p" variant="numeric" className={styles.value}>
                {value}
              </Typography>
              {meta ? (
                <Typography as="p" variant="caption" className={styles.meta}>
                  {meta}
                </Typography>
              ) : null}
            </div>
          </StateWrapper>
        ) : null}
      </div>
    </Card>
  );
}
