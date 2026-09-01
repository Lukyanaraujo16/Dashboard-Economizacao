/** Margem interna mínima entre tooltip e borda útil do plot (px). */
export const DEFAULT_CHART_TOOLTIP_PADDING = 8;

export type HorizontalTooltipPlacementInput = {
  readonly anchorRatio: number;
  readonly tooltipWidth: number;
  readonly containerWidth: number;
  readonly padding?: number;
};

export type HorizontalTooltipPlacement = {
  readonly left: number;
  readonly maxWidth: number;
  readonly anchorRatio: number;
  readonly tooltipWidth: number;
  readonly containerWidth: number;
  readonly padding: number;
};

export type VerticalTooltipPlacement = 'above' | 'below' | 'inside-top';

export function clampValue(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Posiciona o tooltip horizontalmente para manter o bounding box dentro do plot.
 * Usa clamp sobre desiredLeft = anchorX - tooltipWidth/2.
 */
export function resolveHorizontalTooltipPlacement(
  input: HorizontalTooltipPlacementInput,
): HorizontalTooltipPlacement {
  const padding = input.padding ?? DEFAULT_CHART_TOOLTIP_PADDING;
  const containerWidth = Math.max(input.containerWidth, 0);
  const tooltipWidth = Math.max(input.tooltipWidth, 0);
  const anchorRatio = clampValue(input.anchorRatio, 0, 1);
  const maxWidth = Math.max(containerWidth - padding * 2, 0);

  if (containerWidth <= 0) {
    return {
      left: 0,
      maxWidth,
      anchorRatio,
      tooltipWidth,
      containerWidth,
      padding,
    };
  }

  const effectiveTooltipWidth =
    maxWidth > 0 ? Math.min(tooltipWidth, maxWidth) : tooltipWidth;
  const anchorX = anchorRatio * containerWidth;
  const desiredLeft = anchorX - effectiveTooltipWidth / 2;
  const maxLeft = containerWidth - effectiveTooltipWidth - padding;
  const left = clampValue(desiredLeft, padding, Math.max(padding, maxLeft));

  return {
    left,
    maxWidth,
    anchorRatio,
    tooltipWidth: effectiveTooltipWidth,
    containerWidth,
    padding,
  };
}

/** Valida se left + width respeita padding horizontal do container. */
export function isHorizontalTooltipWithinBounds(
  left: number,
  tooltipWidth: number,
  containerWidth: number,
  padding: number = DEFAULT_CHART_TOOLTIP_PADDING,
): boolean {
  if (containerWidth <= 0) {
    return true;
  }
  const effectiveWidth = Math.min(tooltipWidth, Math.max(containerWidth - padding * 2, 0));
  return left >= padding - 0.5 && left + effectiveWidth <= containerWidth - padding + 0.5;
}

export type VerticalTooltipPlacementInput = {
  readonly containerHeight: number;
  readonly tooltipHeight: number;
  readonly padding?: number;
  readonly gap?: number;
  readonly preferAbove?: boolean;
  readonly mode?: 'inside-top' | 'auto-above-below';
};

/**
 * Escolhe colocação vertical.
 * - inside-top: tooltip fixo no topo interno do plot (comparison/daily-bars/monthly).
 * - auto-above-below: dentro do plot no topo se couber; senão abaixo do plot (Sparkline).
 */
export function resolveVerticalTooltipPlacement(
  input: VerticalTooltipPlacementInput,
): VerticalTooltipPlacement {
  if (input.mode === 'inside-top') {
    return 'inside-top';
  }

  const padding = input.padding ?? DEFAULT_CHART_TOOLTIP_PADDING;
  const containerHeight = Math.max(input.containerHeight, 0);
  const tooltipHeight = Math.max(input.tooltipHeight, 0);

  if (tooltipHeight + padding * 2 <= containerHeight) {
    return 'inside-top';
  }

  return 'below';
}

/** Converte índice ativo e total de pontos em ratio horizontal (centro do slot). */
export function anchorRatioFromIndex(index: number, count: number): number {
  if (count <= 0 || index < 0) {
    return 0;
  }
  return clampValue((index + 0.5) / count, 0, 1);
}

/** Converte coordenada SVG normalizada (0..viewWidth) em ratio. */
export function anchorRatioFromSvgX(x: number, viewWidth: number): number {
  if (viewWidth <= 0) {
    return 0;
  }
  return clampValue(x / viewWidth, 0, 1);
}
