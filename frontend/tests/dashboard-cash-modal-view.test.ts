import { describe, expect, it } from 'vitest';

import {
  cashCompositionToRankingItems,
  countNonZeroDailyPoints,
  formatPayableDueDaysCaption,
  peakNonZeroDailyPoint,
} from '../src/components/dashboard/dashboard-cash-modal-view';
import { singleCashCategoryComposition } from './helpers/monthly-cash-flow-fixture';

describe('dashboard-cash-modal-view', () => {
  it('cashCompositionToRankingItems mapeia composição realized', () => {
    const items = cashCompositionToRankingItems(singleCashCategoryComposition('Ops', '100.00'));
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Ops');
    expect(items[0]?.amount).toBe('100.00');
  });

  it('peakNonZeroDailyPoint retorna maior dia', () => {
    const peak = peakNonZeroDailyPoint([
      { date: '2026-08-01', amount: '10.00' },
      { date: '2026-08-05', amount: '500.00' },
    ]);
    expect(peak?.date).toBe('2026-08-05');
    expect(peak?.amount).toBe('500.00');
  });

  it('countNonZeroDailyPoints ignora zeros', () => {
    expect(
      countNonZeroDailyPoints([
        { date: '2026-08-01', amount: '0' },
        { date: '2026-08-02', amount: '5.00' },
      ]),
    ).toBe(1);
  });

  it('formatPayableDueDaysCaption — plural, singular e vazio', () => {
    expect(
      formatPayableDueDaysCaption([
        { date: '2026-08-01', amount: '10.00' },
        { date: '2026-08-05', amount: '20.00' },
        { date: '2026-08-10', amount: '0' },
      ]),
    ).toBe('2 dias com vencimento');
    expect(formatPayableDueDaysCaption([{ date: '2026-08-01', amount: '5.00' }])).toBe(
      '1 dia com vencimento',
    );
    expect(formatPayableDueDaysCaption([{ date: '2026-08-01', amount: '0' }])).toBe(
      'Sem vencimentos previstos',
    );
    expect(formatPayableDueDaysCaption(undefined)).toBe('Sem vencimentos previstos');
  });
});
