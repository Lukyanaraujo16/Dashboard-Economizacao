import { describe, expect, it } from 'vitest';

import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';
import { assertCanAdministerProactiveTriggers, assertCanMarkInsightRead } from '../src/modules/advisor/domain/proactive-trigger-access.js';
import {
  buildProactiveOccurrenceKey,
  CERTIFIED_PROACTIVE_TRIGGER_TYPES,
  parseProactiveTriggerParameters,
  PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS,
  PROACTIVE_TRIGGER_TYPES,
} from '../src/modules/advisor/domain/proactive-trigger-catalog.js';

function codeOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AdvisorDomainError) {
      return error.code;
    }
    throw error;
  }
  throw new Error('esperava rejeição');
}

describe('catálogo certificado de gatilhos', () => {
  it('publica somente os quatro tipos do primeiro lote', () => {
    expect(CERTIFIED_PROACTIVE_TRIGGER_TYPES.map((item) => item.type)).toEqual([
      ...PROACTIVE_TRIGGER_TYPES,
    ]);
    expect(PROACTIVE_TRIGGER_TYPES).not.toContain('DELINQUENCY_GROWTH');
  });

  it('rejeita tipo desconhecido e parâmetro fora do contrato', () => {
    expect(codeOf(() => parseProactiveTriggerParameters('SQL', {}))).toBe('TRIGGER_TYPE_UNKNOWN');
    expect(
      codeOf(() => parseProactiveTriggerParameters('REVENUE_GOAL_PERCENTAGE', { percentage: 80, sql: '1' })),
    ).toBe('TRIGGER_PARAMETER_UNKNOWN');
    expect(
      codeOf(() => parseProactiveTriggerParameters('EXPENSE_CEILING_EXCEEDED', { percentage: 1 })),
    ).toBe('TRIGGER_PARAMETER_UNKNOWN');
  });

  it('aceita percentual inteiro de 1 a 100 e rejeita o resto', () => {
    expect(parseProactiveTriggerParameters('REVENUE_GOAL_PERCENTAGE', { percentage: 80 }).parameterKey).toBe(
      'percentage:80',
    );
    expect(parseProactiveTriggerParameters('EXPENSE_CEILING_PERCENTAGE', { percentage: 100 }).percentage).toBe(
      100,
    );
    for (const percentage of [0, 101, 80.5, -1, '80']) {
      expect(
        codeOf(() => parseProactiveTriggerParameters('REVENUE_GOAL_PERCENTAGE', { percentage })),
      ).toBe('TRIGGER_PERCENTAGE_INVALID');
    }
  });

  it('valida daysAhead, minimumAmount e kind', () => {
    const parsed = parseProactiveTriggerParameters('TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    });
    expect(parsed.parameterKey).toBe('daysAhead:3|kind:PAYABLE|minimumAmount:5000.0000');
    expect(codeOf(() => parseProactiveTriggerParameters('TITLE_DUE_SOON', {
      daysAhead: 0,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    }))).toBe('TRIGGER_DAYS_AHEAD_INVALID');
    expect(codeOf(() => parseProactiveTriggerParameters('TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '0',
      titleKind: 'PAYABLE',
    }))).toBe('TRIGGER_MINIMUM_AMOUNT_INVALID');
    expect(codeOf(() => parseProactiveTriggerParameters('TITLE_DUE_SOON', {
      daysAhead: 3,
      minimumAmount: '10',
      titleKind: 'CLIENTE',
    }))).toBe('TRIGGER_TITLE_KIND_INVALID');
  });

  it('separa identidade por configuração, período, sujeito e parâmetros', () => {
    const base = {
      configurationId: 'cfg-1',
      periodKey: '2026-10',
      subjectKey: '',
      parameterKey: 'percentage:80',
    };
    expect(buildProactiveOccurrenceKey(base)).not.toBe(
      buildProactiveOccurrenceKey({ ...base, periodKey: '2026-11' }),
    );
    expect(buildProactiveOccurrenceKey(base)).not.toBe(
      buildProactiveOccurrenceKey({ ...base, configurationId: 'cfg-2' }),
    );
    expect(buildProactiveOccurrenceKey(base)).not.toBe(
      buildProactiveOccurrenceKey({ ...base, parameterKey: 'percentage:90' }),
    );
    expect(
      buildProactiveOccurrenceKey({
        configurationId: 'cfg-1',
        periodKey: '2026-10-03',
        subjectKey: 'PAYABLE:titulo-a',
        parameterKey: 'daysAhead:3|kind:PAYABLE|minimumAmount:5000.0000',
      }),
    ).not.toBe(
      buildProactiveOccurrenceKey({
        configurationId: 'cfg-1',
        periodKey: '2026-10-03',
        subjectKey: 'RECEIVABLE:titulo-a',
        parameterKey: 'daysAhead:3|kind:RECEIVABLE|minimumAmount:5000.0000',
      }),
    );
  });

  it('mantém sugestões fora de qualquer tenant', () => {
    expect(PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS.revenueGoalPercentages).toEqual([80, 90, 100]);
    expect(PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS.expenseCeilingPercentages).toEqual([80, 90, 100]);
    expect(PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS.titleDueSoon.daysAhead).toBe(3);
    expect(PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS.titleDueSoon.minimumAmount).toBe('5000');
  });

  it('nega administração a USER e ao modo suporte, e nega leitura ao suporte', () => {
    expect(
      codeOf(() => assertCanAdministerProactiveTriggers({ role: 'USER', supportSession: false })),
    ).toBe('TRIGGER_ADMIN_FORBIDDEN');
    expect(
      codeOf(() =>
        assertCanAdministerProactiveTriggers({ role: 'SUPER_ADMIN', supportSession: true }),
      ),
    ).toBe('SUPPORT_CANNOT_ADMINISTER_TRIGGERS');
    expect(
      codeOf(() => assertCanMarkInsightRead({ role: 'ADMIN', supportSession: true })),
    ).toBe('SUPPORT_CANNOT_MARK_INSIGHT_READ');
    expect(() =>
      assertCanAdministerProactiveTriggers({ role: 'ADMIN', supportSession: false }),
    ).not.toThrow();
  });
});
