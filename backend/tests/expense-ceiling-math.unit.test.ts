import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { monthlyExpenses } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import {
  calculateExpenseCeilingProgress,
  parseExpenseCeilingAmount,
} from '../src/modules/dashboard/domain/expense-ceiling-math.js';
import { parseDashboardExpenseCeilingBody } from '../src/modules/dashboard/http/parse-dashboard-expense-ceiling-body.js';
import { ValidationError } from '../src/shared/errors/application-error.js';

const REFERENCE = '2026-09';

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe('monthlyExpenses', () => {
  it('soma saídas realizadas e a pagar no prazo', () => {
    const total = monthlyExpenses({
      realized: { outflows: money('80000') },
      expected: { payables: money('20000') },
    });
    expect(total?.equals(money('100000'))).toBe(true);
  });

  it('zero explícito permanece zero', () => {
    const total = monthlyExpenses({
      realized: { outflows: money('0') },
      expected: { payables: money('0') },
    });
    expect(total?.equals(0)).toBe(true);
  });

  it('null em qualquer parcela permanece indisponível', () => {
    expect(
      monthlyExpenses({
        realized: { outflows: null },
        expected: { payables: money('10') },
      }),
    ).toBeNull();
    expect(
      monthlyExpenses({
        realized: { outflows: money('10') },
        expected: { payables: null },
      }),
    ).toBeNull();
  });
});

describe('calculateExpenseCeilingProgress', () => {
  it('sem teto não calcula consumo', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-09',
      ceiling: null,
      monthlyExpenses: money('80'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('NO_TARGET');
    expect(progress.consumedRate).toBeNull();
    expect(progress.available).toBeNull();
    expect(progress.exceeded).toBeNull();
  });

  it('mês atual abaixo fica dentro do teto', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-09',
      ceiling: money('100'),
      monthlyExpenses: money('80'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('IN_PROGRESS');
    expect(progress.consumedRate?.equals(80)).toBe(true);
    expect(progress.available?.equals(20)).toBe(true);
    expect(progress.exceeded?.equals(0)).toBe(true);
  });

  it('igualdade exata é teto atingido', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-09',
      ceiling: money('100.0000'),
      monthlyExpenses: money('100'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('ACHIEVED');
    expect(progress.consumedRate?.equals(100)).toBe(true);
  });

  it('acima ultrapassa no mês atual', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-09',
      ceiling: money('100'),
      monthlyExpenses: money('115'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('EXCEEDED');
    expect(progress.exceeded?.equals(15)).toBe(true);
    expect(progress.available?.equals(0)).toBe(true);
    expect(progress.consumedRate?.equals(115)).toBe(true);
  });

  it('mês futuro não julga o consumo', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-10',
      ceiling: money('100'),
      monthlyExpenses: money('140'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('PLANNED');
    expect(progress.consumedRate).toBeNull();
    expect(progress.exceeded).toBeNull();
  });

  it('mês passado abaixo não é fracasso', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-08',
      ceiling: money('100'),
      monthlyExpenses: money('40'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('CONTAINED');
    expect(progress.status).not.toBe('NOT_ACHIEVED');
    expect(progress.available?.equals(60)).toBe(true);
  });

  it('mês passado acima continua ultrapassado', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-08',
      ceiling: money('100'),
      monthlyExpenses: money('101'),
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('EXCEEDED');
  });

  it('despesa indisponível não vira zero', () => {
    const progress = calculateExpenseCeilingProgress({
      monthKey: '2026-09',
      ceiling: money('100'),
      monthlyExpenses: null,
      referenceMonthKey: REFERENCE,
    });
    expect(progress.status).toBe('UNAVAILABLE');
    expect(progress.monthlyExpenses).toBeNull();
    expect(progress.consumedRate).toBeNull();
    expect(progress.available).toBeNull();
    expect(progress.exceeded).toBeNull();
  });
});

describe('parseDashboardExpenseCeilingBody', () => {
  it('aceita decimal-string positivo', () => {
    const command = parseDashboardExpenseCeilingBody({ month: '2026-09', ceiling: '100000.5000' });
    expect(command.monthKey).toBe('2026-09');
    expect(command.ceilingAmount.equals('100000.5000')).toBe(true);
  });

  it('rejeita zero, negativo, número JSON, formato inválido e tenantId', () => {
    for (const ceiling of ['0', '0.0000', '-1', 100, '1,5', '100000.12345', '']) {
      expect(() => parseDashboardExpenseCeilingBody({ month: '2026-09', ceiling })).toThrow(
        ValidationError,
      );
    }
    expect(() =>
      parseDashboardExpenseCeilingBody({ month: '2026-09', ceiling: '10', tenantId: 'x' }),
    ).toThrow(ValidationError);
    expect(parseExpenseCeilingAmount(10)).toBeNull();
  });
});
