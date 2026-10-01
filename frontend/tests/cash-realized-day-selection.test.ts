import { describe, expect, it } from 'vitest';

import {
  nextScopedDaySelection,
  visibleScopedDay,
} from '../src/components/dashboard/cash-realized-day-selection';

const SCOPE = '2026-08||';

describe('seleção do dia realizado', () => {
  it('abre, troca, fecha e invalida quando o escopo muda', () => {
    const opened = nextScopedDaySelection(null, SCOPE, '2026-08-25');
    expect(visibleScopedDay(opened, SCOPE)).toBe('2026-08-25');
    const swapped = nextScopedDaySelection(opened, SCOPE, '2026-08-26');
    expect(visibleScopedDay(swapped, SCOPE)).toBe('2026-08-26');
    expect(nextScopedDaySelection(swapped, SCOPE, '2026-08-26')).toBeNull();
    expect(visibleScopedDay(swapped, '2026-07||')).toBeNull();
    expect(visibleScopedDay(swapped, '2026-08|cc|')).toBeNull();
    expect(visibleScopedDay(swapped, '2026-08||cat')).toBeNull();
  });
});
