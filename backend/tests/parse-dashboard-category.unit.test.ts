import { describe, expect, it } from 'vitest';

import { parseDashboardCategoryQuery } from '../src/modules/dashboard/http/parse-dashboard-category-query.js';
import { ValidationError } from '../src/shared/errors/application-error.js';

describe('parseDashboardCategoryQuery', () => {
  it('ausente ou vazio retorna null', () => {
    expect(parseDashboardCategoryQuery({})).toBeNull();
    expect(parseDashboardCategoryQuery(undefined)).toBeNull();
    expect(parseDashboardCategoryQuery({ category: '' })).toBeNull();
  });

  it('aceita uuid válido', () => {
    expect(parseDashboardCategoryQuery({ category: '8cf7b841-7d8c-4166-b24b-5f350e0d5403' })).toBe(
      '8cf7b841-7d8c-4166-b24b-5f350e0d5403',
    );
  });

  it('rejeita uuid inválido', () => {
    expect(() => parseDashboardCategoryQuery({ category: 'not-a-uuid' })).toThrow(ValidationError);
    expect(() => parseDashboardCategoryQuery({ category: 1 })).toThrow(ValidationError);
  });
});
