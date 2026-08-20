'use client';

import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import { formatMonthKeyPtBr } from '../dashboard-forecast-view';
import {
  accumulate,
  alignDailySeries,
  amountValues,
  buildSvgPoints,
  formatCompactBrl,
  formatDayPt,
  indexFromRatio,
  isFlatSeries,
  maxAbs,
  toAreaPath,
  toPolyline,
  type DailyPoint,
} from './chart-math';
import styles from './competence-comparison-chart.module.css';

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 140;
const VERTICAL_PADDING = 6;
const AXIS_TICK_RATIOS = [1, 0.5, 0] as const;

export type CompetenceComparisonChartProps = {
  /** Dia = competenceDate; Σ total do dia. */
  readonly revenueDaily: readonly DailyPoint[];
  readonly expenseDaily: readonly DailyPoint[];
  readonly monthKey: string;
  readonly className?: string;
};

/** Receitas × despesas acumuladas na competência do mês — apresentação, não caixa. */
export function CompetenceComparisonChart({
  revenueDaily,
  expenseDaily,
  monthKey,
  className,
}: CompetenceComparisonChartProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const series = useMemo(() => {
    const aligned = alignDailySeries(revenueDaily, expenseDaily);
    const revenue = accumulate(aligned.first);
    const expense = accumulate(aligned.second);
    const scale = maxAbs([...amountValues(revenue), ...amountValues(expense)]);
    const options = {
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      padding: VERTICAL_PADDING,
      max: scale,
    };
    return {
      dates: aligned.dates,
      revenue,
      expense,
      scale,
      revenueGeometry: buildSvgPoints(amountValues(revenue), options),
      expenseGeometry: buildSvgPoints(amountValues(expense), options),
    };
  }, [expenseDaily, revenueDaily]);

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      setActiveIndex(indexFromRatio((event.clientX - rect.left) / rect.width, series.dates.length));
    },
    [series.dates.length],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const last = series.dates.length - 1;
      if (last < 0) {
        return;
      }
      const current = activeIndex < 0 ? last : activeIndex;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex(Math.max(0, current - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex(Math.min(last, current + 1));
      }
    },
    [activeIndex, series.dates.length],
  );

  const monthLabel = formatMonthKeyPtBr(monthKey);

  if (isFlatSeries(revenueDaily) && isFlatSeries(expenseDaily)) {
    return (
      <div className={cx(styles.root, className)}>
        <p className={styles.empty}>Sem receitas ou despesas na competência de {monthLabel}.</p>
      </div>
    );
  }

  const activeRevenue = activeIndex >= 0 ? series.revenue[activeIndex] : undefined;
  const activeExpense = activeIndex >= 0 ? series.expense[activeIndex] : undefined;
  const activePoint = activeIndex >= 0 ? series.revenueGeometry[activeIndex] : undefined;
  const firstDate = series.dates[0];
  const lastDate = series.dates[series.dates.length - 1];

  return (
    <div className={cx(styles.root, className)}>
      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.revenueSwatch)} aria-hidden="true" />
          Receitas
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.expenseSwatch)} aria-hidden="true" />
          Despesas
        </li>
      </ul>

      <div className={styles.plotArea}>
        <div className={styles.axis} aria-hidden="true">
          {AXIS_TICK_RATIOS.map((ratio) => (
            <span key={ratio} className={styles.axisTick}>
              {formatCompactBrl(series.scale * ratio)}
            </span>
          ))}
        </div>

        <div
          className={styles.plot}
          role="img"
          aria-label={`Receitas e despesas acumuladas por competência em ${monthLabel}`}
          tabIndex={0}
          onMouseMove={handleMove}
          onMouseLeave={() => setActiveIndex(-1)}
          onFocus={() => setActiveIndex(series.dates.length - 1)}
          onBlur={() => setActiveIndex(-1)}
          onKeyDown={handleKeyDown}
        >
          <svg
            className={styles.canvas}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {AXIS_TICK_RATIOS.map((ratio) => {
              const y = VERTICAL_PADDING + (VIEW_HEIGHT - VERTICAL_PADDING * 2) * (1 - ratio);
              return (
                <line
                  key={`grid-${ratio}`}
                  className={styles.gridLine}
                  x1={0}
                  y1={y}
                  x2={VIEW_WIDTH}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            <path
              className={cx(styles.area, styles.revenueArea)}
              d={toAreaPath(series.revenueGeometry, VIEW_HEIGHT)}
            />
            <path
              className={cx(styles.area, styles.expenseArea)}
              d={toAreaPath(series.expenseGeometry, VIEW_HEIGHT)}
            />
            <polyline
              className={cx(styles.line, styles.revenueLine)}
              points={toPolyline(series.revenueGeometry)}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              className={cx(styles.line, styles.expenseLine)}
              points={toPolyline(series.expenseGeometry)}
              vectorEffect="non-scaling-stroke"
            />

            {activePoint ? (
              <line
                className={styles.marker}
                x1={activePoint.x}
                y1={0}
                x2={activePoint.x}
                y2={VIEW_HEIGHT}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {activeIndex >= 0 && series.revenueGeometry[activeIndex] ? (
              <circle
                className={cx(styles.dot, styles.revenueDot)}
                cx={series.revenueGeometry[activeIndex]?.x}
                cy={series.revenueGeometry[activeIndex]?.y}
                r={3}
              />
            ) : null}
            {activeIndex >= 0 && series.expenseGeometry[activeIndex] ? (
              <circle
                className={cx(styles.dot, styles.expenseDot)}
                cx={series.expenseGeometry[activeIndex]?.x}
                cy={series.expenseGeometry[activeIndex]?.y}
                r={3}
              />
            ) : null}
          </svg>

          {activePoint && activeRevenue && activeExpense ? (
            <div
              className={styles.tooltip}
              style={{ left: `${(activePoint.x / VIEW_WIDTH) * 100}%` }}
              aria-hidden="true"
            >
              <p className={styles.tooltipDay}>{formatDayPt(activeRevenue.date)}</p>
              <p className={styles.tooltipRow}>
                <span className={cx(styles.swatch, styles.revenueSwatch)} />
                Receitas
                <span className={styles.tooltipValue}>{formatMoneyBrl(activeRevenue.amount)}</span>
              </p>
              <p className={styles.tooltipRow}>
                <span className={cx(styles.swatch, styles.expenseSwatch)} />
                Despesas
                <span className={styles.tooltipValue}>{formatMoneyBrl(activeExpense.amount)}</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.xAxis} aria-hidden="true">
        <span>{firstDate ? formatDayPt(firstDate) : ''}</span>
        <span>{lastDate ? formatDayPt(lastDate) : ''}</span>
      </div>

      <p className={styles.caption}>
        Acumulado por competência no mês selecionado. Não representa saldo bancário.
      </p>

      <span className={styles.liveRegion} aria-live="polite">
        {activeRevenue && activeExpense
          ? `${formatDayPt(activeRevenue.date)}: receitas ${formatMoneyBrl(activeRevenue.amount)}, despesas ${formatMoneyBrl(activeExpense.amount)}`
          : ''}
      </span>
    </div>
  );
}
