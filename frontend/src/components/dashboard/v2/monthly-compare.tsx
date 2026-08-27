'use client';

import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { formatDelinquencyRate, formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import { maxAbs, parseAmount, percentChangeRate, subtractDecimalStrings } from './chart-math';
import styles from './monthly-compare.module.css';

export type MonthlyCompareTone = 'revenue' | 'expense' | 'result';

/** Competência comparada, na ordem cronológica de leitura (mais antiga primeiro). */
export type MonthlyComparePeriod = {
  readonly id: string;
  /** Rótulo curto do mês (ex.: `AGO`). */
  readonly label: string;
};

export type MonthlyCompareRow = {
  readonly id: string;
  readonly label: string;
  readonly tone: MonthlyCompareTone;
  /** Totais por competência, em decimal-string do backend, na ordem de `periods`. */
  readonly amounts: readonly string[];
};

export type MonthlyCompareProps = {
  readonly periods: readonly MonthlyComparePeriod[];
  readonly rows: readonly MonthlyCompareRow[];
  readonly emptyMessage?: string;
  readonly className?: string;
};

type ActiveBar = {
  readonly rowId: string;
  readonly periodIndex: number;
};

const TONE_COLOR: Record<MonthlyCompareTone, string> = {
  revenue: '--color-series-revenue',
  expense: '--color-series-expense',
  result: '--color-series-result',
};

/** Zero no meio do desenho quando há valor negativo; na base quando não há. */
function baselinePercent(values: readonly number[]): number {
  return values.some((value) => value < 0) ? 50 : 0;
}

/** Altura e apoio da barra a partir do zero do eixo. */
function barStyle(amount: string, scale: number, baseline: number): CSSProperties {
  const value = parseAmount(amount);
  const magnitude = scale > 0 ? Math.min(Math.abs(value) / scale, 1) : 0;
  if (value < 0) {
    return {
      top: `${100 - baseline}%`,
      height: `${magnitude * baseline}%`,
    };
  }
  return {
    bottom: `${baseline}%`,
    height: `${magnitude * (100 - baseline)}%`,
  };
}

/** Direção da variação; `flat` quando a diferença é exatamente zero. */
function deltaDirection(delta: string): 'up' | 'down' | 'flat' {
  if (delta.startsWith('-')) {
    return 'down';
  }
  return /^0+(\.0+)?$/.test(delta) ? 'flat' : 'up';
}

/** JUL + id `2026-07` → `JUL/2026` para tooltip. */
export function periodContextLabel(period: MonthlyComparePeriod): string {
  const year = /^(\d{4})-\d{2}$/.exec(period.id)?.[1];
  return year ? `${period.label}/${year}` : period.label;
}

function summarizeRow(
  row: MonthlyCompareRow,
  periods: readonly MonthlyComparePeriod[],
): string {
  return periods
    .map((period, index) => {
      const amount = row.amounts[index] ?? '0.00';
      return `${periodContextLabel(period)} ${formatMoneyBrl(amount)}`;
    })
    .join('; ');
}

/**
 * Comparativo de competências em barras agrupadas — uma barra por mês em cada
 * métrica. Valores completos no tooltip (hover/teclado); eixo só com rótulo do mês.
 */
export function MonthlyCompare({
  periods,
  rows,
  emptyMessage = 'Sem competência no mês anterior para comparar.',
  className,
}: MonthlyCompareProps) {
  const liveId = useId();
  const [active, setActive] = useState<ActiveBar | null>(null);

  const clearActive = useCallback(() => setActive(null), []);

  const activateFromPointer = useCallback(
    (event: MouseEvent<HTMLDivElement>, rowId: string, count: number) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || count <= 0) {
        return;
      }
      const ratio = (event.clientX - rect.left) / rect.width;
      const periodIndex = Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
      setActive({ rowId, periodIndex });
    },
    [],
  );

  const handlePlotKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, rowId: string, count: number) => {
      if (count <= 0) {
        return;
      }
      const current =
        active?.rowId === rowId && active.periodIndex >= 0 ? active.periodIndex : count - 1;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        setActive({ rowId, periodIndex: Math.max(0, current - 1) });
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        setActive({ rowId, periodIndex: Math.min(count - 1, current + 1) });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setActive(null);
      }
    },
    [active],
  );

  if (rows.length === 0 || periods.length === 0) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  const latestIndex = periods.length - 1;
  const activeRow = active ? rows.find((row) => row.id === active.rowId) : undefined;
  const activePeriod = active ? periods[active.periodIndex] : undefined;
  const activeAmount =
    activeRow && active ? (activeRow.amounts[active.periodIndex] ?? '0.00') : null;
  const liveText =
    activeRow && activePeriod && activeAmount !== null
      ? `${periodContextLabel(activePeriod)}. ${activeRow.label}: ${formatMoneyBrl(activeAmount)}`
      : '';

  return (
    <div className={cx(styles.root, className)}>
      <ul className={styles.list}>
        {rows.map((row) => {
          const amounts = periods.map((_, index) => row.amounts[index] ?? '0.00');
          const values = amounts.map(parseAmount);
          const scale = maxAbs(values);
          const baseline = baselinePercent(values);
          const latest = amounts[latestIndex] ?? '0.00';
          const previous = amounts[latestIndex - 1] ?? '0.00';
          const delta = subtractDecimalStrings(latest, previous);
          const rate = percentChangeRate(latest, previous);
          const style = { '--compare-color': `var(${TONE_COLOR[row.tone]})` } as CSSProperties;
          const rowActive = active?.rowId === row.id;
          const activeIndex = rowActive ? (active?.periodIndex ?? -1) : -1;

          return (
            <li key={row.id} className={styles.row} style={style} data-tone={row.tone}>
              <div className={styles.rowHead}>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.delta} data-direction={deltaDirection(delta)}>
                  {formatMoneyBrl(delta)}
                  {rate !== null ? (
                    <span className={styles.rate}>{formatDelinquencyRate(rate)}</span>
                  ) : null}
                </span>
              </div>

              <div
                className={styles.plot}
                data-signed={baseline > 0 ? 'true' : undefined}
                data-active={rowActive ? 'true' : undefined}
                role="img"
                tabIndex={0}
                aria-label={`${row.label}. ${summarizeRow(row, periods)}`}
                onMouseMove={(event) => activateFromPointer(event, row.id, periods.length)}
                onMouseLeave={clearActive}
                onFocus={() => setActive({ rowId: row.id, periodIndex: latestIndex })}
                onBlur={clearActive}
                onKeyDown={(event) => handlePlotKeyDown(event, row.id, periods.length)}
              >
                <span
                  className={styles.baseline}
                  style={{ bottom: `${baseline}%` }}
                  aria-hidden="true"
                />
                {periods.map((period, index) => {
                  const amount = amounts[index] ?? '0.00';
                  const isActive = activeIndex === index;
                  const dimmed = rowActive && !isActive;
                  return (
                    <span
                      key={period.id}
                      className={cx(styles.slot, isActive && styles.slotActive)}
                      data-active={isActive ? 'true' : undefined}
                      data-dimmed={dimmed ? 'true' : undefined}
                    >
                      <span
                        className={cx(
                          styles.bar,
                          index === latestIndex ? styles.latestBar : styles.pastBar,
                        )}
                        style={barStyle(amount, scale, baseline)}
                        aria-hidden="true"
                      />
                    </span>
                  );
                })}

                {rowActive && activePeriod && activeAmount !== null ? (
                  <div className={styles.tooltip} role="tooltip" aria-hidden="true">
                    <p className={styles.tooltipPeriod}>{periodContextLabel(activePeriod)}</p>
                    <p className={styles.tooltipMetric}>{row.label}</p>
                    <p className={styles.tooltipValue}>{formatMoneyBrl(activeAmount)}</p>
                  </div>
                ) : null}
              </div>

              <dl className={styles.axis} aria-hidden="true">
                {periods.map((period, index) => (
                  <div key={period.id} className={styles.tick}>
                    <dt
                      className={cx(
                        styles.month,
                        index === latestIndex ? undefined : styles.pastMonth,
                      )}
                    >
                      {period.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>

      <p className={styles.caption}>
        Comparação dos movimentos realizados entre os meses.
      </p>
      <span id={liveId} className={styles.liveRegion} aria-live="polite">
        {liveText}
      </span>
    </div>
  );
}
