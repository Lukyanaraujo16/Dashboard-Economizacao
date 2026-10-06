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

/** Modos de resolução vertical usados pelo ChartTooltip. */
export type VerticalTooltipMode = 'inside-top' | 'auto-above-below' | 'floating-top';

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
  readonly mode?: VerticalTooltipMode;
};

export type FloatingTooltipClipInput = {
  readonly spaceAbove: number;
  readonly spaceBelow: number;
  readonly tooltipHeight: number;
  readonly gap?: number;
  readonly padding?: number;
};

/** Distância mínima entre o tooltip e a coluna do ponto/barra ativa. */
export const FLOATING_TOOLTIP_GAP = 16;

/** Folga mínima entre o tooltip e a borda do ancestral visível. */
export const FLOATING_TOOLTIP_EDGE = 14;

export type FloatingTooltipSide = 'right' | 'left' | 'above' | 'below';

export type FloatingTooltipBoxInput = {
  readonly anchorX: number;
  /** Metade da coluna do ponto/barra que deve permanecer descoberta. */
  readonly anchorClearance: number;
  readonly tooltipWidth: number;
  readonly tooltipHeight: number;
  readonly containerWidth: number;
  readonly containerHeight: number;
  /** Área visível no mesmo eixo do container. Pode ultrapassar o plot. */
  readonly visibleLeft: number;
  readonly visibleTop: number;
  readonly visibleRight: number;
  readonly visibleBottom: number;
  readonly gap?: number;
  readonly padding?: number;
};

export type FloatingTooltipBox = {
  readonly side: FloatingTooltipSide;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

function rangesOverlap(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
): boolean {
  return start < otherEnd && end > otherStart;
}

/**
 * Posiciona o tooltip flutuante ao lado da coluna ativa.
 * Esquerda ou direita, a que tiver espaço. Se nenhuma couber,
 * usa a faixa acima ou abaixo do plot, desde que caiba no ancestral visível.
 */
export function resolveFloatingTooltipBox(input: FloatingTooltipBoxInput): FloatingTooltipBox {
  const gap = input.gap ?? FLOATING_TOOLTIP_GAP;
  const padding = input.padding ?? DEFAULT_CHART_TOOLTIP_PADDING;
  const containerHeight = Math.max(input.containerHeight, 0);
  const visibleLeft = input.visibleLeft + padding;
  const visibleTop = input.visibleTop + padding;
  const visibleRight = input.visibleRight - padding;
  const visibleBottom = input.visibleBottom - padding;
  const width = Math.max(input.tooltipWidth, 0);
  const height = Math.max(input.tooltipHeight, 0);
  const clearance = Math.max(input.anchorClearance, 0);
  const anchorLeft = input.anchorX - clearance;
  const anchorRight = input.anchorX + clearance;

  const fits = (left: number, top: number): boolean =>
    left >= visibleLeft - 0.5 &&
    top >= visibleTop - 0.5 &&
    left + width <= visibleRight + 0.5 &&
    top + height <= visibleBottom + 0.5;

  const coversActiveColumn = (left: number, top: number): boolean =>
    rangesOverlap(left, left + width, anchorLeft, anchorRight) &&
    rangesOverlap(top, top + height, 0, containerHeight);

  const clampTop = (top: number): number => {
    const maxTop = visibleBottom - height;
    if (maxTop < visibleTop) {
      return visibleTop;
    }
    return clampValue(top, visibleTop, maxTop);
  };

  const clampLeft = (left: number): number => {
    const maxLeft = visibleRight - width;
    if (maxLeft < visibleLeft) {
      return visibleLeft;
    }
    return clampValue(left, visibleLeft, maxLeft);
  };

  const centeredTop = clampTop((containerHeight - height) / 2);
  const spaceRight = visibleRight - (anchorRight + gap);
  const spaceLeft = anchorLeft - gap - visibleLeft;
  const lateral: ReadonlyArray<{ readonly side: 'right' | 'left'; readonly left: number }> =
    spaceRight >= spaceLeft
      ? [
          { side: 'right', left: anchorRight + gap },
          { side: 'left', left: anchorLeft - gap - width },
        ]
      : [
          { side: 'left', left: anchorLeft - gap - width },
          { side: 'right', left: anchorRight + gap },
        ];

  for (const candidate of lateral) {
    if (fits(candidate.left, centeredTop) && !coversActiveColumn(candidate.left, centeredTop)) {
      return { side: candidate.side, left: candidate.left, top: centeredTop, width, height };
    }
  }

  const horizontalLeft = clampLeft(input.anchorX - width / 2);
  const aboveTop = -gap - height;
  if (fits(horizontalLeft, aboveTop) && !coversActiveColumn(horizontalLeft, aboveTop)) {
    return { side: 'above', left: horizontalLeft, top: aboveTop, width, height };
  }

  const belowTop = containerHeight + gap;
  if (fits(horizontalLeft, belowTop) && !coversActiveColumn(horizontalLeft, belowTop)) {
    return { side: 'below', left: horizontalLeft, top: belowTop, width, height };
  }

  const fallbackSide = spaceRight >= spaceLeft ? 'right' : 'left';
  const fallbackLeft = fallbackSide === 'right' ? anchorRight + gap : anchorLeft - gap - width;
  return {
    side: fallbackSide,
    left: fallbackLeft,
    top: centeredTop,
    width,
    height,
  };
}

/**
 * Fallback vertical enquanto o tooltip ainda não tem medida.
 * Com medida, `resolveFloatingTooltipBox` escolhe o lado.
 */
export function resolveFloatingTooltipVertical(
  input: FloatingTooltipClipInput,
): VerticalTooltipPlacement {
  const gap = input.gap ?? 4;
  const padding = input.padding ?? DEFAULT_CHART_TOOLTIP_PADDING;
  const needed = Math.max(input.tooltipHeight, 0) + gap + padding;
  if (input.spaceAbove >= needed) {
    return 'above';
  }
  if (input.spaceBelow >= needed) {
    return 'below';
  }
  return 'inside-top';
}

/**
 * Escolhe colocação vertical.
 * - inside-top: tooltip no topo interno do plot (comparison chart / similares).
 * - floating-top: fora do fluxo, acima do container (Diário / Mensal) — não reserva layout.
 * - auto-above-below: dentro no topo se couber; senão abaixo (Sparkline).
 */
export function resolveVerticalTooltipPlacement(
  input: VerticalTooltipPlacementInput,
): VerticalTooltipPlacement {
  if (input.mode === 'inside-top') {
    return 'inside-top';
  }

  if (input.mode === 'floating-top') {
    return 'above';
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
