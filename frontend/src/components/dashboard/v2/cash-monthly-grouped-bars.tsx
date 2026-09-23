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
import { dailyBalanceBandGeometry } from './daily-balance-band-geometry';
import { anchorRatioFromIndex } from './chart-tooltip-placement';
import { ChartTooltip } from './chart-tooltip';
import styles from './cash-monthly-grouped-bars.module.css';

const PROJECTED_BAND_WIDTH = 100;
const PROJECTED_BAND_HEIGHT = 52;
const PROJECTED_BAND_PAD = 6;

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
  readonly balanceTooltipLabel?: string;
  readonly balanceBaseNote?: string | null;
  readonly balanceCoverageNote?: string | null;
  /** `signed` permite saldo negativo na linha (projeção). Realizado permanece unsigned. */
  readonly balanceScale?: 'unsigned' | 'signed';
  /**
   * `overlay` = linha sobre as barras (legado).
   * `band` = faixa própria abaixo das barras (Mensal Realizado e Previsto).
   */
  readonly balanceLayout?: 'overlay' | 'band';
  /** Labels das séries (default = realizado 08-B). */
  readonly inflowLabel?: string;
  readonly outflowLabel?: string;
  readonly resultLabel?: string;
  readonly includeResultInTooltip?: boolean;
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

export function signedBalancePlotRatio(value: number, present: readonly number[]): number {
  const min = Math.min(0, ...present);
  const max = Math.max(0, ...present);
  const span = max - min;
  if (span <= 0) {
    return 0.5;
  }
  const raw = (value - min) / span;
  const pad = 0.08;
  return pad + raw * (1 - 2 * pad);
}

function monthlyBalanceGeometry(
  buckets: readonly CashMonthlyGroupedBarsBucket[],
  balanceByMonthKey: ReadonlyMap<string, string>,
  scaleMode: 'unsigned' | 'signed',
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
    const ratio =
      scaleMode === 'signed'
        ? signedBalancePlotRatio(value, present)
        : scale > 0
          ? Math.min(Math.max(value / scale, 0), 1)
          : 0;
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
  balanceTooltipLabel = 'Saldo final',
  balanceBaseNote = null,
  balanceCoverageNote = null,
  balanceScale = 'unsigned',
  balanceLayout = 'overlay',
  inflowLabel = 'Entradas',
  outflowLabel = 'Saídas',
  resultLabel = 'Resultado',
  includeResultInTooltip = true,
}: CashMonthlyGroupedBarsProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverZone, setHoverZone] = useState<'bars' | 'balance'>('bars');

  const forecastBuckets = toForecastShape(buckets);
  const count = buckets.length;
  const showBalance = balanceByMonthKey !== undefined && balanceByMonthKey.size > 0;
  const showBalanceBand = showBalance && balanceLayout === 'band';
  const showBalanceOverlay = showBalance && balanceLayout === 'overlay';

  const balanceGeom = useMemo(() => {
    if (!showBalanceOverlay || !balanceByMonthKey) {
      return null;
    }
    return monthlyBalanceGeometry(buckets, balanceByMonthKey, balanceScale);
  }, [balanceByMonthKey, balanceScale, buckets, showBalanceOverlay]);

  const projectedBand = useMemo(() => {
    if (!showBalanceBand || !balanceByMonthKey || count === 0) {
      return null;
    }
    return dailyBalanceBandGeometry(
      buckets.map((bucket) => bucket.monthKey),
      balanceByMonthKey,
      PROJECTED_BAND_WIDTH / count,
      {
        width: PROJECTED_BAND_WIDTH,
        height: PROJECTED_BAND_HEIGHT,
        pad: PROJECTED_BAND_PAD,
      },
    );
  }, [balanceByMonthKey, buckets, count, showBalanceBand]);

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
  const showOverlayTooltip = showBalanceOverlay && showBalance;
  const showBandBalanceTooltip = showBalanceBand && hoverZone === 'balance';
  const showBandBarsTooltip = !showBalanceBand || hoverZone === 'bars';

  return (
    <div className={cx(styles.root, className)} data-balance-layout={balanceLayout}>
      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.inflowSwatch)} aria-hidden="true" />
          {inflowLabel}
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.outflowSwatch)} aria-hidden="true" />
          {outflowLabel}
        </li>
        {showBalanceOverlay ? (
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
        onMouseMove={
          showBalanceBand
            ? undefined
            : (event) => {
                setHoverZone('bars');
                handleMove(event);
              }
        }
        onMouseLeave={() => setActiveIndex(-1)}
        onBlur={() => setActiveIndex(-1)}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.scroll}>
          <div className={styles.alignedStack}>
          <div
            className={styles.chartFrame}
            data-monthly-bars-plot=""
            onMouseMove={(event) => {
              setHoverZone('bars');
              handleMove(event);
            }}
          >
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
                    aria-label={`${formatMonthKeyPtBr(bucket.monthKey)}: ${inflowLabel.toLowerCase()} ${moneyOrDash(
                      bucket.inflows,
                    )}, ${outflowLabel.toLowerCase()} ${moneyOrDash(bucket.outflows)}, ${resultLabel.toLowerCase()} ${moneyOrDash(
                      bucket.result,
                    )}${
                      showBalanceOverlay
                        ? `, ${balanceTooltipLabel.toLowerCase()} ${
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

            {showBalanceOverlay && balanceGeom ? (
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

            {showBalanceBand && projectedBand ? (
              <div className={styles.balanceBand} data-projected-balance-band="">
                <p className={styles.balanceBandLabel}>{balanceLabel}</p>
                <div
                  className={styles.balancePlot}
                  onMouseMove={(event) => {
                    setHoverZone('balance');
                    handleMove(event);
                  }}
                >
                  <svg
                    className={styles.balanceBandSvg}
                    viewBox={`0 0 ${PROJECTED_BAND_WIDTH} ${PROJECTED_BAND_HEIGHT}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <line
                      className={styles.balanceZeroLine}
                      x1={0}
                      y1={projectedBand.zeroY}
                      x2={PROJECTED_BAND_WIDTH}
                      y2={projectedBand.zeroY}
                      vectorEffect="non-scaling-stroke"
                    />
                    {projectedBand.areas.map((d) => (
                      <path key={d} className={styles.balanceArea} d={d} />
                    ))}
                    {projectedBand.segments.map((points) => (
                      <polyline
                        key={points}
                        className={styles.balanceLine}
                        points={points}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {projectedBand.points.map((point) => (
                      <circle
                        key={`pb-${point.index}`}
                        className={styles.balanceDot}
                        cx={point.x}
                        cy={point.y}
                        r={projectedBand.points.length === 1 ? 2.2 : 1.6}
                        data-month-key={buckets[point.index]?.monthKey}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {active && (showBandBarsTooltip || showOverlayTooltip || showBandBalanceTooltip) ? (
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
            {showBandBarsTooltip ? (
              <>
                <p className={styles.tooltipRow}>
                  <span className={cx(styles.swatch, styles.inflowSwatch)} aria-hidden="true" />
                  {inflowLabel}
                  <span className={styles.tooltipValue}>{moneyOrDash(active.inflows)}</span>
                </p>
                <p className={styles.tooltipRow}>
                  <span className={cx(styles.swatch, styles.outflowSwatch)} aria-hidden="true" />
                  {outflowLabel}
                  <span className={styles.tooltipValue}>{moneyOrDash(active.outflows)}</span>
                </p>
                {includeResultInTooltip ? (
                  <p className={styles.tooltipRow}>
                    {resultLabel}
                    <span className={styles.tooltipValue}>{moneyOrDash(active.result)}</span>
                  </p>
                ) : null}
              </>
            ) : null}
            {showOverlayTooltip || showBandBalanceTooltip ? (
              <p className={styles.tooltipRow}>
                <span className={cx(styles.swatch, styles.balanceSwatch)} aria-hidden="true" />
                {balanceTooltipLabel}
                <span
                  className={cx(
                    styles.tooltipValue,
                    activeBalance !== undefined && parseAmount(activeBalance) < 0
                      ? styles.tooltipValueNegative
                      : undefined,
                  )}
                >
                  {activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}
                </span>
              </p>
            ) : null}
            {showOverlayTooltip || showBandBalanceTooltip
              ? balanceBaseNote && <p className={styles.tooltipCaption}>{balanceBaseNote}</p>
              : null}
          </ChartTooltip>
        ) : null}
      </div>

      {balanceCoverageNote ? <p className={styles.coverageNote}>{balanceCoverageNote}</p> : null}

      {caption ? <p className={styles.caption}>{caption}</p> : null}

      <span className={styles.liveRegion} aria-live="polite">
        {active
          ? `${axisMonthLabel(active.monthKey)}: ${inflowLabel.toLowerCase()} ${moneyOrDash(active.inflows)}, ${outflowLabel.toLowerCase()} ${moneyOrDash(active.outflows)}, ${resultLabel.toLowerCase()} ${moneyOrDash(active.result)}${
              showBalance
                ? `, ${balanceTooltipLabel.toLowerCase()} ${activeBalance !== undefined ? formatMoneyBrl(activeBalance) : '—'}`
                : ''
            }`
          : ''}
      </span>
    </div>
  );
}
