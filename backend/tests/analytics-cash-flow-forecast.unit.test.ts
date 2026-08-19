import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { calculateCashFlowForecast } from '../src/modules/analytics/domain/cash-flow-forecast.js';
import { addCivilDays } from '../src/modules/analytics/domain/civil-calendar.js';

const from = new Date('2026-08-19T00:00:00.000Z');
const to = addCivilDays(from, 90);

function row(dueDate: string, unpaid: string) {
  return {
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    unpaid: new Prisma.Decimal(unpaid),
  };
}

function bucket(forecast: ReturnType<typeof calculateCashFlowForecast>, key: string) {
  const found = forecast.buckets.find((item) => item.key === key);
  expect(found).toBeDefined();
  return found!;
}

describe('calculateCashFlowForecast', () => {
  it('sem títulos ainda devolve meses do horizonte zerados', () => {
    const forecast = calculateCashFlowForecast([], [], from, to);
    expect(forecast.horizonDays).toBe(90);
    expect(forecast.to.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(forecast.buckets.map((item) => item.key)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    for (const item of forecast.buckets) {
      expect(item.inflows.equals(0)).toBe(true);
      expect(item.outflows.equals(0)).toBe(true);
      expect(item.net.equals(0)).toBe(true);
    }
  });

  it('soma só AR no mês e deixa meses vazios presentes', () => {
    const forecast = calculateCashFlowForecast([row('2026-09-01', '10')], [], from, to);
    expect(bucket(forecast, '2026-09').inflows.equals(10)).toBe(true);
    expect(bucket(forecast, '2026-10').inflows.equals(0)).toBe(true);
    expect(bucket(forecast, '2026-09').net.equals(10)).toBe(true);
  });

  it('soma só AP e produz net negativo', () => {
    const forecast = calculateCashFlowForecast([], [row('2026-09-10', '7')], from, to);
    expect(bucket(forecast, '2026-09').outflows.equals(7)).toBe(true);
    expect(bucket(forecast, '2026-09').net.equals(-7)).toBe(true);
  });

  it('AR e AP no mesmo mês: net = inflows - outflows, sem acúmulo', () => {
    const forecast = calculateCashFlowForecast(
      [row('2026-09-01', '10'), row('2026-10-01', '4')],
      [row('2026-09-15', '3'), row('2026-10-02', '4')],
      from,
      to,
    );
    expect(bucket(forecast, '2026-09').net.equals(7)).toBe(true);
    expect(bucket(forecast, '2026-10').net.equals(0)).toBe(true);
    expect(bucket(forecast, '2026-11').net.equals(0)).toBe(true);
  });

  it('inclui hoje e o dia 90; exclui o dia 91 e o passado', () => {
    const forecast = calculateCashFlowForecast(
      [
        row('2026-08-18', '99'),
        row('2026-08-19', '1.10'),
        row('2026-11-17', '2.20'),
        row('2026-11-18', '88'),
      ],
      [],
      from,
      to,
    );
    expect(bucket(forecast, '2026-08').inflows.equals(new Prisma.Decimal('1.10'))).toBe(true);
    expect(bucket(forecast, '2026-11').inflows.equals(new Prisma.Decimal('2.20'))).toBe(true);
  });

  it('primeiro e último mês são parciais', () => {
    const forecast = calculateCashFlowForecast(
      [
        row('2026-08-01', '5'),
        row('2026-08-19', '6'),
        row('2026-11-17', '7'),
        row('2026-11-30', '8'),
      ],
      [],
      from,
      to,
    );
    expect(bucket(forecast, '2026-08').inflows.equals(6)).toBe(true);
    expect(bucket(forecast, '2026-11').inflows.equals(7)).toBe(true);
  });

  it('virada de ano ordena YYYY-MM crescente', () => {
    const start = new Date('2026-12-20T00:00:00.000Z');
    const end = addCivilDays(start, 90);
    const forecast = calculateCashFlowForecast(
      [row('2026-12-31', '1'), row('2027-01-02', '2')],
      [row('2027-03-20', '3')],
      start,
      end,
    );
    expect(forecast.buckets.map((item) => item.key)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
    expect(bucket(forecast, '2026-12').inflows.equals(1)).toBe(true);
    expect(bucket(forecast, '2027-01').inflows.equals(2)).toBe(true);
    expect(bucket(forecast, '2027-02').outflows.equals(0)).toBe(true);
    expect(bucket(forecast, '2027-03').net.equals(-3)).toBe(true);
  });
});
