import { describe, expect, it } from 'vitest';

import {
  BALANCE_BAND_HEIGHT,
  BALANCE_BAND_PAD,
  dailyBalanceBandGeometry,
  dailyBalanceDomain,
  dailyBalanceValueToY,
} from '../src/components/dashboard/v2/daily-balance-band-geometry';

const HEIGHT = BALANCE_BAND_HEIGHT;
const PAD = BALANCE_BAND_PAD;

function yOf(value: number, minDomain: number, maxDomain: number): number {
  return dailyBalanceValueToY(value, minDomain, maxDomain, HEIGHT, PAD);
}

describe('dailyBalanceDomain', () => {
  it('A) todos positivos incluem zero na base', () => {
    expect(dailyBalanceDomain([46925, 100000, 200000])).toEqual({
      minDomain: 0,
      maxDomain: 200000,
    });
  });

  it('B) todos negativos incluem zero no topo', () => {
    expect(dailyBalanceDomain([-10000, -2500])).toEqual({
      minDomain: -10000,
      maxDomain: 0,
    });
  });

  it('C) cruzamento preserva min negativo e max positivo', () => {
    expect(dailyBalanceDomain([50000, 10000, 0, -5000, 20000])).toEqual({
      minDomain: -5000,
      maxDomain: 50000,
    });
  });

  it('D) constante positivo ainda ancora no zero financeiro', () => {
    expect(dailyBalanceDomain([50000, 50000, 50000])).toEqual({
      minDomain: 0,
      maxDomain: 50000,
    });
  });

  it('E) somente zero', () => {
    expect(dailyBalanceDomain([0, 0])).toEqual({ minDomain: 0, maxDomain: 0 });
  });
});

describe('dailyBalanceValueToY', () => {
  it('A) positivos ficam acima do zero da faixa', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([46925, 100000, 200000]);
    const zeroY = yOf(0, minDomain, maxDomain);
    expect(yOf(46925, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(100000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(200000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(200000, minDomain, maxDomain)).toBeLessThan(yOf(46925, minDomain, maxDomain));
  });

  it('B) negativo fica abaixo do zero', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([-10000]);
    expect(yOf(-10000, minDomain, maxDomain)).toBeGreaterThan(yOf(0, minDomain, maxDomain));
  });

  it('C) cruzamento: positivo acima, zero na referência, negativo abaixo', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([50000, 10000, 0, -5000, 20000]);
    const zeroY = yOf(0, minDomain, maxDomain);
    expect(yOf(50000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(10000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(20000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(0, minDomain, maxDomain)).toBe(zeroY);
    expect(yOf(-5000, minDomain, maxDomain)).toBeGreaterThan(zeroY);
  });

  it('D) constante positivo: pontos iguais e acima do zero', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([50000, 50000, 50000]);
    const zeroY = yOf(0, minDomain, maxDomain);
    const y = yOf(50000, minDomain, maxDomain);
    expect(y).toBeLessThan(zeroY);
    expect(y).toBe(yOf(50000, minDomain, maxDomain));
    expect(y).toBeGreaterThanOrEqual(PAD);
    expect(zeroY).toBeLessThanOrEqual(HEIGHT - PAD);
  });

  it('E) saldo zero coincide com a referência', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([50000, 0, -2000]);
    expect(yOf(0, minDomain, maxDomain)).toBe(yOf(0, minDomain, maxDomain));
    expect(yOf(0, minDomain, maxDomain)).toBeGreaterThan(yOf(50000, minDomain, maxDomain));
    expect(yOf(0, minDomain, maxDomain)).toBeLessThan(yOf(-2000, minDomain, maxDomain));
  });

  it('não usa [min,max] sem zero: 45 mil não vira o chão', () => {
    const { minDomain, maxDomain } = dailyBalanceDomain([45000, 48000]);
    expect(minDomain).toBe(0);
    expect(maxDomain).toBe(48000);
    const zeroY = yOf(0, minDomain, maxDomain);
    const floorIfMinMax = yOf(45000, 45000, 48000);
    expect(yOf(45000, minDomain, maxDomain)).toBeLessThan(zeroY);
    expect(yOf(45000, minDomain, maxDomain)).not.toBe(floorIfMinMax);
  });
});

describe('dailyBalanceBandGeometry', () => {
  const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
  const slot = 320 / dates.length;

  it('alinha X ao mesmo slot/índice das barras', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '46925.20'],
        ['2026-08-02', '100000'],
        ['2026-08-03', '200000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.points.map((point) => point.x)).toEqual([
      0 * slot + slot / 2,
      1 * slot + slot / 2,
      2 * slot + slot / 2,
    ]);
  });

  it('A) nenhum positivo fica abaixo do zero da faixa', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '46925'],
        ['2026-08-02', '100000'],
        ['2026-08-03', '200000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    for (const point of geometry!.points) {
      expect(point.value).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(geometry!.zeroY);
    }
  });

  it('B) ponto negativo fica abaixo do zero', () => {
    const geometry = dailyBalanceBandGeometry(dates, new Map([['2026-08-02', '-10000']]), slot);
    expect(geometry).not.toBeNull();
    expect(geometry!.points[0]!.y).toBeGreaterThan(geometry!.zeroY);
  });

  it('C) linha cruza o zero conforme os valores reais', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '50000'],
        ['2026-08-02', '10000'],
        ['2026-08-03', '0'],
        ['2026-08-04', '-5000'],
        ['2026-08-05', '20000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    const byIndex = new Map(geometry!.points.map((point) => [point.index, point]));
    expect(byIndex.get(0)!.y).toBeLessThan(geometry!.zeroY);
    expect(byIndex.get(1)!.y).toBeLessThan(geometry!.zeroY);
    expect(byIndex.get(2)!.y).toBe(geometry!.zeroY);
    expect(byIndex.get(3)!.y).toBeGreaterThan(geometry!.zeroY);
    expect(byIndex.get(4)!.y).toBeLessThan(geometry!.zeroY);
    expect(geometry!.segments).toHaveLength(1);
    expect(geometry!.segments[0]!.split(' ')).toHaveLength(5);
  });

  it('D) constante positivo é estável e legível', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '50000'],
        ['2026-08-02', '50000'],
        ['2026-08-03', '50000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    const ys = geometry!.points.map((point) => point.y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeLessThan(geometry!.zeroY);
    expect(ys[0]).toBeGreaterThanOrEqual(PAD);
    expect(ys[0]).toBeLessThan(HEIGHT / 2);
  });

  it('E) saldo zero cai na referência', () => {
    const geometry = dailyBalanceBandGeometry(dates, new Map([['2026-08-03', '0']]), slot);
    expect(geometry).not.toBeNull();
    expect(geometry!.points[0]!.y).toBe(geometry!.zeroY);
  });

  it('F) gap não vira zero e não une segmentos', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '10000'],
        ['2026-08-03', '20000'],
        ['2026-08-05', '15000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.points).toHaveLength(3);
    expect(geometry!.points.map((point) => point.index)).toEqual([0, 2, 4]);
    expect(geometry!.points.every((point) => point.value !== 0)).toBe(true);
    expect(geometry!.segments).toEqual([]);
  });

  it('F) segmentos consecutivos ligam; gap quebra a polyline', () => {
    const geometry = dailyBalanceBandGeometry(
      dates,
      new Map([
        ['2026-08-01', '10000'],
        ['2026-08-02', '12000'],
        ['2026-08-04', '8000'],
        ['2026-08-05', '9000'],
      ]),
      slot,
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.segments).toHaveLength(2);
    expect(geometry!.segments[0]!.split(' ')).toHaveLength(2);
    expect(geometry!.segments[1]!.split(' ')).toHaveLength(2);
  });

  it('mapa sem sobreposição com as datas não reserva faixa', () => {
    expect(dailyBalanceBandGeometry(dates, new Map([['2026-07-31', '1000']]), slot)).toBeNull();
    expect(dailyBalanceBandGeometry(dates, new Map(), slot)).toBeNull();
  });

  it('28 dias usam o mesmo slot do gráfico de movimentação', () => {
    const feb = Array.from({ length: 28 }, (_, index) => `2026-02-${String(index + 1).padStart(2, '0')}`);
    const febSlot = 320 / feb.length;
    const geometry = dailyBalanceBandGeometry(feb, new Map([['2026-02-14', '1000']]), febSlot);
    expect(geometry).not.toBeNull();
    expect(geometry!.points[0]!.x).toBe(13 * febSlot + febSlot / 2);
  });
});
