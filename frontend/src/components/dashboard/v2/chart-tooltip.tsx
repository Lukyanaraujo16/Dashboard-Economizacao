'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import { cx } from '../../ui/utils/cx';
import {
  DEFAULT_CHART_TOOLTIP_PADDING,
  resolveHorizontalTooltipPlacement,
  resolveVerticalTooltipPlacement,
  type VerticalTooltipPlacement,
} from './chart-tooltip-placement';
import styles from './chart-tooltip.module.css';

export type ChartTooltipVerticalMode = 'inside-top' | 'auto-above-below' | 'floating-top';

export type ChartTooltipProps = {
  readonly open: boolean;
  readonly anchorRatio: number;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly className?: string;
  readonly verticalMode?: ChartTooltipVerticalMode;
  readonly role?: string;
  readonly 'aria-hidden'?: boolean | 'true' | 'false';
  readonly children: ReactNode;
};

function initialVerticalForMode(mode: ChartTooltipVerticalMode): VerticalTooltipPlacement {
  if (mode === 'floating-top') {
    return 'above';
  }
  if (mode === 'inside-top') {
    return 'inside-top';
  }
  return 'below';
}

type ComputedPlacement = {
  readonly left: number;
  readonly maxWidth: number;
  readonly vertical: VerticalTooltipPlacement;
};

const VERTICAL_GAP_PX = 4;

function buildVerticalStyle(vertical: VerticalTooltipPlacement): CSSProperties {
  if (vertical === 'inside-top') {
    return { top: 'var(--space-2)', bottom: 'auto' };
  }
  if (vertical === 'above') {
    return { bottom: `calc(100% + ${VERTICAL_GAP_PX}px)`, top: 'auto' };
  }
  return { top: `calc(100% + ${VERTICAL_GAP_PX}px)`, bottom: 'auto' };
}

/** Tooltip posicionado com collision handling dentro do plot container. */
export function ChartTooltip({
  open,
  anchorRatio,
  containerRef,
  className,
  verticalMode = 'inside-top',
  role,
  'aria-hidden': ariaHidden,
  children,
}: ChartTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<ComputedPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }

    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) {
      return;
    }

    const padding = DEFAULT_CHART_TOOLTIP_PADDING;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const tooltipWidth = Math.max(tooltip.offsetWidth, tooltip.scrollWidth);
    const tooltipHeight = Math.max(tooltip.offsetHeight, tooltip.scrollHeight);

    const horizontal = resolveHorizontalTooltipPlacement({
      anchorRatio,
      tooltipWidth,
      containerWidth,
      padding,
    });

    const vertical = resolveVerticalTooltipPlacement({
      containerHeight,
      tooltipHeight,
      padding,
      gap: VERTICAL_GAP_PX,
      mode: verticalMode,
    });

    setPlacement({
      left: horizontal.left,
      maxWidth: horizontal.maxWidth,
      vertical,
    });
  }, [anchorRatio, children, containerRef, open, verticalMode]);

  if (!open) {
    return null;
  }

  const resolvedVertical = placement?.vertical ?? initialVerticalForMode(verticalMode);

  const inlineStyle: CSSProperties = {
    position: 'absolute',
    left: placement ? `${placement.left}px` : 0,
    transform: 'none',
    maxWidth: placement && placement.maxWidth > 0 ? `${placement.maxWidth}px` : undefined,
    visibility: placement ? 'visible' : 'hidden',
    ...buildVerticalStyle(resolvedVertical),
  };

  return (
    <div
      ref={tooltipRef}
      className={cx(styles.root, className)}
      style={inlineStyle}
      role={role}
      aria-hidden={ariaHidden}
      data-vertical-placement={resolvedVertical}
      data-vertical-mode={verticalMode}
    >
      {children}
    </div>
  );
}
