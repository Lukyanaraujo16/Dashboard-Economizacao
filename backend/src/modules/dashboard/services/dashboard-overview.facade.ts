import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { ContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { ForbiddenError } from '../../../shared/errors/application-error.js';
import { resolveOperationalTenantId } from '../domain/operational-tenant.js';
import type { DashboardOverviewResponse } from '../domain/types.js';
import { toDashboardOverviewResponse } from '../http/to-dashboard-overview-response.js';

export type DashboardOverviewFacade = {
  getOverview(auth: AuthenticatedRequestContext): Promise<DashboardOverviewResponse>;
};

export type DashboardOverviewFacadeDependencies = {
  readonly analytics: AnalyticsService;
  readonly integrations: ContaAzulIntegrationRepository;
};

export function createDashboardOverviewFacade(
  deps: DashboardOverviewFacadeDependencies,
): DashboardOverviewFacade {
  return {
    async getOverview(auth) {
      const tenantId = resolveOperationalTenantId(auth);
      if (tenantId === null) {
        throw new ForbiddenError('Sem contexto de empresa para a Dashboard.');
      }
      const [snapshot, integration] = await Promise.all([
        deps.analytics.getFinancialStockSnapshot({ tenantId }),
        deps.integrations.findPublicByTenantId(tenantId),
      ]);
      return toDashboardOverviewResponse(snapshot, integration);
    },
  };
}
