import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { loadEnvironment } from '../../../config/env.js';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createFileStorage } from '../../../infrastructure/storage/index.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '../../../shared/errors/application-error.js';
import { createAnalyticsService } from '../../analytics/services/analytics.service.js';
import { createMonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { createRequireAuthentication } from '../../auth/http/require-authentication.js';
import { createUserRepository } from '../../auth/repositories/user.repository.js';
import { createPlatformBrandingRepository } from '../../branding/repositories/platform-branding.repository.js';
import { createTenantBrandingRepository } from '../../branding/repositories/tenant-branding.repository.js';
import { createCostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { createLedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
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
import { resolveOperationalTenantId } from '../../dashboard/domain/operational-tenant.js';
import { createReportCashDetailsService } from '../services/report-cash-details.service.js';
import { parseReportDetailSituation } from './parse-report-detail-situation.js';
import { parseReportDetailsLimit, parseReportDetailsOffset } from './parse-report-details-pagination.js';
import { toReportCashDetailsResponse } from './to-report-cash-details-response.js';
import type { DashboardCategoryFilter } from '../../analytics/domain/dashboard-home-filters.js';
import type { ReportDetailDirection } from '../domain/report-cash-details.js';

export async function registerReportsRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const environment = loadEnvironment();
  const storage = createFileStorage(environment);
  const users = createUserRepository(prisma);
  const tenants = createTenantRepository(prisma);
  const tenantBranding = createTenantBrandingRepository(prisma);
  const platformBranding = createPlatformBrandingRepository(prisma);
  const requireAuthentication = createRequireAuthentication({ users, tenants });
  const costCenters = createCostCenterReadRepository(prisma);
  const categories = createFinancialCategoryReadRepository(prisma);
  const receivables = createReceivableReadRepository(prisma);
  const payables = createPayableReadRepository(prisma);
  const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
  const ledger = createLedgerReadRepository(prisma);
  const parties = createPartyReadRepository(prisma);
  const reportCashDetails = createReportCashDetailsService({
    ledger,
    receivables,
    payables,
    categories,
    parties,
    costCenters,
    costCenterAllocations,
  });
  const dashboard = createDashboardOverviewFacade({
    analytics: createAnalyticsService({
      receivables,
      payables,
      categories,
      costCenterAllocations,
    }),
    cashFlow: createMonthlyCashFlowService({
      ledger,
      receivables,
      payables,
      categories,
      costCenterAllocations,
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
      tenantBranding,
      platformBranding,
      storage,
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
      tenantBranding,
      platformBranding,
      storage,
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

  app.get('/reports/revenue/details', { preHandler: requireAuthentication }, async (request, reply) => {
    return replyReportCashDetails(request, reply, 'revenue');
  });

  app.get('/reports/expenses/details', { preHandler: requireAuthentication }, async (request, reply) => {
    return replyReportCashDetails(request, reply, 'expenses');
  });

  async function replyReportCashDetails(
    request: FastifyRequest,
    reply: FastifyReply,
    direction: ReportDetailDirection,
  ) {
    const auth = request.auth;
    if (!auth) {
      throw new UnauthenticatedError();
    }
    assertNoTenantIdQuery(request.query);
    const tenantId = resolveOperationalTenantId(auth);
    if (tenantId === null) {
      throw new ForbiddenError('Sem contexto de empresa para a Dashboard.');
    }
    const range = parseReportMonthRange(request.query);
    const situation = parseReportDetailSituation(request.query);
    const costCenterId = parseDashboardCostCenterQuery(request.query);
    const categoryId = parseDashboardCategoryQuery(request.query);
    const limit = parseReportDetailsLimit(request.query);
    const offset = parseReportDetailsOffset(request.query);

    let resolvedCostCenterId: string | undefined;
    if (costCenterId !== null) {
      const found = await costCenters.findByIdForTenant(tenantId, costCenterId);
      if (found === null) {
        throw new NotFoundError('Centro de custo não encontrado.');
      }
      resolvedCostCenterId = found.id;
    }

    let categoryFilter: DashboardCategoryFilter | undefined;
    if (categoryId !== null) {
      const found = await categories.findByIdForTenant(tenantId, categoryId);
      if (found === null) {
        throw new NotFoundError('Categoria não encontrada.');
      }
      categoryFilter = { externalId: found.externalId, type: found.type };
    }

    const details = await reportCashDetails.getReportCashDetails({
      tenantId,
      direction,
      fromKey: range.from,
      toKey: range.to,
      situation,
      ...(resolvedCostCenterId === undefined ? {} : { costCenterId: resolvedCostCenterId }),
      ...(categoryFilter === undefined ? {} : { categoryFilter }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
    return reply
      .status(200)
      .header('Cache-Control', 'private, no-store')
      .send(toReportCashDetailsResponse(range.from, range.to, details));
  }
}
