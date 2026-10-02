'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
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
import { useDashboardPresentation } from './dashboard-presentation';
import {
  SPARKLINE_DRAW_DURATION_MS,
  applySparklineDrawPlay,
  applySparklineDrawStart,
  clearSparklineDraw,
  isSparklineStrokeTransitionEnd,
  readSparklinePathLength,
  sparklineDrawDelayMs,
} from './sparkline-draw';
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
  /** Data YYYY-MM-DD do ponto que permanece marcado. Genérico: não conhece caixa. */
  readonly selectedDate?: string | null;
  /** Opcional. O componente continua genérico: não conhece caixa nem categoria. */
  readonly onPointSelect?: (point: SparklinePointSelection) => void;
};

export type SparklinePointSelection = {
  readonly date: string;
  readonly amount: string;
  readonly index: number;
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
  selectedDate = null,
  onPointSelect,
}: SparklineProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const plotRef = useRef<HTMLDivElement>(null);
  const ignoreClickAfterTouchRef = useRef(false);

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
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && onPointSelect && activeIndex >= 0) {
        event.preventDefault();
        const point = points[activeIndex];
        if (point) {
          onPointSelect({ date: point.date, amount: point.amount, index: activeIndex });
        }
      }
    },
    [activeIndex, interactive, onPointSelect, points],
  );

  const selectFromClientX = useCallback(
    (clientX: number, width: number, left: number) => {
      if (!onPointSelect || !interactive || width <= 0) {
        return;
      }
      const index = indexFromRatio((clientX - left) / width, points.length);
      const point = points[index];
      if (!point) {
        return;
      }
      onPointSelect({ date: point.date, amount: point.amount, index });
    },
    [interactive, onPointSelect, points],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (ignoreClickAfterTouchRef.current) {
        ignoreClickAfterTouchRef.current = false;
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      selectFromClientX(event.clientX, rect.width, rect.left);
    },
    [selectFromClientX],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      ignoreClickAfterTouchRef.current = true;
      const rect = event.currentTarget.getBoundingClientRect();
      selectFromClientX(touch.clientX, rect.width, rect.left);
    },
    [selectFromClientX],
  );

  const lineRef = useRef<SVGPolylineElement>(null);
  const flat = isFlatSeries(points);
  const presentation = useDashboardPresentation('sparkline', !flat);

  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line || !presentation.present) {
      return;
    }
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      clearSparklineDraw(line);
      return;
    }
    const length = readSparklinePathLength(line);
    if (length === null) {
      return;
    }
    const delay = sparklineDrawDelayMs(presentation.index);
    applySparklineDrawStart(line, length);
    line.getBoundingClientRect();
    applySparklineDrawPlay(line, delay);

    let settled = false;
    let timer = 0;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      line.removeEventListener('transitionend', onTransitionEnd);
      clearSparklineDraw(line);
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (!isSparklineStrokeTransitionEnd(event, line)) {
        return;
      }
      finish();
    };
    line.addEventListener('transitionend', onTransitionEnd);
    timer = window.setTimeout(finish, SPARKLINE_DRAW_DURATION_MS + delay);
    return () => {
      settled = true;
      window.clearTimeout(timer);
      line.removeEventListener('transitionend', onTransitionEnd);
      clearSparklineDraw(line);
    };
  }, [presentation.index, presentation.present]);
  const style = {
    '--sparkline-color': `var(${colorVar})`,
    '--present-index': presentation.index,
  } as CSSProperties;

  if (flat) {
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
  const selectedIndex =
    selectedDate === null ? -1 : points.findIndex((point) => point.date === selectedDate);
  const selectedPoint = selectedIndex >= 0 ? geometry[selectedIndex] : undefined;
  const hoverDiffersFromSelection = activeIndex >= 0 && activeIndex !== selectedIndex;

  return (
    <div
      ref={plotRef}
      className={cx(
        styles.root,
        interactive && styles.interactive,
        onPointSelect && styles.selectable,
        className,
      )}
      style={style}
      data-reveal={presentation.present ? 'true' : undefined}
      role="img"
      aria-label={
        onPointSelect
          ? `${ariaLabel}. Use as setas para escolher o dia e Enter ou Espaço para ver os lançamentos.`
          : ariaLabel
      }
      tabIndex={interactive ? 0 : undefined}
      onMouseMove={handleMove}
      onMouseLeave={interactive ? () => setActiveIndex(-1) : undefined}
      onFocus={interactive ? () => setActiveIndex(points.length - 1) : undefined}
      onBlur={interactive ? () => setActiveIndex(-1) : undefined}
      onKeyDown={handleKeyDown}
      onClick={onPointSelect ? handleClick : undefined}
      onTouchEnd={onPointSelect ? handleTouchEnd : undefined}
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
          ref={lineRef}
          className={styles.line}
          points={toPolyline(geometry)}
          vectorEffect="non-scaling-stroke"
        />
        {selectedPoint ? (
          <g data-sparkline-selected="true">
            <line
              className={styles.selectedMarker}
              x1={selectedPoint.x}
              y1={0}
              x2={selectedPoint.x}
              y2={VIEW_HEIGHT}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className={styles.selectedDot}
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={3.25}
            />
          </g>
        ) : null}
        {activePoint && hoverDiffersFromSelection ? (
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
        {activePoint && !selectedPoint ? (
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
          {valueCaption ? <span className={styles.tooltipCaption}>{valueCaption}</span> : null}
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
