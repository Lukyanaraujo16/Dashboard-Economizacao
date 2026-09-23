import { describe, expect, it } from 'vitest';

import {
  civilDaysOverdue,
  classifyInstallmentDueSituation,
  compareInstallmentDueSituation,
} from '../src/modules/analytics/domain/installment-due-situation.js';

const today = new Date('2026-09-23T00:00:00.000Z');

describe('classifyInstallmentDueSituation', () => {
  it('1 — dueDate ontem é OVERDUE', () => {
    expect(classifyInstallmentDueSituation(new Date('2026-09-22T00:00:00.000Z'), today)).toBe(
      'OVERDUE',
    );
  });

  it('2 — dueDate hoje é DUE_TODAY', () => {
    expect(classifyInstallmentDueSituation(today, today)).toBe('DUE_TODAY');
  });

  it('3 — dueDate amanhã é UPCOMING', () => {
    expect(classifyInstallmentDueSituation(new Date('2026-09-24T00:00:00.000Z'), today)).toBe(
      'UPCOMING',
    );
  });

  it('4 — mês anterior continua OVERDUE', () => {
    expect(classifyInstallmentDueSituation(new Date('2026-08-20T00:00:00.000Z'), today)).toBe(
      'OVERDUE',
    );
  });

  it('9 — 31/08 vencido consultado em setembro', () => {
    expect(
      classifyInstallmentDueSituation(
        new Date('2026-08-31T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ),
    ).toBe('OVERDUE');
  });

  it('10 — 31/12 vencido em janeiro', () => {
    expect(
      classifyInstallmentDueSituation(
        new Date('2026-12-31T00:00:00.000Z'),
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    ).toBe('OVERDUE');
  });
});

describe('civilDaysOverdue', () => {
  it('conta dias civis de atraso', () => {
    expect(civilDaysOverdue(new Date('2026-09-22T00:00:00.000Z'), today)).toBe(1);
    expect(civilDaysOverdue(new Date('2026-09-20T00:00:00.000Z'), today)).toBe(3);
    expect(civilDaysOverdue(today, today)).toBeNull();
    expect(civilDaysOverdue(new Date('2026-09-24T00:00:00.000Z'), today)).toBeNull();
  });
});

describe('compareInstallmentDueSituation', () => {
  it('ordena vencido antes de hoje e de a vencer', () => {
    expect(compareInstallmentDueSituation('OVERDUE', 'DUE_TODAY')).toBeLessThan(0);
    expect(compareInstallmentDueSituation('DUE_TODAY', 'UPCOMING')).toBeLessThan(0);
    expect(compareInstallmentDueSituation('OVERDUE', 'UPCOMING')).toBeLessThan(0);
  });
});
