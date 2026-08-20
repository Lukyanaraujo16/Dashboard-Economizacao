import { describe, expect, it } from 'vitest';

import {
  donutSlicePercentages,
  presentTopCategoryDonutSlices,
} from '../src/components/dashboard/category-donut-view';

describe('presentTopCategoryDonutSlices', () => {
  it('retorna vazio sem categorias', () => {
    expect(presentTopCategoryDonutSlices([])).toEqual([]);
  });

  it('preserva 1 ou 2 categorias sem agregar Outras', () => {
    const slices = presentTopCategoryDonutSlices([
      { kind: 'category', name: 'A', amount: '10', percentage: '60' },
      { kind: 'category', name: 'B', amount: '5', percentage: '40' },
    ]);
    expect(slices).toHaveLength(2);
    expect(slices.some((slice) => slice.name === 'Outras')).toBe(false);
  });

  it('agrega Top 5 + Outras com soma exata para 6+ categorias', () => {
    const items = [
      { kind: 'category', name: 'C1', amount: '50', percentage: '50' },
      { kind: 'category', name: 'C2', amount: '20', percentage: '20' },
      { kind: 'category', name: 'C3', amount: '10', percentage: '10' },
      { kind: 'category', name: 'C4', amount: '8', percentage: '8' },
      { kind: 'category', name: 'C5', amount: '7', percentage: '7' },
      { kind: 'category', name: 'C6', amount: '3', percentage: '3' },
      { kind: 'category', name: 'C7', amount: '2', percentage: '2' },
    ];
    const slices = presentTopCategoryDonutSlices(items);
    expect(slices).toHaveLength(6);
    expect(slices.at(-1)?.name).toBe('Outras');
    expect(slices.at(-1)?.amount).toBe('5.00');
    expect(slices.at(-1)?.percentage).toBe('5.00');
    const amountSum = slices.reduce((sum, slice) => sum + Number.parseFloat(slice.amount), 0);
    const percentageSum = slices.reduce(
      (sum, slice) => sum + Number.parseFloat(slice.percentage),
      0,
    );
    expect(amountSum).toBeCloseTo(100, 2);
    expect(percentageSum).toBeCloseTo(100, 2);
  });

  it('donutSlicePercentages normaliza percentuais para o gráfico', () => {
    const percents = donutSlicePercentages([
      { kind: 'category', name: 'A', amount: '75', percentage: '75' },
      { kind: 'category', name: 'B', amount: '25', percentage: '25' },
    ]);
    expect(percents).toEqual([75, 25]);
  });
});
