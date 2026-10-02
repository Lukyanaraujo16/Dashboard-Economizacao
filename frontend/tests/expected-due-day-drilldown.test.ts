import { describe, expect, it } from 'vitest';

import {
  expectedDueDayAmountsReconcile,
  expectedDueDayChartAmount,
  sumExpectedDueDayAmounts,
  titlesComposingExpectedDueDay,
  type ExpectedDueDayTitle,
} from '../src/components/dashboard/expected-due-day-drilldown';

type Title = ExpectedDueDayTitle & {
  readonly id: string;
  readonly companyId: string;
};

function title(
  input: Partial<Title> & Pick<Title, 'id' | 'dueDate' | 'amount' | 'situation'>,
): Title {
  return {
    companyId: 'company-a',
    ...input,
  };
}

const receivables: readonly Title[] = [
  title({ id: 'a1', dueDate: '2026-10-10', amount: '100.50', situation: 'UPCOMING' }),
  title({ id: 'a2', dueDate: '2026-10-10', amount: '49.50', situation: 'UPCOMING' }),
  title({ id: 'a3', dueDate: '2026-10-11', amount: '10.00', situation: 'UPCOMING' }),
  title({ id: 'overdue', dueDate: '2026-10-01', amount: '80.00', situation: 'OVERDUE' }),
  title({ id: 'zero-day-overdue', dueDate: '2026-10-12', amount: '5.00', situation: 'OVERDUE' }),
];

const payables: readonly Title[] = [
  title({ id: 'p1', dueDate: '2026-10-10', amount: '70.25', situation: 'DUE_TODAY', companyId: 'company-a' }),
  title({ id: 'p2', dueDate: '2026-10-10', amount: '29.75', situation: 'UPCOMING', companyId: 'company-a' }),
  title({ id: 'p3', dueDate: '2026-10-11', amount: '8.00', situation: 'UPCOMING' }),
  title({ id: 'p-overdue', dueDate: '2026-10-01', amount: '12.00', situation: 'OVERDUE' }),
];

const otherCompany: readonly Title[] = [
  title({
    id: 'foreign',
    companyId: 'company-b',
    dueDate: '2026-10-10',
    amount: '999.00',
    situation: 'UPCOMING',
  }),
];

describe('drill-down diário de A receber', () => {
  it('soma os títulos em aberto do dia e deixa de fora outro dia e o vencido', () => {
    const day = titlesComposingExpectedDueDay(receivables, '2026-10-10');
    expect(day.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(day.every((item) => item.dueDate === '2026-10-10')).toBe(true);
    const total = sumExpectedDueDayAmounts(day);
    expect(total).toBe('150.00');
    expect(expectedDueDayAmountsReconcile(total, '150.00')).toBe(true);
    expect(expectedDueDayAmountsReconcile(total, '150')).toBe(true);
  });

  it('dia zerado no gráfico não inclui vencido e reconcilia com zero', () => {
    const day = titlesComposingExpectedDueDay(receivables, '2026-10-12');
    expect(day).toEqual([]);
    const total = sumExpectedDueDayAmounts(day);
    expect(total).toBe('0.00');
    expect(expectedDueDayAmountsReconcile(total, '0.00')).toBe(true);
    expect(expectedDueDayAmountsReconcile(total, '0')).toBe(true);
  });

  it('ausência do ponto não vira zero', () => {
    expect(expectedDueDayChartAmount([{ date: '2026-10-10', amount: '150.00' }], '2026-10-09')).toBe(
      null,
    );
    expect(expectedDueDayChartAmount(undefined, '2026-10-10')).toBe(null);
  });

  it('dueDate civil 2026-10-10 permanece no dia 10', () => {
    const shifted = titlesComposingExpectedDueDay(receivables, '2026-10-09');
    expect(shifted).toEqual([]);
    const sameDay = titlesComposingExpectedDueDay(
      [title({ id: 'civil', dueDate: '2026-10-10', amount: '1.00', situation: 'UPCOMING' })],
      '2026-10-10',
    );
    expect(sameDay.map((item) => item.dueDate)).toEqual(['2026-10-10']);
  });

  it('não mistura títulos de outra empresa', () => {
    const scoped = receivables.filter((item) => item.companyId === 'company-a');
    const day = titlesComposingExpectedDueDay(scoped, '2026-10-10');
    expect(day.some((item) => item.id === 'foreign')).toBe(false);
    expect(titlesComposingExpectedDueDay(otherCompany, '2026-10-10').map((item) => item.id)).toEqual([
      'foreign',
    ]);
  });
});

describe('drill-down diário de Contas a pagar', () => {
  it('soma os títulos em aberto do dia e deixa de fora outro dia e o vencido', () => {
    const day = titlesComposingExpectedDueDay(payables, '2026-10-10');
    expect(day.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(day.every((item) => item.dueDate === '2026-10-10')).toBe(true);
    const total = sumExpectedDueDayAmounts(day);
    expect(total).toBe('100.00');
    expect(expectedDueDayAmountsReconcile(total, '100.00')).toBe(true);
  });

  it('dia zerado reconcilia com zero e ausência permanece null', () => {
    expect(sumExpectedDueDayAmounts(titlesComposingExpectedDueDay(payables, '2026-10-12'))).toBe(
      '0.00',
    );
    expect(expectedDueDayChartAmount([{ date: '2026-10-10', amount: '100.00' }], '2026-10-12')).toBe(
      null,
    );
  });

  it('dueDate civil não muda de dia', () => {
    expect(titlesComposingExpectedDueDay(payables, '2026-10-09')).toEqual([]);
    expect(titlesComposingExpectedDueDay(payables, '2026-10-10').every((item) => item.dueDate === '2026-10-10')).toBe(
      true,
    );
  });

  it('não mistura títulos de outra empresa', () => {
    const scoped = payables.filter((item) => item.companyId === 'company-a');
    expect(titlesComposingExpectedDueDay(scoped, '2026-10-10').some((item) => item.companyId === 'company-b')).toBe(
      false,
    );
  });
});
