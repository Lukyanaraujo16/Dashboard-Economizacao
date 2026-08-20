'use client';

import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import { cx } from '../ui/utils/cx';
import {
  CATEGORY_DONUT_COLORS,
  donutSlicePercentages,
  sliceIndexAtPercent,
  type CategoryDonutSlice,
} from './category-donut-view';
import styles from './category-donut.module.css';

/** Raio interno do furo em fração do raio externo — espelha o `inset` do CSS. */
const HOLE_RADIUS_RATIO = 0.5;

export type CategoryDonutChartProps = {
  readonly slices: readonly CategoryDonutSlice[];
  readonly ariaLabel: string;
  /** Total da competência exibido no furo do anel; use formato compacto. */
  readonly centerLabel?: string;
  readonly centerCaption?: string;
  /** Destaca fatia e legenda em conjunto no hover; leitura não depende do destaque. */
  readonly interactive?: boolean;
  /** `md` dá mais espaço ao total central nos cards dedicados. */
  readonly size?: 'sm' | 'md';
};

function sliceColor(index: number): string {
  return CATEGORY_DONUT_COLORS[index % CATEGORY_DONUT_COLORS.length] ?? 'var(--color-primary)';
}

function buildConicGradient(percents: readonly number[]): string {
  let cursor = 0;
  const stops = percents.map((percent, index) => {
    const start = cursor;
    cursor += percent;
    return `${sliceColor(index)} ${start}% ${cursor}%`;
  });
  if (stops.length === 0) {
    return 'conic-gradient(color-mix(in srgb, var(--color-border) 80%, transparent) 0% 100%)';
  }
  return `conic-gradient(${stops.join(', ')})`;
}

/** Anel externo que revela apenas a fatia destacada. */
function buildHaloGradient(percents: readonly number[], highlighted: number): string {
  let cursor = 0;
  const stops = percents.map((percent, index) => {
    const start = cursor;
    cursor += percent;
    const color = index === highlighted ? sliceColor(index) : 'transparent';
    return `${color} ${start}% ${cursor}%`;
  });
  if (stops.length === 0) {
    return 'conic-gradient(transparent 0% 100%)';
  }
  return `conic-gradient(${stops.join(', ')})`;
}

/** Ângulo do ponteiro em percentual do anel (0% no topo, sentido horário). */
function pointerPercent(offsetX: number, offsetY: number): number {
  const degrees = (Math.atan2(offsetX, -offsetY) * 180) / Math.PI;
  return (((degrees % 360) + 360) % 360) / 3.6;
}

/**
 * Donut + legenda. Não captura clique: o WidgetShell pai abre o detalhe.
 * Hover sincroniza arco ↔ legenda sem criar zona morta de hit-area.
 */
export function CategoryDonutChart({
  slices,
  ariaLabel,
  centerLabel,
  centerCaption,
  interactive = false,
  size = 'sm',
}: CategoryDonutChartProps) {
  const [highlighted, setHighlighted] = useState(-1);
  const percents = useMemo(() => donutSlicePercentages(slices), [slices]);
  const active = interactive && highlighted >= 0 && highlighted < slices.length;

  const handleDonutMove = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!interactive) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const radius = Math.min(rect.width, rect.height) / 2;
      if (radius <= 0) {
        return;
      }
      const offsetX = event.clientX - rect.left - rect.width / 2;
      const offsetY = event.clientY - rect.top - rect.height / 2;
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      if (distance > radius || distance < radius * HOLE_RADIUS_RATIO) {
        setHighlighted(-1);
        return;
      }
      setHighlighted(sliceIndexAtPercent(percents, pointerPercent(offsetX, offsetY)));
    },
    [interactive, percents],
  );

  return (
    <div className={styles.layout} data-size={size}>
      <div
        className={styles.donutWrap}
        data-size={size}
        onMouseMove={interactive ? handleDonutMove : undefined}
        onMouseLeave={interactive ? () => setHighlighted(-1) : undefined}
      >
        {active ? (
          <div
            className={styles.halo}
            style={{ background: buildHaloGradient(percents, highlighted) }}
            aria-hidden="true"
          />
        ) : null}
        <div
          className={styles.donut}
          style={{ background: buildConicGradient(percents) }}
          role="img"
          aria-label={ariaLabel}
        >
          <div className={styles.hole} aria-hidden="true">
            {centerLabel ? <span className={styles.centerLabel}>{centerLabel}</span> : null}
            {centerCaption ? <span className={styles.centerCaption}>{centerCaption}</span> : null}
          </div>
        </div>
      </div>
      <ul className={cx(styles.legend, active && styles.legendDimmed)}>
        {slices.map((slice, index) => (
          <li
            key={`${slice.kind}-${slice.name}`}
            className={cx(styles.legendRow, active && index === highlighted && styles.legendActive)}
            onMouseEnter={interactive ? () => setHighlighted(index) : undefined}
            onMouseLeave={interactive ? () => setHighlighted(-1) : undefined}
          >
            <span
              className={styles.swatch}
              style={{ background: sliceColor(index) }}
              aria-hidden="true"
            />
            <span className={styles.legendName}>{slice.name}</span>
            <span className={styles.legendValue}>{formatMoneyBrl(slice.amount)}</span>
            <span className={styles.legendPercent}>{formatDelinquencyRate(slice.percentage)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
