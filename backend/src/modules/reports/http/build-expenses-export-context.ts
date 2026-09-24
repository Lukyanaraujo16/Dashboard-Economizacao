import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { DashboardSituation } from '../../analytics/domain/dashboard-home-filters.js';
import type { FileStorage } from '../../../infrastructure/storage/file-storage.js';
import { resolveOperationalTenantId } from '../../dashboard/domain/operational-tenant.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PlatformBrandingRepository } from '../../branding/repositories/platform-branding.repository.js';
import type { TenantBrandingRepository } from '../../branding/repositories/tenant-branding.repository.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { ExpensesReportResponse } from '../domain/types.js';
import { resolveReportPdfBranding } from '../exporters/report-pdf-branding.js';
import type { ReportExportCashDetailsBundle } from '../exporters/report-export-cash-details.js';
import {
  situationFilterLabel,
  type ExpensesExportContext,
} from '../exporters/expenses-export-presentation.js';

export async function buildExpensesExportContext(input: {
  readonly auth: AuthenticatedRequestContext;
  readonly report: ExpensesReportResponse;
  readonly generatedAt: Date;
  readonly costCenterId: string | null;
  readonly situation: DashboardSituation | null;
  readonly categoryId: string | null;
  readonly tenants: TenantRepository;
  readonly costCenters: CostCenterReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  readonly tenantBranding: TenantBrandingRepository;
  readonly platformBranding: PlatformBrandingRepository;
  readonly storage: FileStorage;
  readonly cashDetails?: ReportExportCashDetailsBundle;
}): Promise<ExpensesExportContext> {
  const tenantId = resolveOperationalTenantId(input.auth);
  const tenant = tenantId === null ? null : await input.tenants.findById(tenantId);
  const companyName = tenant?.displayName.trim() || 'Empresa';

  const costCenterName =
    tenantId !== null && input.costCenterId !== null
      ? (await input.costCenters.findByIdForTenant(tenantId, input.costCenterId))?.name
      : null;
  const categoryName =
    tenantId !== null && input.categoryId !== null
      ? (await input.categories.findByIdForTenant(tenantId, input.categoryId))?.name
      : null;

  const pdfBranding = await resolveReportPdfBranding({
    tenantId,
    tenantBranding: input.tenantBranding,
    platformBranding: input.platformBranding,
    storage: input.storage,
  });

  return {
    report: input.report,
    companyName,
    generatedAt: input.generatedAt,
    filters: {
      costCenter: input.costCenterId === null ? 'Todos' : (costCenterName?.trim() || 'Centro selecionado'),
      situation: situationFilterLabel(input.situation ?? ''),
      category: input.categoryId === null ? 'Todas' : (categoryName?.trim() || 'Categoria selecionada'),
    },
    pdfBranding,
    ...(input.cashDetails === undefined ? {} : { cashDetails: input.cashDetails }),
  };
}
