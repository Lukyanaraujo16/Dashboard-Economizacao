import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { createDashboardOverviewFacade } from '../../dashboard/services/dashboard-overview.facade.js';
import { createRevenueGoalRepository } from '../../dashboard/repositories/revenue-goal.repository.js';
import { createTenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { assertNoTenantIdQuery } from '../../dashboard/http/assert-no-tenant-id-query.js';
import { parseDashboardCategoryQuery } from '../../dashboard/http/parse-dashboard-category-query.js';
import { parseDashboardCostCenterQuery } from '../../dashboard/http/parse-dashboard-cost-center-query.js';
import { parseDashboardSituationQuery } from '../../dashboard/http/parse-dashboard-situation-query.js';
import { parseReportMonthRange } from './parse-report-month-range.js';
import { parseReportExportFormat } from './parse-report-export-format.js';
import { buildRevenueExportContext } from './build-revenue-export-context.js';
import {
  PDF_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from '../exporters/export-content-types.js';
import { buildExpensesExportContext } from './build-expenses-export-context.js';
import {
  buildExpensesExportFilename,
  buildRevenueExportFilename,
  expensesExportContentDisposition,
  revenueExportContentDisposition,
} from '../exporters/build-revenue-export-filename.js';
import { renderExpensesReportPdf } from '../exporters/expenses-pdf.exporter.js';
import { renderExpensesReportXlsx } from '../exporters/expenses-xlsx.exporter.js';
import { renderRevenueReportPdf } from '../exporters/revenue-pdf.exporter.js';
import { renderRevenueReportXlsx } from '../exporters/revenue-xlsx.exporter.js';

export async function registerReportsRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const costCenters = createCostCenterReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const dashboard = createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
      categories,
      costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
    }),
    integrations: createContaAzulIntegrationRepository(prisma),
    revenueGoals: createRevenueGoalRepository(prisma),
    costCenters,
    categories,
  });

  app.get('/reports/revenue', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const range = parseReportMonthRange(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const situation = parseDashboardSituationQuery(request.query);
    const categoryId = parseDashboardCategoryQuery(request.query);
    const format = parseReportExportFormat(request.query);
    const body = await dashboard.getRevenueReport(
      auth,
      range.from,
      range.to,
      costCenterId,
      situation,
      categoryId,
    );
    if (format === 'json') {
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    }

    const exportContext = await buildRevenueExportContext({
      auth,
      report: body,
      generatedAt: new Date(),
      costCenterId,
      situation,
      categoryId,
      tenants,
      costCenters,
      categories,
    });
    const filename = buildRevenueExportFilename(range.from, range.to, format);
    const file =
      format === 'pdf'
        ? await renderRevenueReportPdf(exportContext)
        : await renderRevenueReportXlsx(exportContext);
    return reply
      .status(200)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Type', format === 'pdf' ? PDF_CONTENT_TYPE : XLSX_CONTENT_TYPE)
      .header('Content-Disposition', revenueExportContentDisposition(filename))
      .send(file);
  });

  app.get('/reports/expenses', { preHandler: requireAuthentication }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const range = parseReportMonthRange(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const situation = parseDashboardSituationQuery(request.query);
    const categoryId = parseDashboardCategoryQuery(request.query);
    const format = parseReportExportFormat(request.query);
    const body = await dashboard.getExpensesReport(
      auth,
      range.from,
      range.to,
      costCenterId,
      situation,
      categoryId,
    );
    if (format === 'json') {
      return reply.status(200).header('Cache-Control', 'private, no-store').send(body);
    }

    const exportContext = await buildExpensesExportContext({
      auth,
      report: body,
      generatedAt: new Date(),
      costCenterId,
      situation,
      categoryId,
      tenants,
      costCenters,
      categories,
    });
    const filename = buildExpensesExportFilename(range.from, range.to, format);
    const file =
      format === 'pdf'
        ? await renderExpensesReportPdf(exportContext)
        : await renderExpensesReportXlsx(exportContext);
    return reply
      .status(200)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Type', format === 'pdf' ? PDF_CONTENT_TYPE : XLSX_CONTENT_TYPE)
      .header('Content-Disposition', expensesExportContentDisposition(filename))
      .send(file);
  });
}
