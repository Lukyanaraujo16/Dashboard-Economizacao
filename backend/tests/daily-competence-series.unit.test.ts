import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  accumulateDailyCompetence,
  buildDailyCompetenceTotals,
} from '../src/modules/analytics/domain/daily-competence-series.js';

describe('daily competence series', () => {
  it('agrupa total/paid/unpaid por competenceDate e preenche dias vazios', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-03T00:00:00.000Z');
    const points = buildDailyCompetenceTotals(
      [
        {
          competenceDate: new Date('2026-08-01T00:00:00.000Z'),
          total: new Prisma.Decimal('10'),
          paid: new Prisma.Decimal('4'),
          unpaid: new Prisma.Decimal('6'),
        },
        {
          competenceDate: new Date('2026-08-01T00:00:00.000Z'),
          total: new Prisma.Decimal('5.5'),
          paid: new Prisma.Decimal('5.5'),
          unpaid: new Prisma.Decimal('0'),
        },
        {
          competenceDate: new Date('2026-08-03T00:00:00.000Z'),
          total: new Prisma.Decimal('2'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('2'),
        },
        {
          competenceDate: null,
          total: new Prisma.Decimal('99'),
          paid: new Prisma.Decimal('99'),
          unpaid: new Prisma.Decimal('0'),
        },
      ],
      from,
      to,
    );
    expect(points).toHaveLength(3);
    expect(points[0]?.amount.toString()).toBe('15.5');
    expect(points[0]?.received.toString()).toBe('9.5');
    expect(points[0]?.outstanding.toString()).toBe('6');
    expect(points[1]?.amount.toString()).toBe('0');
    expect(points[1]?.received.toString()).toBe('0');
    expect(points[2]?.amount.toString()).toBe('2');
    expect(points[2]?.outstanding.toString()).toBe('2');
  });

  it('acumula amount sem alterar received/outstanding', () => {
    const points = [
      { date: new Date('2026-08-01T00:00:00.000Z'), amount: new Prisma.Decimal('10') },
      { date: new Date('2026-08-02T00:00:00.000Z'), amount: new Prisma.Decimal('5') },
    ];
    const accumulated = accumulateDailyCompetence(points);
    expect(accumulated[0]?.amount.toString()).toBe('10');
    expect(accumulated[1]?.amount.toString()).toBe('15');
  });
});
