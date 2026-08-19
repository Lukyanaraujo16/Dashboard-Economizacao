import { describe, expect, it } from 'vitest';

import { ValidationError } from '../src/shared/errors/application-error.js';
import { assertNoTenantIdQuery } from '../src/modules/dashboard/http/assert-no-tenant-id-query.js';

describe('assertNoTenantIdQuery', () => {
  it('aceita query vazia ou sem tenantId', () => {
    expect(() => assertNoTenantIdQuery(undefined)).not.toThrow();
    expect(() => assertNoTenantIdQuery({})).not.toThrow();
    expect(() => assertNoTenantIdQuery({ foo: 'bar' })).not.toThrow();
  });

  it('rejeita tenantId explícito', () => {
    expect(() => assertNoTenantIdQuery({ tenantId: 'other' })).toThrow(ValidationError);
  });
});
