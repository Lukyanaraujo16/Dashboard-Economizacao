import { describe, expect, it } from 'vitest';

import { parseDashboardSituationQuery } from '../src/modules/dashboard/http/parse-dashboard-situation-query.js';
import { ValidationError } from '../src/shared/errors/application-error.js';

describe('parseDashboardSituationQuery', () => {
  it('ausente ou vazio retorna null', () => {
    expect(parseDashboardSituationQuery({})).toBeNull();
    expect(parseDashboardSituationQuery(undefined)).toBeNull();
    expect(parseDashboardSituationQuery({ situation: '' })).toBeNull();
  });

  it('aceita settled, open e overdue', () => {
    expect(parseDashboardSituationQuery({ situation: 'settled' })).toBe('settled');
    expect(parseDashboardSituationQuery({ situation: 'open' })).toBe('open');
    expect(parseDashboardSituationQuery({ situation: 'overdue' })).toBe('overdue');
  });

  it('rejeita valor inválido, inclusive status persistido', () => {
    expect(() => parseDashboardSituationQuery({ situation: 'PAID' })).toThrow(ValidationError);
    expect(() => parseDashboardSituationQuery({ situation: 'OVERDUE' })).toThrow(ValidationError);
    expect(() => parseDashboardSituationQuery({ situation: 'all' })).toThrow(ValidationError);
    expect(() => parseDashboardSituationQuery({ situation: 1 })).toThrow(ValidationError);
  });

  it('ignora query status', () => {
    expect(parseDashboardSituationQuery({ status: 'PAID' })).toBeNull();
  });
});
