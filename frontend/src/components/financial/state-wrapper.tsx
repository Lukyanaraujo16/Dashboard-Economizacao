import type { ReactNode } from 'react';

import { Button, Spinner, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import type { FinancialDataState } from './types';
import styles from './state-wrapper.module.css';

export type StateWrapperProps = {
  readonly state: FinancialDataState;
  readonly emptyMessage?: string;
  readonly loadingLabel?: string;
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
  readonly icon?: ReactNode;
  readonly align?: 'start' | 'center';
  readonly className?: string;
  readonly children?: ReactNode;
};

const DEFAULT_EMPTY = 'Nenhum dado disponível.';
const DEFAULT_LOADING = 'Carregando';
const DEFAULT_ERROR = 'Não foi possível carregar os dados.';

/**
 * Centraliza estados loading, empty e error.
 * Em `ready`, renderiza `children` sem alteração.
 */
export function StateWrapper({
  state,
  emptyMessage = DEFAULT_EMPTY,
  loadingLabel = DEFAULT_LOADING,
  errorMessage = DEFAULT_ERROR,
  onRetry,
  icon,
  align = 'center',
  className,
  children,
}: StateWrapperProps) {
  if (state === 'ready') {
    return children ?? null;
  }

  return (
    <div
      className={cx(styles.root, align === 'center' ? styles.center : styles.start, className)}
      data-state-wrapper={state}
      role={state === 'error' ? 'alert' : undefined}
    >
      {state === 'loading' ? <Spinner size="md" label={loadingLabel} /> : null}

      {state === 'empty' ? (
        <>
          {icon ? <div className={styles.iconSlot}>{icon}</div> : null}
          <Typography as="p" variant="body" className={styles.message}>
            {emptyMessage}
          </Typography>
        </>
      ) : null}

      {state === 'error' ? (
        <>
          <Typography as="p" variant="body" className={styles.errorMessage}>
            {errorMessage}
          </Typography>
          {onRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.retry}
              onClick={onRetry}
            >
              Tentar novamente
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
