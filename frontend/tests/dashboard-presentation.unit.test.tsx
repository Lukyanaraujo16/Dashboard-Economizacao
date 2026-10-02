/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryDonutChart } from '../src/components/dashboard/category-donut-chart';
import {
  CashMonthlyGroupedBars,
  CompetenceDailyBars,
  ExecutiveKpiCard,
  Sparkline,
} from '../src/components/dashboard/v2';
import {
  amountValues,
  buildSvgPoints,
  maxAbs,
  toPolyline,
} from '../src/components/dashboard/v2/chart-math';
import {
  resetDashboardPresentationForTests,
  useDashboardPresentation,
} from '../src/components/dashboard/v2/dashboard-presentation';
import { formatDelinquencyRate, formatMoneyBrl } from '../src/lib/format-money-brl';

const SPARK_POINTS = [
  { date: '2026-08-24', amount: '10.00' },
  { date: '2026-08-25', amount: '20.00' },
  { date: '2026-08-26', amount: '30.00' },
];

function expectedSparklinePoints(): string {
  const values = amountValues(SPARK_POINTS);
  return toPolyline(
    buildSvgPoints(values, {
      width: 120,
      height: 36,
      padding: 3,
      max: maxAbs(values),
      signed: false,
    }),
  );
}

function PageAnchor() {
  useDashboardPresentation('page-anchor');
  return <div data-testid="page-anchor" />;
}

describe('apresentação visual da Dashboard', () => {
  beforeEach(() => {
    resetDashboardPresentationForTests();
  });

  afterEach(() => {
    cleanup();
    resetDashboardPresentationForTests();
  });

  it('mostra o valor final do card no primeiro render', () => {
    render(<ExecutiveKpiCard title="Receitas" tone="revenue" state="ready" value="R$ 12.345,67" />);

    expect(screen.getByText('R$ 12.345,67')).toBeTruthy();
    expect(screen.getByText('R$ 12.345,67').textContent).toBe('R$ 12.345,67');
    expect(screen.queryByText('R$ 0,00')).toBeNull();
  });

  it('mantém a geometria completa da série e a interação no primeiro render', () => {
    const onPointSelect = vi.fn();
    const { container } = render(
      <Sparkline
        points={SPARK_POINTS}
        interactive
        ariaLabel="Série"
        onPointSelect={onPointSelect}
      />,
    );

    const line = container.querySelector('polyline');
    expect(line?.getAttribute('points')).toBe(expectedSparklinePoints());
    expect(line?.getAttribute('pathLength')).toBe('1');
    expect(container.querySelector('[data-reveal="true"]')).toBeTruthy();

    const plot = screen.getByRole('img', { name: /Enter ou Espaço/ });
    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(onPointSelect).toHaveBeenCalledWith({
      date: '2026-08-25',
      amount: '20.00',
      index: 1,
    });
  });

  it('não repete a revelação quando o gráfico remonta e a página continua montada', async () => {
    const view = render(
      <>
        <PageAnchor />
        <Sparkline points={SPARK_POINTS} ariaLabel="Série" />
      </>,
    );

    expect(view.container.querySelector('[data-reveal="true"]')).toBeTruthy();
    const firstPoints = view.container.querySelector('polyline')?.getAttribute('points');

    await act(async () => {
      await Promise.resolve();
    });

    view.rerender(
      <>
        <PageAnchor />
        <div />
      </>,
    );
    view.rerender(
      <>
        <PageAnchor />
        <Sparkline points={SPARK_POINTS} ariaLabel="Série" />
      </>,
    );

    const plot = screen.getByRole('img', { name: 'Série' });
    expect(plot.getAttribute('data-reveal')).toBeNull();
    expect(plot.querySelector('polyline')?.getAttribute('points')).toBe(firstPoints);
    expect(firstPoints).toBe(expectedSparklinePoints());
  });

  it('desenha as barras com a altura final e não publica valor intermediário', () => {
    const { container } = render(
      <CompetenceDailyBars
        monthKey="2026-08"
        revenueDaily={[
          { date: '2026-08-01', amount: '100.00' },
          { date: '2026-08-02', amount: '40.00' },
        ]}
        expenseDaily={[
          { date: '2026-08-01', amount: '25.00' },
          { date: '2026-08-02', amount: '10.00' },
        ]}
      />,
    );

    const rects = [...container.querySelectorAll('rect')];
    expect(rects.length).toBe(4);
    for (const rect of rects) {
      expect(Number(rect.getAttribute('height'))).toBeGreaterThan(0);
      expect(rect.getAttribute('aria-valuenow')).toBeNull();
    }
    expect(container.querySelector('[aria-valuenow]')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/ago\/2026/);
  });

  it('preserva a altura percentual final das barras mensais', () => {
    const { container } = render(
      <CashMonthlyGroupedBars
        ariaLabel="Caixa mensal"
        buckets={[
          { monthKey: '2026-07', inflows: '1000.00', outflows: '400.00', result: '600.00' },
          { monthKey: '2026-08', inflows: '500.00', outflows: '500.00', result: '0.00' },
        ]}
      />,
    );

    const bars = [...container.querySelectorAll('span')].filter((node) =>
      (node as HTMLElement).style.height.endsWith('%'),
    );
    expect(bars.length).toBe(4);
    for (const bar of bars) {
      const height = (bar as HTMLElement).style.height;
      expect(height.endsWith('%')).toBe(true);
      expect(height).not.toBe('0%');
      expect(bar.getAttribute('aria-valuenow')).toBeNull();
    }
    expect(screen.getByRole('img', { name: 'Caixa mensal' }).getAttribute('tabIndex')).toBe('0');
  });

  it('mostra percentuais e valores reais do donut no primeiro render', () => {
    const amount = '250.00';
    const percentage = '0.2500';
    render(
      <CategoryDonutChart
        ariaLabel="Receitas por categoria"
        centerLabel="R$ 1 mil"
        centerCaption="Total"
        slices={[{ kind: 'category', name: 'Serviços', amount, percentage }]}
      />,
    );

    const legend = screen.getByText('Serviços').closest('li');
    const legendText = legend?.textContent?.replace(/\u00a0/g, ' ') ?? '';
    expect(legendText).toContain(formatMoneyBrl(amount).replace(/\u00a0/g, ' '));
    expect(legendText).toContain(formatDelinquencyRate(percentage));
    expect(screen.getByText('R$ 1 mil')).toBeTruthy();
    const donut = screen.getByRole('img', { name: 'Receitas por categoria' });
    expect(donut.getAttribute('data-reveal')).toBe('true');
    expect(donut.getAttribute('style')).toMatch(/conic-gradient/);
  });

  it('reduced motion não depende de valor intermediário no CSS', () => {
    const files = [
      'src/components/dashboard/v2/executive-kpi-card.module.css',
      'src/components/dashboard/v2/sparkline.module.css',
      'src/components/dashboard/v2/competence-daily-bars.module.css',
      'src/components/dashboard/v2/cash-monthly-grouped-bars.module.css',
      'src/components/dashboard/category-donut.module.css',
      'src/login/login-experience.module.css',
    ];

    for (const file of files) {
      const css = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toMatch(/animation:\s*none/);
    }

    const spark = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/v2/sparkline.module.css'),
      'utf8',
    );
    expect(spark).toMatch(/stroke-dashoffset:\s*0/);
    const donut = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/category-donut.module.css'),
      'utf8',
    );
    expect(donut).toMatch(/mask-image:\s*none/);
  });
});
