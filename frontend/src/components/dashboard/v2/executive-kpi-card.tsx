'use client';

import {
  useCallback,
  useId,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  CircleCheckBig,
  Clock3,
  Maximize2,
  Scale,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import { IconButton } from '../../ui';
import { UI_ICON_STROKE } from '../../ui/icons';
import { cx } from '../../ui/utils/cx';
import { RatioMeter } from './ratio-meter';
import { Sparkline } from './sparkline';
import type { DailyPoint } from './chart-math';
import styles from './executive-kpi-card.module.css';

export type ExecutiveKpiTone = 'revenue' | 'received' | 'receivable' | 'expense' | 'result';
export type ExecutiveKpiState = 'ready' | 'loading' | 'empty';

const TONE_META: Record<
  ExecutiveKpiTone,
  { readonly colorVar: string; readonly Icon: LucideIcon }
> = {
  revenue: { colorVar: '--color-series-revenue', Icon: TrendingUp },
  received: { colorVar: '--color-series-received', Icon: CircleCheckBig },
  receivable: { colorVar: '--color-series-receivable', Icon: Clock3 },
  expense: { colorVar: '--color-series-expense', Icon: TrendingDown },
  result: { colorVar: '--color-series-result', Icon: Scale },
};

export type ExecutiveKpiCardProps = {
  readonly title: string;
  readonly value?: string;
  readonly meta?: string;
  readonly footer?: ReactNode;
  readonly tone: ExecutiveKpiTone;
  /** Série diária por competência (Σ total do dia) — não é caixa. */
  readonly sparklinePoints?: readonly DailyPoint[];
  /** Rótulo acessível da série; use quando a leitura não for o total do dia. */
  readonly sparklineAriaLabel?: string;
  /** Legenda do valor no tooltip da série (ex.: leitura de snapshot). */
  readonly sparklineCaption?: string;
  /** Série que pode ser negativa: zero fica no meio do eixo. */
  readonly sparklineSigned?: boolean;
  /** Proporção 0–1 exibida quando não há série diária. */
  readonly ratioValue?: number;
  readonly ratioLabel?: string;
  readonly onExpand?: () => void;
  readonly expandable?: boolean;
  readonly emptyMessage?: string;
  readonly state?: ExecutiveKpiState;
  readonly className?: string;
};

/** Card denso de KPI executivo — valor, microvisualização opcional e ação de expandir. */
export function ExecutiveKpiCard({
  title,
  value,
  meta,
  footer,
  tone,
  sparklinePoints,
  sparklineAriaLabel,
  sparklineCaption,
  sparklineSigned = false,
  ratioValue,
  ratioLabel,
  onExpand,
  expandable = false,
  emptyMessage = 'Disponível após sincronização.',
  state = 'ready',
  className,
}: ExecutiveKpiCardProps) {
  const { colorVar, Icon } = TONE_META[tone];
  const titleId = useId();
  const style = { '--kpi-tone': `var(${colorVar})` } as CSSProperties;
  const canExpand = expandable && Boolean(onExpand);
  const showSparkline = state === 'ready' && sparklinePoints !== undefined;
  const showRatio = state === 'ready' && !showSparkline && ratioValue !== undefined;

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canExpand) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('[data-stop-expand]')) {
        return;
      }
      onExpand?.();
    },
    [canExpand, onExpand],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!canExpand || event.target !== event.currentTarget) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onExpand?.();
      }
    },
    [canExpand, onExpand],
  );

  return (
    <div
      className={cx(styles.root, canExpand && styles.expandable, className)}
      style={style}
      data-tone={tone}
      data-state={state}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-labelledby={canExpand ? titleId : undefined}
      onClick={canExpand ? handleClick : undefined}
      onKeyDown={canExpand ? handleKeyDown : undefined}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Icon size={14} strokeWidth={UI_ICON_STROKE} />
        </span>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {canExpand ? (
          <IconButton
            size="sm"
            variant="ghost"
            className={styles.expand}
            aria-label="Expandir"
            data-stop-expand
            onClick={(event) => {
              event.stopPropagation();
              onExpand?.();
            }}
          >
            <Maximize2 size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {state === 'loading' ? (
        <div className={styles.skeleton} role="status" aria-label="Carregando indicador">
          <span className={styles.skeletonValue} />
          <span className={styles.skeletonMeta} />
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className={styles.body}>
          <p className={cx(styles.value, styles.valuePlaceholder)} aria-hidden="true">
            —
          </p>
          <p className={styles.meta}>{emptyMessage}</p>
        </div>
      ) : null}

      {state === 'ready' ? (
        <div className={styles.body}>
          <p className={styles.value}>{value ?? '—'}</p>
          {meta ? <p className={styles.meta}>{meta}</p> : null}
          {showSparkline ? (
            <div
              className={styles.microviz}
              data-stop-expand
              onClick={(event) => event.stopPropagation()}
            >
              <Sparkline
                points={sparklinePoints ?? []}
                colorVar={colorVar}
                interactive
                signed={sparklineSigned}
                valueCaption={sparklineCaption}
                ariaLabel={sparklineAriaLabel ?? `${title} — série diária por competência`}
              />
            </div>
          ) : null}
          {showRatio ? (
            <RatioMeter
              className={styles.microviz}
              ratio={ratioValue}
              colorVar={colorVar}
              label={ratioLabel}
            />
          ) : null}
          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
