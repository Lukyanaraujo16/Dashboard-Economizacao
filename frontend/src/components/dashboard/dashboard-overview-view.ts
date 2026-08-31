import { isPlatformRole } from '../../auth';
import type { AuthenticatedUser, SupportState } from '../../auth/types';
import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardOverviewResponse } from '../../services/dashboard/overview.types';
import { formatCompanyDate } from '../companies/company-utils';

export type DashboardKpiView = {
  readonly id: string;
  readonly title: string;
  readonly value: string;
  readonly meta: string;
};

/**
 * Tenant operacional da Dashboard/Relatórios: sessão / Support Mode.
 * Espelha resolveOperationalTenantId do backend — nunca lê tenantId da URL.
 */
export function resolveOperationalTenantId(
  user: AuthenticatedUser | null,
  support: SupportState,
): string | null {
  if (support.active) {
    return support.tenantId;
  }
  if (user?.role === 'USER' && user.tenantId != null) {
    return user.tenantId;
  }
  return null;
}

export function hasOperationalDashboardTenant(
  user: AuthenticatedUser | null,
  support: SupportState,
): boolean {
  return resolveOperationalTenantId(user, support) !== null;
}

export function shouldSkipOverviewFetch(
  user: AuthenticatedUser | null,
  support: SupportState,
): boolean {
  return Boolean(user && isPlatformRole(user.role) && !support.active);
}

export function isNeverSynced(overview: DashboardOverviewResponse): boolean {
  return overview.integration.lastSuccessfulSyncAt === null;
}

export function formatSyncTimestamp(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  return formatCompanyDate(iso);
}

/**
 * Capacidade reutilizável de estoque (carteira ACTIVE persistida).
 * Independente do selectedMonth. A Home month-scoped NÃO consome estes cards.
 */
export function toDashboardKpis(overview: DashboardOverviewResponse): readonly DashboardKpiView[] {
  const receivablesMeta = `Estoque total · todos os vencimentos\nVencido ${formatMoneyBrl(overview.receivables.overdue)}\nA vencer ${formatMoneyBrl(overview.receivables.upcoming)}`;
  const payablesMeta = `Estoque total · todos os vencimentos\nVencido ${formatMoneyBrl(overview.payables.overdue)}\nA vencer ${formatMoneyBrl(overview.payables.upcoming)}`;
  const rate = overview.delinquency.rate;
  const delinquencyMeta =
    rate === null
      ? 'Sem valores em aberto.'
      : `${formatMoneyBrl(overview.delinquency.overdueUnpaid)} vencido de ${formatMoneyBrl(overview.delinquency.openUnpaid)} em aberto`;

  return [
    {
      id: 'receivables-open',
      title: 'A receber em aberto',
      value: formatMoneyBrl(overview.receivables.open),
      meta: receivablesMeta,
    },
    {
      id: 'payables-open',
      title: 'A pagar em aberto',
      value: formatMoneyBrl(overview.payables.open),
      meta: payablesMeta,
    },
    {
      id: 'receivables-overdue',
      title: 'Recebíveis vencidos',
      value: formatMoneyBrl(overview.receivables.overdue),
      meta: 'Do estoque em aberto que já venceu.',
    },
    {
      id: 'delinquency',
      title: 'Inadimplência',
      value: formatDelinquencyRate(rate),
      meta: delinquencyMeta,
    },
  ];
}
