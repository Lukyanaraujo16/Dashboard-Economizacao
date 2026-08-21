import { describe, expect, it } from 'vitest';

import { ValidationError } from '../src/shared/errors/application-error.js';
import { parseDashboardCostCenterQuery } from '../src/modules/dashboard/http/parse-dashboard-cost-center-query.js';

describe('parseDashboardCostCenterQuery', () => {
  it('ausente ou vazio retorna null', () => {
    expect(parseDashboardCostCenterQuery({})).toBeNull();
    expect(parseDashboardCostCenterQuery(undefined)).toBeNull();
    expect(parseDashboardCostCenterQuery({ costCenter: '' })).toBeNull();
  });

  it('aceita uuid válido', () => {
    expect(parseDashboardCostCenterQuery({ costCenter: '8cf7b841-7d8c-4166-b24b-5f350e0d5403' })).toBe(
      '8cf7b841-7d8c-4166-b24b-5f350e0d5403',
    );
  });

  it('rejeita uuid inválido', () => {
    expect(() => parseDashboardCostCenterQuery({ costCenter: 'not-a-uuid' })).toThrow(ValidationError);
    expect(() => parseDashboardCostCenterQuery({ costCenter: 1 })).toThrow(ValidationError);
  });
});
