import { describe, expect, it } from 'vitest';

import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../src/lib/format-money-brl';

describe('formatMoneyBrl', () => {
  it('formata zero, centavos e milhares sem Number no resultado', () => {
    expect(formatMoneyBrl('0')).toBe('R$\u00a00,00');
    expect(formatMoneyBrl('12.34')).toBe('R$\u00a012,34');
    expect(formatMoneyBrl('1234.5')).toBe('R$\u00a01.234,50');
    expect(formatMoneyBrl('100')).toBe('R$\u00a0100,00');
    expect(typeof formatMoneyBrl('12.34')).toBe('string');
  });

  it('arredonda apenas na apresentação', () => {
    expect(formatMoneyBrl('1.225')).toBe('R$\u00a01,23');
  });
});

describe('formatDelinquencyRate', () => {
  it('preserva null e zero exato', () => {
    expect(formatDelinquencyRate(null)).toBe('—');
    expect(formatDelinquencyRate('0')).toBe('0%');
    expect(isDecimalZero('0.00')).toBe(true);
  });

  it('não multiplica e usa 1 casa decimal', () => {
    expect(formatDelinquencyRate('12.44')).toBe('12,4%');
    expect(formatDelinquencyRate('50')).toBe('50,0%');
  });
});
