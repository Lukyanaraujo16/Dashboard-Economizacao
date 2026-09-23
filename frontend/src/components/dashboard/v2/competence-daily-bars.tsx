'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import { formatMonthKeyPtBr } from '../dashboard-forecast-view';
import {
  alignDailySeries,
  amountValues,
  formatCompactBrl,
  formatDayPt,
  indexFromSlotRatio,
  isFlatSeries,
  maxAbs,
  type DailyPoint,
} from './chart-math';
import { anchorRatioFromIndex } from './chart-tooltip-placement';
import { ChartTooltip } from './chart-tooltip';
import {
  BALANCE_BAND_HEIGHT,
  BALANCE_BAND_WIDTH,
  dailyBalanceBandGeometry,
} from './daily-balance-band-geometry';
import styles from './competence-daily-bars.module.css';

const VIEW_WIDTH = 320;
const HALF_HEIGHT = 56;
const VIEW_HEIGHT = HALF_HEIGHT * 2;
const MIN_BAR = 1;
const BAR_GAP_RATIO = 0.35;

export type CompetenceDailyBarsProps = {
  /** Dia = competenceDate; Σ total do dia. */
  readonly revenueDaily: readonly DailyPoint[];
  readonly expenseDaily: readonly DailyPoint[];
  readonly monthKey: string;
  /** Rótulos das séries; sobrescreva quando a leitura não for competência. */
  readonly revenueLabel?: string;
  readonly expenseLabel?: string;
  readonly ariaLabel?: string;
  readonly caption?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
  /**
   * Saldo bancário por data (08-C3). Ausência = sem linha.
   * Valores oficiais do endpoint; nunca inventar zero.
   */
  readonly balanceByDate?: ReadonlyMap<string, string>;
  readonly balanceLabel?: string;
  /** Copy discreta de cobertura parcial (ex.: disponível a partir de …). */
  readonly balanceCoverageNote?: string | null;
};

/** Altura da barra em unidades do viewBox; mantém visível qualquer dia com valor. */
function barHeight(value: number, scale: number): number {
  if (scale <= 0) {
    return 0;
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return 0;
  }
  return Math.max(MIN_BAR, (abs / scale) * HALF_HEIGHT);
}

/**
 * Movimentação diária em barras espelhadas — primeira série acima do eixo,
 * segunda abaixo. Rotulagem padrão é competência; caixa sobrescreve os rótulos.
 * Saldo bancário (08-C3) ocupa faixa vertical própria, com zero financeiro.
 */
export function CompetenceDailyBars({
  revenueDaily,
  expenseDaily,
  monthKey,
  revenueLabel = 'Receitas',
  expenseLabel = 'Despesas',
  ariaLabel,
  caption,
  emptyMessage,
  className,
  balanceByDate,
  balanceLabel = 'Saldo bancário',
  balanceCoverageNote = null,
}: CompetenceDailyBarsProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const plotRef = useRef<HTMLDivElement>(null);
  const barsPlotRef = useRef<HTMLDivElement>(null);

  const series = useMemo(() => {
    const aligned = alignDailySeries(revenueDaily, expenseDaily);
    const revenueValues = amountValues(aligned.first);
    const expenseValues = amountValues(aligned.second);
    return {
      dates: aligned.dates,
      revenue: aligned.first,
      expense: aligned.second,
      revenueValues,
      expenseValues,
      scale: maxAbs([...revenueValues, ...expenseValues]),
    };
  }, [expenseDaily, revenueDaily]);

  const count = series.dates.length;
  const slot = count > 0 ? VIEW_WIDTH / count : VIEW_WIDTH;

  const balance = useMemo(() => {
    if (!balanceByDate || balanceByDate.size === 0) {
      return null;
    }
    return dailyBalanceBandGeometry(series.dates, balanceByDate, slot);
  }, [balanceByDate, series.dates, slot]);

  const hasBalanceSeries = Boolean(balanceByDate && balanceByDate.size > 0);
  const showBalanceBand = balance !== null;

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const plot = barsPlotRef.current;
      if (!plot) {
        return;
      }
      const rect = plot.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      const localX = event.clientX - rect.left;
      if (localX < 0 || localX > rect.width) {
        setActiveIndex(-1);
        return;
      }
      setActiveIndex(indexFromSlotRatio(localX / rect.width, series.dates.length));
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
        <p className={styles.empty}>
          {emptyMessage ?? `Sem lançamentos diários na competência de ${monthLabel}.`}
        </p>
      </div>
    );
  }

  const barWidth = Math.max(slot * (1 - BAR_GAP_RATIO), 0.5);
  const activeRevenue = activeIndex >= 0 ? series.revenue[activeIndex] : undefined;
  const activeExpense = activeIndex >= 0 ? series.expense[activeIndex] : undefined;
  const activeDate = activeRevenue?.date;
  const activeBalance =
    hasBalanceSeries && activeDate && balanceByDate ? balanceByDate.get(activeDate) : undefined;
  const activeBalancePoint =
    showBalanceBand && balance
      ? balance.points.find((point) => point.index === activeIndex)
      : undefined;
  const firstDate = series.dates[0];
  const lastDate = series.dates[count - 1];

  return (
    <div className={cx(styles.root, className)}>
      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.revenueSwatch)} aria-hidden="true" />
          {revenueLabel}
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.expenseSwatch)} aria-hidden="true" />
          {expenseLabel}
        </li>
      </ul>

      <div
        ref={plotRef}
        className={styles.hitArea}
        role="img"
        aria-label={ariaLabel ?? `Receitas e despesas por dia de competência em ${monthLabel}`}
        tabIndex={0}
        onMouseMove={handleMove}
        onMouseLeave={() => setActiveIndex(-1)}
        onFocus={() => setActiveIndex(count - 1)}
        onBlur={() => setActiveIndex(-1)}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.plotArea}>
          <div className={styles.axis} aria-hidden="true">
            <span className={styles.axisTick}>{formatCompactBrl(series.scale)}</span>
            <span className={styles.axisTick}>{formatCompactBrl(0)}</span>
            <span className={styles.axisTick}>{formatCompactBrl(series.scale)}</span>
          </div>

          <div ref={barsPlotRef} className={styles.plot} data-daily-bars-plot="">
            <svg
              className={styles.canvas}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {series.dates.map((date, index) => {
                const x = index * slot + (slot - barWidth) / 2;
                const revenue = barHeight(series.revenueValues[index] ?? 0, series.scale);
                const expense = barHeight(series.expenseValues[index] ?? 0, series.scale);
                const active = index === activeIndex;
                return (
                  <g key={date} opacity={activeIndex < 0 || active ? 1 : 0.45}>
                    {revenue > 0 ? (
                      <rect
                        className={cx(styles.bar, styles.revenueBar)}
                        x={x}
                        y={HALF_HEIGHT - revenue}
                        width={barWidth}
                        height={revenue}
                      />
                    ) : null}
                    {expense > 0 ? (
                      <rect
                        className={cx(styles.bar, styles.expenseBar)}
                        x={x}
                        y={HALF_HEIGHT}
                        width={barWidth}
                        height={expense}
                      />
                    ) : null}
                  </g>
                );
              })}

              <line
                className={styles.zeroLine}
                x1={0}
                y1={HALF_HEIGHT}
                x2={VIEW_WIDTH}
                y2={HALF_HEIGHT}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        {showBalanceBand && balance ? (
          <div className={styles.balanceBand}>
            <p className={styles.balanceBandLabel}>{balanceLabel}</p>
            <div className={styles.balancePlotArea}>
              <div className={cx(styles.axis, styles.balanceAxis)} aria-hidden="true">
                <span className={styles.axisTick}>{formatCompactBrl(balance.maxDomain)}</span>
                {balance.minDomain < 0 && balance.maxDomain > 0 ? (
                  <span className={styles.axisTick}>{formatCompactBrl(0)}</span>
                ) : null}
                <span className={styles.axisTick}>{formatCompactBrl(balance.minDomain)}</span>
              </div>
              <div className={styles.balancePlot}>
                <svg
                  className={styles.canvas}
                  viewBox={`0 0 ${BALANCE_BAND_WIDTH} ${BALANCE_BAND_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line
                    className={styles.zeroLine}
                    x1={0}
                    y1={balance.zeroY}
                    x2={BALANCE_BAND_WIDTH}
                    y2={balance.zeroY}
                    vectorEffect="non-scaling-stroke"
                  />
                  {balance.areas.map((d) => (
                    <path key={d} className={styles.balanceArea} d={d} />
                  ))}
                  {balance.segments.map((points) => (
                    <polyline
                      key={points}
                      className={styles.balanceLine}
                      points={points}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {activeBalancePoint ? (
                    <circle
                      className={styles.balanceDot}
                      cx={activeBalancePoint.x}
                      cy={activeBalancePoint.y}
                      r={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : balance.points.length === 1 ? (
                    <circle
                      className={styles.balanceDot}
                      cx={balance.points[0]!.x}
                      cy={balance.points[0]!.y}
                      r={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </svg>
              </div>
            </div>
          </div>
        ) : null}

        {activeRevenue && activeExpense ? (
          <ChartTooltip
            open
            verticalMode="floating-top"
            anchorRatio={anchorRatioFromIndex(activeIndex, count)}
            containerRef={plotRef}
            className={styles.tooltip}
            role="tooltip"
            aria-hidden="true"
          >
            <p className={styles.tooltipDay}>{formatDayPt(activeRevenue.date)}</p>
            <p className={styles.tooltipRow}>
              <span className={cx(styles.swatch, styles.revenueSwatch)} />
              {revenueLabel}
              <span className={styles.tooltipValue}>{formatMoneyBrl(activeRevenue.amount)}</span>
            </p>
            <p className={styles.tooltipRow}>
              <span className={cx(styles.swatch, styles.expenseSwatch)} />
              {expenseLabel}
              <span className={styles.tooltipValue}>{formatMoneyBrl(activeExpense.amount)}</span>
            </p>
            {hasBalanceSeries ? (
              <p className={styles.tooltipRow}>
                <span className={cx(styles.swatch, styles.balanceSwatch)} />
                {balanceLabel}
                <span className={styles.tooltipValue}>
                  {activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}
                </span>
              </p>
            ) : null}
          </ChartTooltip>
        ) : null}
      </div>

      <div className={styles.xAxis} aria-hidden="true">
        <span>{firstDate ? formatDayPt(firstDate) : ''}</span>
        <span>{lastDate ? formatDayPt(lastDate) : ''}</span>
      </div>

      {balanceCoverageNote ? <p className={styles.coverageNote}>{balanceCoverageNote}</p> : null}

      <p className={styles.caption}>{caption ?? 'Competência · não é caixa.'}</p>

      <span className={styles.liveRegion} aria-live="polite">
        {activeRevenue && activeExpense
          ? `${formatDayPt(activeRevenue.date)}: ${revenueLabel.toLowerCase()} ${formatMoneyBrl(activeRevenue.amount)}, ${expenseLabel.toLowerCase()} ${formatMoneyBrl(activeExpense.amount)}${
              hasBalanceSeries
                ? `, ${balanceLabel.toLowerCase()} ${activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}`
                : ''
            }`
          : ''}
      </span>
    </div>
  );
}
