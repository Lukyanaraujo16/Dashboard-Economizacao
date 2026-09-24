import { AdvisorDomainError } from '../domain/advisor-domain-error.js';

export function assertAdvisorTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new AdvisorDomainError(
      'TENANT_ID_REQUIRED',
      'tenantId é obrigatório nas operações do Consultor.',
    );
  }
}
