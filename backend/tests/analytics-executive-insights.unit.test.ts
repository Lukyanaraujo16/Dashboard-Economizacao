import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  buildConcentrationInsight,
  buildPeakOutflowInsight,
  buildPressureWindowInsight,
} from '../src/modules/analytics/domain/executive-insights.js';
import {
  classifyOpenPayablesByCategory,
  presentOpenPayablesCategoryComposition,
} from '../src/modules/analytics/domain/payable-category-composition.js';
import { summarizeUpcomingWindow } from '../src/modules/analytics/domain/upcoming.js';

const ZERO = new Prisma.Decimal(0);

function money(value: string) {
  return { unpaid: new Prisma.Decimal(value) };
}

describe('buildPressureWindowInsight', () => {
  it('pagamentos maiores: difference absoluta e direction payable_exceeds', () => {
    const summary = summarizeUpcomingWindow([money('10.50')], [money('40.75')]);
    const insight = buildPressureWindowInsight(summary);
    expect(insight.nDays).toBe(30);
    expect(insight.receivable.toString()).toBe('10.5');
    expect(insight.payable.toString()).toBe('40.75');
    expect(insight.difference.toString()).toBe('30.25');
    expect(insight.direction).toBe('payable_exceeds');
  });

  it('recebimentos maiores: receivable_exceeds', () => {
    const insight = buildPressureWindowInsight(
      summarizeUpcomingWindow([money('80')], [money('20')]),
    );
    expect(insight.difference.toString()).toBe('60');
    expect(insight.direction).toBe('receivable_exceeds');
  });

  it('igualdade: balanced com difference zero', () => {
    const insight = buildPressureWindowInsight(
      summarizeUpcomingWindow([money('15.10')], [money('15.10')]),
    );
    expect(insight.difference.toString()).toBe('0');
    expect(insight.direction).toBe('balanced');
  });

  it('preserva Decimal em valores grandes', () => {
    const insight = buildPressureWindowInsight(
      summarizeUpcomingWindow([money('1075516.03')], [money('1.01')]),
    );
    expect(insight.difference.toString()).toBe('1075515.02');
    expect(insight.direction).toBe('receivable_exceeds');
  });
});

describe('buildConcentrationInsight (D8)', () => {
  it('escolhe a maior categoria precisa e percentual sobre o classificado', () => {
    const classified = classifyOpenPayablesByCategory(
      [
        {
          unpaid: new Prisma.Decimal('80'),
          status: 'OPEN',
          categoryExternalIds: ['salario'],
        },
        {
          unpaid: new Prisma.Decimal('20'),
          status: 'OPEN',
          categoryExternalIds: ['aluguel'],
        },
      ],
      [
        { externalId: 'salario', name: 'Salário Colaboradores', type: 'EXPENSE' },
        { externalId: 'aluguel', name: 'Aluguel', type: 'EXPENSE' },
      ],
    );
    const presented = presentOpenPayablesCategoryComposition(classified);
    const insight = buildConcentrationInsight({
      classified: presented.classified,
      buckets: presented.items,
    });
    expect(insight?.name).toBe('Salário Colaboradores');
    expect(insight?.amount.toString()).toBe('80');
    expect(insight?.percentage.toString()).toBe('80');
  });

  it('omite quando só há Sem classificação precisa', () => {
    const classified = classifyOpenPayablesByCategory(
      [
        {
          unpaid: new Prisma.Decimal('50'),
          status: 'OPEN',
          categoryExternalIds: ['a', 'b'],
        },
      ],
      [
        { externalId: 'a', name: 'A', type: 'EXPENSE' },
        { externalId: 'b', name: 'B', type: 'EXPENSE' },
      ],
    );
    const insight = buildConcentrationInsight({
      classified: classified.classified,
      buckets: classified.buckets,
    });
    expect(classified.imprecise.toString()).toBe('50');
    expect(insight).toBeNull();
  });

  it('omite quando não há categoria válida', () => {
    const classified = classifyOpenPayablesByCategory(
      [{ unpaid: new Prisma.Decimal('9'), status: 'OPEN', categoryExternalIds: [] }],
      [],
    );
    expect(
      buildConcentrationInsight({
        classified: classified.classified,
        buckets: classified.buckets,
      }),
    ).toBeNull();
  });

  it('não usa bucket Outras nem qualidade como categoria', () => {
    const insight = buildConcentrationInsight({
      classified: new Prisma.Decimal('10'),
      buckets: [
        { kind: 'other', name: 'Outras categorias', amount: new Prisma.Decimal('9') },
        { kind: 'category', name: 'Contabilidade', amount: new Prisma.Decimal('10') },
        { kind: 'uncategorized', name: 'Sem categoria', amount: new Prisma.Decimal('3') },
      ],
    });
    expect(insight?.name).toBe('Contabilidade');
    expect(insight?.percentage.toString()).toBe('100');
  });
});

describe('buildPeakOutflowInsight', () => {
  it('escolhe o maior outflow dos 90 dias', () => {
    const insight = buildPeakOutflowInsight([
      { key: '2026-08', outflows: new Prisma.Decimal('10') },
      { key: '2026-09', outflows: new Prisma.Decimal('40.5') },
      { key: '2026-10', outflows: new Prisma.Decimal('12') },
    ]);
    expect(insight?.monthKey).toBe('2026-09');
    expect(insight?.amount.toString()).toBe('40.5');
  });

  it('empate permanece no primeiro mês cronológico', () => {
    const insight = buildPeakOutflowInsight([
      { key: '2026-08', outflows: new Prisma.Decimal('25') },
      { key: '2026-09', outflows: new Prisma.Decimal('25') },
      { key: '2026-10', outflows: new Prisma.Decimal('10') },
    ]);
    expect(insight?.monthKey).toBe('2026-08');
    expect(insight?.amount.toString()).toBe('25');
  });

  it('omite quando todas as saídas são zero', () => {
    expect(
      buildPeakOutflowInsight([
        { key: '2026-08', outflows: ZERO },
        { key: '2026-09', outflows: ZERO },
      ]),
    ).toBeNull();
  });
});
