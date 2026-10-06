import { describe, expect, it } from 'vitest';

import {
  anchorRatioFromIndex,
  anchorRatioFromSvgX,
  DEFAULT_CHART_TOOLTIP_PADDING,
  isHorizontalTooltipWithinBounds,
  resolveFloatingTooltipBox,
  resolveFloatingTooltipVertical,
  resolveHorizontalTooltipPlacement,
  resolveVerticalTooltipPlacement,
  type FloatingTooltipBox,
} from '../src/components/dashboard/v2/chart-tooltip-placement';

describe('chart-tooltip-placement', () => {
  const padding = DEFAULT_CHART_TOOLTIP_PADDING;

  function assertWithinBounds(
    left: number,
    tooltipWidth: number,
    containerWidth: number,
  ): void {
    expect(
      isHorizontalTooltipWithinBounds(left, tooltipWidth, containerWidth, padding),
    ).toBe(true);
  }

  it('A) anchor no início mantém tooltip dentro do plot', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0,
      tooltipWidth: 160,
      containerWidth: 400,
      padding,
    });
    expect(result.left).toBe(padding);
    assertWithinBounds(result.left, 160, 400);
  });

  it('B) anchor no centro centraliza quando couber', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0.5,
      tooltipWidth: 160,
      containerWidth: 400,
      padding,
    });
    expect(result.left).toBe(120);
    assertWithinBounds(result.left, 160, 400);
  });

  it('C) anchor próximo da direita desloca para a esquerda', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0.9,
      tooltipWidth: 160,
      containerWidth: 400,
      padding,
    });
    expect(result.left).toBe(232);
    assertWithinBounds(result.left, 160, 400);
  });

  it('D) anchor no último ponto encosta na borda direita com padding', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 1,
      tooltipWidth: 160,
      containerWidth: 400,
      padding,
    });
    expect(result.left).toBe(232);
    assertWithinBounds(result.left, 160, 400);
  });

  it('E) tooltip largo clamp na borda direita quando couber', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 1,
      tooltipWidth: 300,
      containerWidth: 400,
      padding,
    });
    expect(result.maxWidth).toBe(384);
    expect(result.left).toBe(92);
    assertWithinBounds(result.left, 300, 400);
  });

  it('F) container estreito mantém bounds com padding', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0.5,
      tooltipWidth: 160,
      containerWidth: 120,
      padding,
    });
    expect(result.maxWidth).toBe(104);
    expect(result.left).toBe(padding);
    assertWithinBounds(result.left, 160, 120);
  });

  it('G) respeita padding customizado', () => {
    const customPadding = 12;
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0,
      tooltipWidth: 80,
      containerWidth: 200,
      padding: customPadding,
    });
    expect(result.left).toBe(customPadding);
    expect(
      isHorizontalTooltipWithinBounds(result.left, 80, 200, customPadding),
    ).toBe(true);
  });

  it('H) tooltip maior que área disponível usa maxWidth e left mínimo', () => {
    const result = resolveHorizontalTooltipPlacement({
      anchorRatio: 0.5,
      tooltipWidth: 500,
      containerWidth: 200,
      padding,
    });
    expect(result.maxWidth).toBe(184);
    expect(result.left).toBe(padding);
    assertWithinBounds(result.left, 500, 200);
  });

  it('anchorRatioFromIndex e anchorRatioFromSvgX normalizam extremos', () => {
    expect(anchorRatioFromIndex(0, 31)).toBeCloseTo(1 / 62, 5);
    expect(anchorRatioFromIndex(30, 31)).toBeCloseTo(61 / 62, 5);
    expect(anchorRatioFromSvgX(320, 320)).toBe(1);
    expect(anchorRatioFromSvgX(0, 320)).toBe(0);
  });

  it('floating-top desce quando o ancestral não tem espaço acima', () => {
    expect(
      resolveFloatingTooltipVertical({
        spaceAbove: 4,
        spaceBelow: 180,
        tooltipHeight: 72,
      }),
    ).toBe('below');
  });

  it('floating-top entra no plot quando acima e abaixo seriam cortados', () => {
    expect(
      resolveFloatingTooltipVertical({
        spaceAbove: 0,
        spaceBelow: 8,
        tooltipHeight: 72,
      }),
    ).toBe('inside-top');
  });

  it('resolveVerticalTooltipPlacement floating-top fica acima do plot', () => {
    expect(
      resolveVerticalTooltipPlacement({
        containerHeight: 100,
        tooltipHeight: 80,
        mode: 'floating-top',
      }),
    ).toBe('above');
  });

  it('resolveVerticalTooltipPlacement inside-top para gráficos internos', () => {
    expect(
      resolveVerticalTooltipPlacement({
        containerHeight: 100,
        tooltipHeight: 80,
        mode: 'inside-top',
      }),
    ).toBe('inside-top');
  });

  it('resolveVerticalTooltipPlacement auto usa inside-top quando couber no plot', () => {
    expect(
      resolveVerticalTooltipPlacement({
        containerHeight: 120,
        tooltipHeight: 40,
        mode: 'auto-above-below',
      }),
    ).toBe('inside-top');
  });

  it('resolveVerticalTooltipPlacement auto usa below quando tooltip não cabe dentro', () => {
    expect(
      resolveVerticalTooltipPlacement({
        containerHeight: 40,
        tooltipHeight: 30,
        mode: 'auto-above-below',
      }),
    ).toBe('below');
  });
});

describe('resolveFloatingTooltipBox', () => {
  const padding = DEFAULT_CHART_TOOLTIP_PADDING;

  function coversActiveColumn(
    box: FloatingTooltipBox,
    anchorX: number,
    clearance: number,
    containerHeight: number,
  ): boolean {
    const anchorLeft = anchorX - clearance;
    const anchorRight = anchorX + clearance;
    const horizontal = box.left < anchorRight && box.left + box.width > anchorLeft;
    const vertical = box.top < containerHeight && box.top + box.height > 0;
    return horizontal && vertical;
  }

  function expectInsideVisible(
    box: FloatingTooltipBox,
    visible: { left: number; top: number; right: number; bottom: number },
  ): void {
    expect(box.left).toBeGreaterThanOrEqual(visible.left + padding - 0.5);
    expect(box.top).toBeGreaterThanOrEqual(visible.top + padding - 0.5);
    expect(box.left + box.width).toBeLessThanOrEqual(visible.right - padding + 0.5);
    expect(box.top + box.height).toBeLessThanOrEqual(visible.bottom - padding + 0.5);
  }

  it('ponto com espaço à direita posiciona o tooltip à direita', () => {
    const box = resolveFloatingTooltipBox({
      anchorX: 48,
      anchorClearance: 8,
      tooltipWidth: 100,
      tooltipHeight: 48,
      containerWidth: 400,
      containerHeight: 120,
      visibleLeft: 0,
      visibleTop: 0,
      visibleRight: 400,
      visibleBottom: 220,
    });
    expect(box.side).toBe('right');
    expect(box.left).toBe(48 + 8 + 16);
    expectInsideVisible(box, { left: 0, top: 0, right: 400, bottom: 220 });
    expect(coversActiveColumn(box, 48, 8, 120)).toBe(false);
  });

  it('ponto próximo à borda direita coloca o tooltip à esquerda', () => {
    const box = resolveFloatingTooltipBox({
      anchorX: 360,
      anchorClearance: 8,
      tooltipWidth: 120,
      tooltipHeight: 48,
      containerWidth: 400,
      containerHeight: 120,
      visibleLeft: 0,
      visibleTop: 0,
      visibleRight: 400,
      visibleBottom: 220,
    });
    expect(box.side).toBe('left');
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
    expectInsideVisible(box, { left: 0, top: 0, right: 400, bottom: 220 });
    expect(coversActiveColumn(box, 360, 8, 120)).toBe(false);
  });

  it('ponto próximo à borda esquerda coloca o tooltip à direita', () => {
    const box = resolveFloatingTooltipBox({
      anchorX: 24,
      anchorClearance: 8,
      tooltipWidth: 100,
      tooltipHeight: 48,
      containerWidth: 400,
      containerHeight: 120,
      visibleLeft: 0,
      visibleTop: 0,
      visibleRight: 400,
      visibleBottom: 220,
    });
    expect(box.side).toBe('right');
    expect(box.left).toBeGreaterThanOrEqual(24 + 8);
    expectInsideVisible(box, { left: 0, top: 0, right: 400, bottom: 220 });
    expect(coversActiveColumn(box, 24, 8, 120)).toBe(false);
  });

  it('pouco espaço vertical no plot ainda posiciona ao lado, dentro do ancestral', () => {
    const visible = { left: 0, top: -80, right: 400, bottom: 180 };
    const box = resolveFloatingTooltipBox({
      anchorX: 120,
      anchorClearance: 6,
      tooltipWidth: 90,
      tooltipHeight: 64,
      containerWidth: 400,
      containerHeight: 28,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
    });
    expect(box.side === 'left' || box.side === 'right').toBe(true);
    expectInsideVisible(box, visible);
    expect(coversActiveColumn(box, 120, 6, 28)).toBe(false);
  });

  it('tooltip permanece dentro do ancestral visível e fora da coluna ativa', () => {
    const visible = { left: 30, top: 12, right: 360, bottom: 160 };
    const anchorX = 150;
    const clearance = 10;
    const box = resolveFloatingTooltipBox({
      anchorX,
      anchorClearance: clearance,
      tooltipWidth: 100,
      tooltipHeight: 40,
      containerWidth: 400,
      containerHeight: 120,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
    });
    expectInsideVisible(box, visible);
    expect(coversActiveColumn(box, anchorX, clearance, 120)).toBe(false);
  });

  it('valor monetário largo permanece com a largura medida e troca de lado na borda', () => {
    const width = 240;
    const visible = { left: 0, top: 0, right: 420, bottom: 240 };
    const edge = resolveFloatingTooltipBox({
      anchorX: 360,
      anchorClearance: 10,
      tooltipWidth: width,
      tooltipHeight: 64,
      containerWidth: 420,
      containerHeight: 120,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
      padding: 14,
    });
    expect(edge.side).toBe('left');
    expect(edge.width).toBe(width);
    expect(edge.left + edge.width).toBeLessThanOrEqual(360 - 10);
    expectInsideVisible(edge, visible);
    expect(coversActiveColumn(edge, 360, 10, 120)).toBe(false);

    const start = resolveFloatingTooltipBox({
      anchorX: 28,
      anchorClearance: 10,
      tooltipWidth: width,
      tooltipHeight: 64,
      containerWidth: 420,
      containerHeight: 120,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
      padding: 14,
    });
    expect(start.side).toBe('right');
    expect(start.width).toBe(width);
    expect(start.left).toBeGreaterThanOrEqual(28 + 10 + 16);
    expectInsideVisible(start, visible);
    expect(coversActiveColumn(start, 28, 10, 120)).toBe(false);
  });

  it('não gruda na borda visível quando ainda há folga', () => {
    const visible = { left: 0, top: 0, right: 480, bottom: 200 };
    const box = resolveFloatingTooltipBox({
      anchorX: 200,
      anchorClearance: 12,
      tooltipWidth: 220,
      tooltipHeight: 56,
      containerWidth: 480,
      containerHeight: 108,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
      padding: 14,
    });
    expect(box.width).toBe(220);
    expect(box.left).toBeGreaterThanOrEqual(visible.left + 14);
    expect(box.left + box.width).toBeLessThanOrEqual(visible.right - 14);
    expect(box.top).toBeGreaterThanOrEqual(visible.top + 14);
    expect(coversActiveColumn(box, 200, 12, 108)).toBe(false);
  });

  it('sem espaço lateral usa a faixa acima do plot quando ela está visível', () => {
    const box = resolveFloatingTooltipBox({
      anchorX: 100,
      anchorClearance: 20,
      tooltipWidth: 160,
      tooltipHeight: 40,
      containerWidth: 200,
      containerHeight: 80,
      visibleLeft: 0,
      visibleTop: -80,
      visibleRight: 200,
      visibleBottom: 80,
    });
    expect(box.side).toBe('above');
    expect(box.top + box.height).toBeLessThanOrEqual(0);
    expect(coversActiveColumn(box, 100, 20, 80)).toBe(false);
  });
});
