/**
 * Configuração mínima de acesso à API interna.
 *
 * Em desenvolvimento e produção same-origin, o browser chama caminhos relativos
 * (ex.: `/auth/login`). O Next.js faz rewrite para o Fastify via `API_URL`.
 */

import type { DashboardHomeQuery } from './dashboard-home-query';
import type { DashboardSituation } from './dashboard-situation';

/** Prefixo same-origin das rotas de autenticação. */
export const AUTH_API_PREFIX = '/auth';

export function authLoginPath(): string {
  return `${AUTH_API_PREFIX}/login`;
}

export function authMePath(): string {
  return `${AUTH_API_PREFIX}/me`;
}

export function authLogoutPath(): string {
  return `${AUTH_API_PREFIX}/logout`;
}

export function authSupportEnterPath(): string {
  return `${AUTH_API_PREFIX}/support/enter`;
}

export function authSupportExitPath(): string {
  return `${AUTH_API_PREFIX}/support/exit`;
}

/** Prefixo same-origin das rotas administrativas de plataforma. */
export const ADMIN_API_PREFIX = '/admin';

export function adminTenantsPath(): string {
  return `${ADMIN_API_PREFIX}/tenants`;
}

export function adminTenantPath(tenantId: string): string {
  return `${adminTenantsPath()}/${tenantId}`;
}

export function adminTenantDisablePath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/disable`;
}

export function adminTenantReactivatePath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/reactivate`;
}

export function adminTenantBrandingPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/branding`;
}

export function adminTenantBrandingLogoPath(tenantId: string): string {
  return `${adminTenantBrandingPath(tenantId)}/logo`;
}

export function adminTenantBrandingIconPath(tenantId: string): string {
  return `${adminTenantBrandingPath(tenantId)}/icon`;
}

export function adminTenantContaAzulPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/integrations/conta-azul`;
}

export function adminTenantContaAzulConnectPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/connect`;
}

export function adminTenantContaAzulDisconnectPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/disconnect`;
}

export function adminTenantContaAzulVerifyPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/verify`;
}

export function adminTenantContaAzulSyncPath(tenantId: string): string {
  return `${adminTenantContaAzulPath(tenantId)}/sync`;
}

export function adminTenantContaAzulSyncCurrentPath(tenantId: string): string {
  return `${adminTenantContaAzulSyncPath(tenantId)}/current`;
}

/** Branding global da plataforma (1.5C/1.5D). */
export function adminPlatformBrandingPath(): string {
  return `${ADMIN_API_PREFIX}/platform/branding`;
}

export function adminPlatformBrandingLogoPath(): string {
  return `${adminPlatformBrandingPath()}/logo`;
}

export function adminPlatformBrandingFaviconPath(): string {
  return `${adminPlatformBrandingPath()}/favicon`;
}

export function adminPlatformBrandingIconPath(): string {
  return `${adminPlatformBrandingPath()}/icon`;
}

/** Prefixo same-origin dos administradores da plataforma (1.4C). */
export function adminAdministratorsPath(): string {
  return `${ADMIN_API_PREFIX}/administrators`;
}

export function adminAdministratorPath(userId: string): string {
  return `${adminAdministratorsPath()}/${userId}`;
}

export function adminAdministratorBlockPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/block`;
}

export function adminAdministratorUnblockPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/unblock`;
}

export function adminAdministratorDisablePath(userId: string): string {
  return `${adminAdministratorPath(userId)}/disable`;
}

export function adminAdministratorEnablePath(userId: string): string {
  return `${adminAdministratorPath(userId)}/enable`;
}

export function adminAdministratorResetPasswordPath(userId: string): string {
  return `${adminAdministratorPath(userId)}/reset-password`;
}

/** Prefixo same-origin dos usuários de uma empresa (1.4C). */
export function adminTenantUsersPath(tenantId: string): string {
  return `${adminTenantPath(tenantId)}/users`;
}

export function adminTenantUserPath(tenantId: string, userId: string): string {
  return `${adminTenantUsersPath(tenantId)}/${userId}`;
}

export function adminTenantUserBlockPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/block`;
}

export function adminTenantUserUnblockPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/unblock`;
}

export function adminTenantUserDisablePath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/disable`;
}

export function adminTenantUserEnablePath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/enable`;
}

export function adminTenantUserResetPasswordPath(tenantId: string, userId: string): string {
  return `${adminTenantUserPath(tenantId, userId)}/reset-password`;
}

/** Prefixo same-origin da Dashboard financeira do cliente (10A/10B). */
export const DASHBOARD_API_PREFIX = '/dashboard';
export const REPORTS_API_PREFIX = '/reports';

export type DashboardQueryOptions = DashboardHomeQuery;

function dashboardQueryString(options?: DashboardQueryOptions): string {
  const params = new URLSearchParams();
  const monthKey = options?.monthKey?.trim();
  if (monthKey) {
    params.set('month', monthKey);
  }
  const costCenterId = options?.costCenterId?.trim();
  if (costCenterId) {
    params.set('costCenter', costCenterId);
  }
  const situation = options?.situation?.trim();
  if (situation) {
    params.set('situation', situation);
  }
  const categoryId = options?.categoryId?.trim();
  if (categoryId) {
    params.set('category', categoryId);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function dashboardCostCentersPath(options?: {
  readonly monthKey?: string | null;
  readonly fromKey?: string | null;
  readonly toKey?: string | null;
}): string {
  const params = new URLSearchParams();
  const monthKey = options?.monthKey?.trim();
  const fromKey = options?.fromKey?.trim();
  const toKey = options?.toKey?.trim();
  if (monthKey) {
    params.set('month', monthKey);
  } else if (fromKey && toKey) {
    params.set('from', fromKey);
    params.set('to', toKey);
  }
  const qs = params.toString();
  return qs
    ? `${DASHBOARD_API_PREFIX}/cost-centers?${qs}`
    : `${DASHBOARD_API_PREFIX}/cost-centers`;
}

export function dashboardCategoriesPath(options?: {
  readonly monthKey?: string | null;
  readonly fromKey?: string | null;
  readonly toKey?: string | null;
}): string {
  const params = new URLSearchParams();
  const monthKey = options?.monthKey?.trim();
  const fromKey = options?.fromKey?.trim();
  const toKey = options?.toKey?.trim();
  if (monthKey) {
    params.set('month', monthKey);
  } else if (fromKey && toKey) {
    params.set('from', fromKey);
    params.set('to', toKey);
  }
  const qs = params.toString();
  return qs
    ? `${DASHBOARD_API_PREFIX}/categories?${qs}`
    : `${DASHBOARD_API_PREFIX}/categories`;
}

export function dashboardOverviewPath(costCenterId?: string | null): string {
  return `${DASHBOARD_API_PREFIX}/overview${dashboardQueryString({ costCenterId })}`;
}

export function dashboardUpcomingPath(
  days: 7 | 15 | 30,
  costCenterId?: string | null,
): string {
  const params = new URLSearchParams({ days: String(days) });
  const trimmed = costCenterId?.trim();
  if (trimmed) {
    params.set('costCenter', trimmed);
  }
  return `${DASHBOARD_API_PREFIX}/upcoming?${params.toString()}`;
}

export function dashboardExpenseCompositionPath(costCenterId?: string | null): string {
  return `${DASHBOARD_API_PREFIX}/expense-composition${dashboardQueryString({ costCenterId })}`;
}

export function dashboardReceivableCompositionPath(costCenterId?: string | null): string {
  return `${DASHBOARD_API_PREFIX}/receivable-composition${dashboardQueryString({ costCenterId })}`;
}

export function dashboardMonthlyRevenuePath(
  monthKey?: string | null,
  costCenterId?: string | null,
  situation?: DashboardSituation | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/monthly-revenue${dashboardQueryString({
    monthKey,
    costCenterId,
    situation,
    categoryId,
  })}`;
}

export function dashboardMonthlyExpensesPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  situation?: DashboardSituation | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/monthly-expenses${dashboardQueryString({
    monthKey,
    costCenterId,
    situation,
    categoryId,
  })}`;
}

/** CASH-3B. `situation` não faz parte do contrato (realizado é histórico). */
export function dashboardMonthlyCashFlowPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/monthly-cash-flow${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

/** Correção 08-B — histórico de 12 meses de caixa realizado. */
export function dashboardCashMovementHistoryPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/cash-movement-history${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

/** Previsto multi-mês à frente (Diária → Previsto → 3|6|12). */
export function dashboardCashExpectedHorizonPath(options: {
  readonly monthKey?: string | null;
  readonly horizon: 3 | 6 | 12;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
}): string {
  const params = new URLSearchParams();
  const monthKey = options.monthKey?.trim();
  if (monthKey) {
    params.set('month', monthKey);
  }
  params.set('horizon', String(options.horizon));
  const costCenterId = options.costCenterId?.trim();
  if (costCenterId) {
    params.set('costCenter', costCenterId);
  }
  const categoryId = options.categoryId?.trim();
  if (categoryId) {
    params.set('category', categoryId);
  }
  return `${DASHBOARD_API_PREFIX}/cash-expected-horizon?${params.toString()}`;
}

/** Correção 08-C2 — histórico de saldo bancário (snapshots). Sem category/costCenter. */
export function dashboardCashBalanceHistoryPath(monthKey?: string | null): string {
  return `${DASHBOARD_API_PREFIX}/cash-balance-history${dashboardQueryString({
    monthKey,
  })}`;
}

/** Detalhe lazy do KPI A receber — mesmos filtros do monthly-cash-flow. */
export function dashboardExpectedReceivableDetailsPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/receivables/expected-details${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

export function dashboardExpectedPayableDetailsPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/payables/expected-details${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

export function dashboardReceivableStockDetailsPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/receivables/stock-details${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

export function dashboardPayableStockDetailsPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/payables/stock-details${dashboardQueryString({
    monthKey,
    costCenterId,
    categoryId,
  })}`;
}

/** 12-B/12-C — detalhe lazy de baixas realizadas por kind+key. */
export function dashboardCashRealizedDetailsPath(options: {
  readonly monthKey?: string | null;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly direction: 'inflows' | 'outflows';
  readonly categoryKey: string;
  readonly categoryKind: string;
  readonly limit?: number;
  readonly offset?: number;
}): string {
  const params = new URLSearchParams();
  const monthKey = options.monthKey?.trim();
  if (monthKey) {
    params.set('month', monthKey);
  }
  const costCenterId = options.costCenterId?.trim();
  if (costCenterId) {
    params.set('costCenter', costCenterId);
  }
  const categoryId = options.categoryId?.trim();
  if (categoryId) {
    params.set('category', categoryId);
  }
  params.set('direction', options.direction);
  params.set('categoryKey', options.categoryKey);
  params.set('categoryKind', options.categoryKind);
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  return `${DASHBOARD_API_PREFIX}/cash-realized/details?${params.toString()}`;
}

export function dashboardExecutiveInsightsPath(
  monthKey?: string | null,
  costCenterId?: string | null,
  situation?: DashboardSituation | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/executive-insights${dashboardQueryString({
    monthKey,
    costCenterId,
    situation,
    categoryId,
  })}`;
}

/** Meta mensal de faturamento (F2) — sempre consolidada; sem `costCenter`. */
export function dashboardRevenueGoalPath(monthKey?: string | null): string {
  return `${DASHBOARD_API_PREFIX}/revenue-goal${dashboardQueryString({ monthKey })}`;
}

export function reportsRevenuePath(options: {
  readonly from: string;
  readonly to: string;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
  readonly format?: 'pdf' | 'xlsx';
}): string {
  const params = new URLSearchParams();
  params.set('from', options.from);
  params.set('to', options.to);
  const costCenterId = options.costCenterId?.trim();
  if (costCenterId) {
    params.set('costCenter', costCenterId);
  }
  const situation = options.situation?.trim();
  if (situation) {
    params.set('situation', situation);
  }
  const categoryId = options.categoryId?.trim();
  if (categoryId) {
    params.set('category', categoryId);
  }
  if (options.format === 'pdf' || options.format === 'xlsx') {
    params.set('format', options.format);
  }
  return `${REPORTS_API_PREFIX}/revenue?${params.toString()}`;
}

export function reportsRevenueExportFilename(
  from: string,
  to: string,
  format: 'pdf' | 'xlsx',
): string {
  return `relatorio-receita-${from}-a-${to}.${format}`;
}

export function reportsExpensesPath(options: {
  readonly from: string;
  readonly to: string;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
  readonly format?: 'pdf' | 'xlsx';
}): string {
  const params = new URLSearchParams();
  params.set('from', options.from);
  params.set('to', options.to);
  const costCenterId = options.costCenterId?.trim();
  if (costCenterId) {
    params.set('costCenter', costCenterId);
  }
  const situation = options.situation?.trim();
  if (situation) {
    params.set('situation', situation);
  }
  const categoryId = options.categoryId?.trim();
  if (categoryId) {
    params.set('category', categoryId);
  }
  if (options.format === 'pdf' || options.format === 'xlsx') {
    params.set('format', options.format);
  }
  return `${REPORTS_API_PREFIX}/expenses?${params.toString()}`;
}

export function reportsExpensesExportFilename(
  from: string,
  to: string,
  format: 'pdf' | 'xlsx',
): string {
  return `relatorio-despesas-${from}-a-${to}.${format}`;
}

export function dashboardMonthEndCashPressurePath(
  costCenterId?: string | null,
  categoryId?: string | null,
): string {
  return `${DASHBOARD_API_PREFIX}/month-end-cash-pressure${dashboardQueryString({
    costCenterId,
    categoryId,
  })}`;
}

/** Prefixo same-origin do branding da sessão autenticada. */
export const BRANDING_API_PREFIX = '/branding';

export function brandingCurrentPath(): string {
  return `${BRANDING_API_PREFIX}/current`;
}

/** Branding público da plataforma (login / bootstrap sem sessão). */
export function brandingPlatformPath(): string {
  return `${BRANDING_API_PREFIX}/platform`;
}
