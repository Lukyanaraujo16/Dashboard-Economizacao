'use client';

import { useId, type CSSProperties } from 'react';

import { cx } from '../../ui/utils/cx';
import { decimalRatio } from './chart-math';
import styles from './ratio-meter.module.css';

export type RatioMeterProps = {
  /** Razão já resolvida (0–1). Prevalece sobre `filled`/`total`. */
  readonly ratio?: number;
  /** Parte, em decimal-string do backend. */
  readonly filled?: string;
  /** Total, em decimal-string do backend. */
  readonly total?: string;
  /** Nome da variável CSS da série (ex.: `--color-series-received`). */
  readonly colorVar?: string;
  readonly label?: string;
  readonly className?: string;
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function resolveRatio(props: RatioMeterProps): number {
  if (props.ratio !== undefined) {
    return clampRatio(props.ratio);
  }
  if (props.filled !== undefined && props.total !== undefined) {
    return decimalRatio(props.filled, props.total);
  }
  return 0;
}

/**
 * Microvisualização de proporção para KPIs sem série diária.
 * Densidade equivalente à Sparkline; a leitura do valor não depende dela.
 */
export function RatioMeter(props: RatioMeterProps) {
  const { colorVar = '--color-series-received', label, className } = props;
  const ratio = resolveRatio(props);
  const labelId = useId();
  const style = { '--ratio-color': `var(${colorVar})` } as CSSProperties;

  return (
    <div className={cx(styles.root, className)} style={style}>
      <div
        className={styles.track}
        role="img"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Proporção em relação ao total da competência'}
      >
        <div className={styles.fill} style={{ inlineSize: `${ratio * 100}%` }} aria-hidden="true" />
      </div>
      {label ? (
        <p id={labelId} className={styles.label}>
          {label}
        </p>
      ) : null}
    </div>
  );
}
