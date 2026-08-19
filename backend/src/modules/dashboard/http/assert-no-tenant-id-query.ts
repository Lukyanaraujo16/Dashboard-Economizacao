import { ValidationError } from '../../../shared/errors/application-error.js';

export function assertNoTenantIdQuery(query: unknown): void {
  if (query !== null && typeof query === 'object' && !Array.isArray(query) && 'tenantId' in query) {
    throw new ValidationError('tenantId não é aceito nesta rota.', {
      httpStatus: 400,
      details: [{ field: 'tenantId', issue: 'not_allowed' }],
    });
  }
}
