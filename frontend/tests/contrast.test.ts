import { describe, expect, it } from 'vitest';

import {
  evaluateWcagAaNormalText,
  meetsWcagAaNormalText,
  normalizeHexInput,
  relativeLuminance,
  contrastRatio,
  WCAG_AA_NORMAL_TEXT_RATIO,
} from '../src/components/companies/contrast';

describe('contrast WCAG utilities', () => {
  it('normaliza hex válido para uppercase', () => {
    expect(normalizeHexInput('#aabbcc')).toBe('#AABBCC');
    expect(normalizeHexInput('  #FFFFFF  ')).toBe('#FFFFFF');
  });

  it('rejeita hex inválido', () => {
    expect(normalizeHexInput('#fff')).toBeNull();
    expect(normalizeHexInput('red')).toBeNull();
    expect(normalizeHexInput('#GGGGGG')).toBeNull();
  });

  it('calcula luminância relativa do preto e branco', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('razão preto/branco é 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('aceita combinação válida AA texto normal', () => {
    expect(meetsWcagAaNormalText('#FFFFFF', '#141452')).toBe(true);
    const evaluated = evaluateWcagAaNormalText('#FFFFFF', '#141452');
    expect(evaluated.ok).toBe(true);
    expect(evaluated.ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_RATIO);
  });

  it('rejeita combinação inválida AA texto normal', () => {
    expect(meetsWcagAaNormalText('#777777', '#888888')).toBe(false);
  });
});
