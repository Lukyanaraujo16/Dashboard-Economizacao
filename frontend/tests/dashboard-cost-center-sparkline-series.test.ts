/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';

import { outstandingSeries, receivedSeries } from '../src/components/dashboard/v2/chart-math';
import type { CompetenceDailyPoint } from '../src/components/dashboard/v2/chart-math';

describe('CC1.3.2 sparkline series from cost-center daily', () => {
  it('Todos / centro EXACT: receivedSeries preserva pontos diários', () => {
    const daily: CompetenceDailyPoint[] = [
      { date: '2026-08-01', amount: '100', received: '80', outstanding: '20' },
      { date: '2026-08-02', amount: '50', received: '50', outstanding: '0' },
      { date: '2026-08-03', amount: '0', received: '0', outstanding: '0' },
    ];
    const series = receivedSeries(daily);
    expect(series).toHaveLength(3);
    expect(series[0]?.amount).toBe('80');
    expect(series[1]?.amount).toBe('50');
    const open = outstandingSeries(daily);
    expect(open[0]?.amount).toBe('20');
  });

  it('UNAVAILABLE (received null) → série vazia (não fabrica)', () => {
    const daily: CompetenceDailyPoint[] = [
      { date: '2026-08-01', amount: '600', received: null, outstanding: null },
      { date: '2026-08-02', amount: '0', received: null, outstanding: null },
    ];
    expect(receivedSeries(daily)).toHaveLength(0);
    expect(outstandingSeries(daily)).toHaveLength(0);
  });

  it('mistura null omite só pontos indisponíveis', () => {
    const daily: CompetenceDailyPoint[] = [
      { date: '2026-08-01', amount: '10', received: '10', outstanding: '0' },
      { date: '2026-08-02', amount: '5', received: null, outstanding: null },
    ];
    expect(receivedSeries(daily)).toEqual([{ date: '2026-08-01', amount: '10' }]);
  });
});
