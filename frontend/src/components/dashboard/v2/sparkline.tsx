'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import {
  amountValues,
  buildSvgPoints,
  formatDayPt,
  indexFromRatio,
  isFlatSeries,
  maxAbs,
  svgBaselineY,
  toAreaPath,
  toPolyline,
  type DailyPoint,
} from './chart-math';
import { anchorRatioFromSvgX } from './chart-tooltip-placement';
import { ChartTooltip } from './chart-tooltip';
import styles from './sparkline.module.css';

const VIEW_WIDTH = 120;
const VIEW_HEIGHT = 36;
const VERTICAL_PADDING = 3;
const DEFAULT_VALUE_CAPTION = 'em competência';

export type SparklineProps = {
  readonly points: readonly DailyPoint[];
  /** Nome da variável CSS da série (ex.: `--color-series-expense`). */
  readonly colorVar?: string;
  readonly interactive?: boolean;
  readonly ariaLabel?: string;
  /** Legenda do valor no tooltip e na região viva (ex.: leitura de snapshot). */
  readonly valueCaption?: string;
  /** Séries que podem ser negativas: zero fica no meio do eixo. */
  readonly signed?: boolean;
  readonly className?: string;
};

/** Mini série diária por competência (Σ total do dia) — não representa caixa. */
export function Sparkline({
  points,
  colorVar = '--color-series-revenue',
  interactive = false,
  ariaLabel = 'Série diária por competência',
  valueCaption,
  signed = false,
  className,
}: SparklineProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const plotRef = useRef<HTMLDivElement>(null);

  const values = useMemo(() => amountValues(points), [points]);
  const scale = useMemo(
    () => ({
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      padding: VERTICAL_PADDING,
      max: maxAbs(values),
      signed,
    }),
    [signed, values],
  );
  const geometry = useMemo(() => buildSvgPoints(values, scale), [scale, values]);
  const baselineY = svgBaselineY(scale);

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!interactive) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      setActiveIndex(indexFromRatio((event.clientX - rect.left) / rect.width, points.length));
    },
    [interactive, points.length],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!interactive || points.length === 0) {
        return;
      }
      const last = points.length - 1;
      const current = activeIndex < 0 ? last : activeIndex;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex(Math.max(0, current - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex(Math.min(last, current + 1));
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(last);
      }
    },
    [activeIndex, interactive, points.length],
  );

  const style = { '--sparkline-color': `var(${colorVar})` } as CSSProperties;

  if (isFlatSeries(points)) {
    return (
      <div className={cx(styles.root, styles.flat, className)} style={style}>
        <svg
          className={styles.canvas}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Sem movimento no período"
        >
          <line
            className={styles.flatLine}
            x1={0}
            y1={VIEW_HEIGHT / 2}
            x2={VIEW_WIDTH}
            y2={VIEW_HEIGHT / 2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className={styles.flatLabel}>Sem movimento</p>
      </div>
    );
  }

  const activePoint = activeIndex >= 0 ? geometry[activeIndex] : undefined;
  const activeDaily = activeIndex >= 0 ? points[activeIndex] : undefined;

  return (
    <div
      ref={plotRef}
      className={cx(styles.root, interactive && styles.interactive, className)}
      style={style}
      role="img"
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onMouseMove={handleMove}
      onMouseLeave={interactive ? () => setActiveIndex(-1) : undefined}
      onFocus={interactive ? () => setActiveIndex(points.length - 1) : undefined}
      onBlur={interactive ? () => setActiveIndex(-1) : undefined}
      onKeyDown={handleKeyDown}
    >
      <svg
        className={styles.canvas}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className={styles.area} d={toAreaPath(geometry, baselineY)} />
        {signed ? (
          <line
            className={styles.zeroLine}
            x1={0}
            y1={baselineY}
            x2={VIEW_WIDTH}
            y2={baselineY}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <polyline
          className={styles.line}
          points={toPolyline(geometry)}
          vectorEffect="non-scaling-stroke"
        />
        {activePoint ? (
          <g>
            <line
              className={styles.marker}
              x1={activePoint.x}
              y1={0}
              x2={activePoint.x}
              y2={VIEW_HEIGHT}
              vectorEffect="non-scaling-stroke"
            />
            <circle className={styles.dot} cx={activePoint.x} cy={activePoint.y} r={2.5} />
          </g>
        ) : null}
      </svg>

      {activePoint && activeDaily ? (
        <ChartTooltip
          open
          anchorRatio={anchorRatioFromSvgX(activePoint.x, VIEW_WIDTH)}
          containerRef={plotRef}
          className={styles.tooltip}
          verticalMode="auto-above-below"
          aria-hidden="true"
        >
          <span className={styles.tooltipDay}>{formatDayPt(activeDaily.date)}</span>
          <span className={styles.tooltipValue}>{formatMoneyBrl(activeDaily.amount)}</span>
          {valueCaption ? (
            <span className={styles.tooltipCaption}>{valueCaption}</span>
          ) : null}
        </ChartTooltip>
      ) : null}

      <span className={styles.liveRegion} aria-live="polite">
        {activeDaily
          ? `${formatDayPt(activeDaily.date)}: ${formatMoneyBrl(activeDaily.amount)} ${valueCaption ?? DEFAULT_VALUE_CAPTION}`
          : ''}
      </span>
    </div>
  );
}
