import { describe, expect, it } from 'vitest';

import {
  anchorRatioFromIndex,
  anchorRatioFromSvgX,
  DEFAULT_CHART_TOOLTIP_PADDING,
  isHorizontalTooltipWithinBounds,
  resolveHorizontalTooltipPlacement,
  resolveVerticalTooltipPlacement,
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
