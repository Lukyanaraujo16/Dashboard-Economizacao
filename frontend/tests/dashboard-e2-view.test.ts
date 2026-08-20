import { describe, expect, it } from 'vitest';

import {
  compositionBarWidth,
  isExpenseCompositionEmpty,
} from '../src/components/dashboard/dashboard-expense-composition-view';

describe('dashboard-expense-composition-view', () => {
  it('usa o percentual do backend na largura da barra', () => {
    expect(compositionBarWidth('0')).toBe(0);
    expect(compositionBarWidth('42')).toBe(42);
    expect(compositionBarWidth('100')).toBe(100);
    expect(compositionBarWidth('150')).toBe(100);
  });

  it('empty quando total zero', () => {
    expect(isExpenseCompositionEmpty([], '0')).toBe(true);
    expect(
      isExpenseCompositionEmpty(
        [{ kind: 'category', name: 'Aluguel', amount: '10', percentage: '100' }],
        '10',
      ),
    ).toBe(false);
  });
});
