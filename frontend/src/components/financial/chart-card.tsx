import type { ReactNode } from 'react';

import { Card, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import { PanelIcon, type PanelIconKind } from './panel-icon';
import { StateWrapper } from './state-wrapper';
import type { FinancialDataState } from './types';
import styles from './chart-card.module.css';

export type ChartCardSize = 'chart' | 'list' | 'default';

export type ChartCardProps = {
  readonly title?: string;
  readonly state: FinancialDataState;
  readonly size?: ChartCardSize;
  readonly icon?: PanelIconKind;
  readonly emptyMessage?: string;
  readonly loadingLabel?: string;
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
  /** Conteúdo do gráfico/lista — renderizado somente em `ready`. */
  readonly children?: ReactNode;
};

/**
 * Container reutilizável para gráficos e painéis analíticos futuros.
 * Sem implementação de gráfico — apenas estrutura e estados.
 */
export function ChartCard({
  title,
  state,
  size = 'default',
  icon,
  emptyMessage = 'Nenhum dado disponível.',
  loadingLabel,
  errorMessage,
  onRetry,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card
      variant="elevated"
      className={cx(styles.root, styles[size], className)}
      data-chart-card
      data-state={state}
    >
      {title ? (
        <Typography as="h3" variant="label" className={styles.header}>
          {title}
        </Typography>
      ) : null}

      <div className={styles.body}>
        <StateWrapper
          state={state}
          emptyMessage={emptyMessage}
          loadingLabel={loadingLabel}
          errorMessage={errorMessage}
          onRetry={onRetry}
          icon={icon ? <PanelIcon kind={icon} /> : undefined}
          align="center"
          className={styles.content}
        >
          {children}
        </StateWrapper>
      </div>
    </Card>
  );
}
