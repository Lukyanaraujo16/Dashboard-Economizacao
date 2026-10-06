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
  FLOATING_TOOLTIP_EDGE,
  FLOATING_TOOLTIP_GAP,
  resolveFloatingTooltipBox,
  resolveFloatingTooltipVertical,
  resolveHorizontalTooltipPlacement,
  resolveVerticalTooltipPlacement,
  type FloatingTooltipSide,
  type VerticalTooltipPlacement,
} from './chart-tooltip-placement';
import styles from './chart-tooltip.module.css';

export type ChartTooltipVerticalMode = 'inside-top' | 'auto-above-below' | 'floating-top';

export type ChartTooltipProps = {
  readonly open: boolean;
  readonly anchorRatio: number;
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Faixa das barras, quando o container inclui eixo ou legenda. */
  readonly trackRef?: RefObject<HTMLElement | null>;
  /** Quantidade de colunas na faixa, para afastar o tooltip da coluna ativa. */
  readonly slotCount?: number;
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
  readonly top: number | null;
  readonly maxWidth: number;
  readonly vertical: VerticalTooltipPlacement | FloatingTooltipSide;
};

const VERTICAL_GAP_PX = 4;

function clipsOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'hidden';
}

/** Ancestral que recorta o tooltip. Sem medida útil, o modo flutuante permanece acima. */
function measurableClipBox(element: HTMLElement): DOMRect | null {
  let current = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (
      clipsOverflow(style.overflow) ||
      clipsOverflow(style.overflowX) ||
      clipsOverflow(style.overflowY)
    ) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
      return null;
    }
    current = current.parentElement;
  }
  return null;
}

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
function visibleBounds(container: HTMLElement, containerRect: DOMRect): {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
} {
  const clip = measurableClipBox(container);
  if (clip) {
    return {
      left: clip.left - containerRect.left,
      top: clip.top - containerRect.top,
      right: clip.right - containerRect.left,
      bottom: clip.bottom - containerRect.top,
    };
  }
  const viewportWidth = window.innerWidth || container.clientWidth;
  const viewportHeight = window.innerHeight || container.clientHeight;
  return {
    left: -containerRect.left,
    top: -containerRect.top,
    right: viewportWidth - containerRect.left,
    bottom: viewportHeight - containerRect.top,
  };
}

export function ChartTooltip({
  open,
  anchorRatio,
  containerRef,
  trackRef,
  slotCount,
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
    tooltip.style.maxWidth = 'none';
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

    let left = horizontal.left;
    let top: number | null = null;
    let maxWidth = horizontal.maxWidth;
    let resolvedVertical: VerticalTooltipPlacement | FloatingTooltipSide = vertical;
    if (verticalMode === 'floating-top' && tooltipWidth > 0 && tooltipHeight > 0 && containerWidth > 0) {
      const containerRect = container.getBoundingClientRect();
      const bounds = visibleBounds(container, containerRect);
      const track = trackRef?.current ?? null;
      const trackRect = track?.getBoundingClientRect();
      const trackWidth = trackRect && trackRect.width > 0 ? trackRect.width : containerWidth;
      const trackOffset =
        trackRect && trackRect.width > 0 ? trackRect.left - containerRect.left : 0;
      const anchorX = trackOffset + anchorRatio * trackWidth;
      const anchorClearance = slotCount !== undefined && slotCount > 0 ? trackWidth / slotCount / 2 : 12;
      const box = resolveFloatingTooltipBox({
        anchorX,
        anchorClearance,
        tooltipWidth,
        tooltipHeight,
        containerWidth,
        containerHeight,
        visibleLeft: bounds.left,
        visibleTop: bounds.top,
        visibleRight: bounds.right,
        visibleBottom: bounds.bottom,
        gap: FLOATING_TOOLTIP_GAP,
        padding: FLOATING_TOOLTIP_EDGE,
      });
      left = box.left;
      top = box.top;
      maxWidth = 0;
      resolvedVertical = box.side;
    } else if (verticalMode === 'floating-top') {
      const clip = measurableClipBox(container);
      const containerRect = container.getBoundingClientRect();
      if (clip && containerRect.height > 0) {
        resolvedVertical = resolveFloatingTooltipVertical({
          spaceAbove: containerRect.top - clip.top,
          spaceBelow: clip.bottom - containerRect.bottom,
          tooltipHeight,
          gap: VERTICAL_GAP_PX,
          padding,
        });
        const width = horizontal.maxWidth > 0 ? Math.min(tooltipWidth, horizontal.maxWidth) : tooltipWidth;
        const minLeft = clip.left + padding - containerRect.left;
        const maxLeft = clip.right - padding - width - containerRect.left;
        const lower = Math.min(minLeft, maxLeft);
        const upper = Math.max(minLeft, maxLeft);
        left = Math.min(Math.max(left, lower), upper);
      }
    }

    setPlacement({
      left,
      top,
      maxWidth,
      vertical: resolvedVertical,
    });
  }, [anchorRatio, children, containerRef, open, slotCount, trackRef, verticalMode]);

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
    ...(placement?.top !== null && placement?.top !== undefined
      ? { top: `${placement.top}px`, bottom: 'auto' }
      : buildVerticalStyle(
          resolvedVertical === 'left' || resolvedVertical === 'right' ? 'above' : resolvedVertical,
        )),
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
