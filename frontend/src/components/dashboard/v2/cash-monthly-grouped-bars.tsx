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
import { monthShortLabelPtBr } from '../../../lib/dashboard-month';
import { cx } from '../../ui/utils/cx';
import {
  allForecastBucketsZero,
  decimalAbsScaled,
  formatMonthKeyPtBr,
  maxInflowOutflowScale,
  visualBarPercent,
} from '../dashboard-forecast-view';
import { maxAbs, parseAmount } from './chart-math';
import { anchorRatioFromIndex } from './chart-tooltip-placement';
import { ChartTooltip } from './chart-tooltip';
import styles from './cash-monthly-grouped-bars.module.css';

export type CashMonthlyGroupedBarsBucket = {
  readonly monthKey: string;
  /** null = cost-center unavailable — tooltip mostra "—", nunca R$ 0,00 inventado. */
  readonly inflows: string | null;
  readonly outflows: string | null;
  readonly result: string | null;
};

export type CashMonthlyGroupedBarsProps = {
  readonly buckets: readonly CashMonthlyGroupedBarsBucket[];
  readonly ariaLabel?: string;
  readonly caption?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
  /** Saldo final por monthKey (08-C4). Ausência = sem linha. */
  readonly balanceByMonthKey?: ReadonlyMap<string, string>;
  readonly balanceLabel?: string;
  readonly balanceCoverageNote?: string | null;
};

/** OUT/25 — eixo denso e título do tooltip. */
function axisMonthLabel(monthKey: string): string {
  const short = monthShortLabelPtBr(monthKey).toUpperCase();
  const year = monthKey.slice(2, 4);
  return `${short}/${year}`;
}

function moneyOrDash(value: string | null): string {
  return value === null ? '—' : formatMoneyBrl(value);
}

function barAmount(value: string | null): string {
  return value ?? '0';
}

function toForecastShape(buckets: readonly CashMonthlyGroupedBarsBucket[]) {
  return buckets.map((bucket) => ({
    key: bucket.monthKey,
    inflows: barAmount(bucket.inflows),
    outflows: barAmount(bucket.outflows),
    net: barAmount(bucket.result),
  }));
}

type BalanceGeom = {
  readonly points: readonly { readonly index: number; readonly xPct: number; readonly yPct: number }[];
  readonly segments: readonly string[];
};

function monthlyBalanceGeometry(
  buckets: readonly CashMonthlyGroupedBarsBucket[],
  balanceByMonthKey: ReadonlyMap<string, string>,
): BalanceGeom {
  const count = buckets.length;
  const values = buckets.map((bucket) => {
    const raw = balanceByMonthKey.get(bucket.monthKey);
    return raw === undefined ? null : parseAmount(raw);
  });
  const present = values.filter((value): value is number => value !== null);
  const scale = maxAbs(present);
  const points: BalanceGeom['points'][number][] = [];
  for (let index = 0; index < count; index += 1) {
    const value = values[index];
    if (value === null || value === undefined) {
      continue;
    }
    const ratio = scale > 0 ? Math.min(Math.max(value / scale, 0), 1) : 0;
    const xPct = ((index + 0.5) / count) * 100;
    const yPct = (1 - ratio) * 100;
    points.push({ index, xPct, yPct });
  }
  const segments: string[] = [];
  let run: typeof points = [];
  const flush = () => {
    if (run.length >= 2) {
      segments.push(run.map((point) => `${point.xPct},${point.yPct}`).join(' '));
    }
    run = [];
  };
  for (const point of points) {
    const prev = run[run.length - 1];
    if (prev && point.index !== prev.index + 1) {
      flush();
    }
    run.push(point);
  }
  flush();
  return { points, segments };
}

/**
 * Barras agrupadas Entradas|Saídas por mês civil (Correção 08-B).
 * Linha de saldo bancário final (08-C4) sobreposta com eixo independente.
 * Tooltip flutuante (floating-top) via ChartTooltip — sem lane permanente.
 */
export function CashMonthlyGroupedBars({
  buckets,
  ariaLabel,
  caption = 'Entradas e saídas realizadas por mês de baixa',
  emptyMessage = 'Sem movimentação de caixa realizada na janela.',
  className,
  balanceByMonthKey,
  balanceLabel = 'Saldo bancário',
  balanceCoverageNote = null,
}: CashMonthlyGroupedBarsProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const forecastBuckets = toForecastShape(buckets);
  const count = buckets.length;
  const showBalance = balanceByMonthKey !== undefined && balanceByMonthKey.size > 0;

  const balanceGeom = useMemo(() => {
    if (!showBalance || !balanceByMonthKey) {
      return null;
    }
    return monthlyBalanceGeometry(buckets, balanceByMonthKey);
  }, [balanceByMonthKey, buckets, showBalance]);

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || count === 0) {
        return;
      }
      const ratio = (event.clientX - rect.left) / rect.width;
      const index = Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
      setActiveIndex(index);
    },
    [count],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const last = count - 1;
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
    [activeIndex, count],
  );

  if (buckets.length === 0 || allForecastBucketsZero(forecastBuckets)) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  const scale = maxInflowOutflowScale(forecastBuckets);
  const active = activeIndex >= 0 ? buckets[activeIndex] : undefined;
  const activeBalance =
    showBalance && active && balanceByMonthKey
      ? balanceByMonthKey.get(active.monthKey)
      : undefined;

  return (
    <div className={cx(styles.root, className)}>
      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.inflowSwatch)} aria-hidden="true" />
          Entradas
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.outflowSwatch)} aria-hidden="true" />
          Saídas
        </li>
        {showBalance ? (
          <li className={styles.legendItem}>
            <span className={cx(styles.swatch, styles.balanceSwatch)} aria-hidden="true" />
            {balanceLabel}
          </li>
        ) : null}
      </ul>

      <div
        ref={plotRef}
        className={styles.plot}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseMove={handleMove}
        onMouseLeave={() => setActiveIndex(-1)}
        onBlur={() => setActiveIndex(-1)}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.scroll}>
          <div className={styles.chartFrame}>
            <ul className={styles.chart}>
              {buckets.map((bucket, index) => {
                const activeBucket = index === activeIndex;
                return (
                  <li
                    key={bucket.monthKey}
                    className={styles.bucket}
                    data-active={activeBucket ? 'true' : undefined}
                    data-dimmed={activeIndex >= 0 && !activeBucket ? 'true' : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    aria-label={`${formatMonthKeyPtBr(bucket.monthKey)}: entradas ${moneyOrDash(
                      bucket.inflows,
                    )}, saídas ${moneyOrDash(bucket.outflows)}, resultado ${moneyOrDash(
                      bucket.result,
                    )}${
                      showBalance
                        ? `, saldo final ${
                            balanceByMonthKey?.get(bucket.monthKey) !== undefined
                              ? formatMoneyBrl(balanceByMonthKey.get(bucket.monthKey)!)
                              : '—'
                          }`
                        : ''
                    }`}
                  >
                    <div className={styles.bars}>
                      <span className={styles.barTrack}>
                        <span
                          className={cx(styles.bar, styles.inflowBar)}
                          style={{
                            height:
                              decimalAbsScaled(barAmount(bucket.inflows)) === 0n
                                ? '0%'
                                : `${visualBarPercent(barAmount(bucket.inflows), scale)}%`,
                          }}
                        />
                      </span>
                      <span className={styles.barTrack}>
                        <span
                          className={cx(styles.bar, styles.outflowBar)}
                          style={{
                            height:
                              decimalAbsScaled(barAmount(bucket.outflows)) === 0n
                                ? '0%'
                                : `${visualBarPercent(barAmount(bucket.outflows), scale)}%`,
                          }}
                        />
                      </span>
                    </div>
                    <p className={styles.month}>{axisMonthLabel(bucket.monthKey)}</p>
                  </li>
                );
              })}
            </ul>

            {balanceGeom ? (
              <svg
                className={styles.balanceOverlay}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                {balanceGeom.segments.map((points) => (
                  <polyline
                    key={points}
                    className={styles.balanceLine}
                    points={points}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {balanceGeom.points.map((point) => (
                  <circle
                    key={`mb-${point.index}`}
                    className={styles.balanceDot}
                    cx={point.xPct}
                    cy={point.yPct}
                    r={balanceGeom.points.length === 1 ? 1.8 : 1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            ) : null}
          </div>
        </div>

        {active ? (
          <ChartTooltip
            open
            verticalMode="floating-top"
            anchorRatio={anchorRatioFromIndex(activeIndex, count)}
            containerRef={plotRef}
            className={styles.tooltip}
            role="tooltip"
            aria-hidden="true"
          >
            <p className={styles.tooltipMonth}>{axisMonthLabel(active.monthKey)}</p>
            <p className={styles.tooltipRow}>
              <span className={cx(styles.swatch, styles.inflowSwatch)} aria-hidden="true" />
              Entradas
              <span className={styles.tooltipValue}>{moneyOrDash(active.inflows)}</span>
            </p>
            <p className={styles.tooltipRow}>
              <span className={cx(styles.swatch, styles.outflowSwatch)} aria-hidden="true" />
              Saídas
              <span className={styles.tooltipValue}>{moneyOrDash(active.outflows)}</span>
            </p>
            <p className={styles.tooltipRow}>
              Resultado
              <span className={styles.tooltipValue}>{moneyOrDash(active.result)}</span>
            </p>
            {showBalance ? (
              <p className={styles.tooltipRow}>
                <span className={cx(styles.swatch, styles.balanceSwatch)} aria-hidden="true" />
                Saldo final
                <span className={styles.tooltipValue}>
                  {activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}
                </span>
              </p>
            ) : null}
          </ChartTooltip>
        ) : null}
      </div>

      {balanceCoverageNote ? <p className={styles.coverageNote}>{balanceCoverageNote}</p> : null}

      {caption ? <p className={styles.caption}>{caption}</p> : null}

      <span className={styles.liveRegion} aria-live="polite">
        {active
          ? `${axisMonthLabel(active.monthKey)}: entradas ${moneyOrDash(active.inflows)}, saídas ${moneyOrDash(active.outflows)}, resultado ${moneyOrDash(active.result)}${
              showBalance
                ? `, saldo final ${activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}`
                : ''
            }`
          : ''}
      </span>
    </div>
  );
}
