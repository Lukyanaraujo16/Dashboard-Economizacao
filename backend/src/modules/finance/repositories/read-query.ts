import type { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../domain/active-installment-status.js';
import {
  ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES,
} from '../domain/cost-center-allocation-analytical-validity.js';
import { MONTHLY_COMPETENCE_REVENUE_STATUSES } from '../domain/monthly-competence-revenue-status.js';
import type { FinanceReadScope } from '../domain/types.js';

export function assertTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new Error('tenantId é obrigatório na leitura financeira.');
  }
}

/**
 * 11-E.3: leituras CURRENT de rateio exigem detalhe analiticamente confirmado.
 * PARTIAL homologado persiste como FETCHED e permanece elegível.
 */
export function withAnalyticallyConfirmedCostCenterDetail<
  T extends Prisma.ReceivableWhereInput | Prisma.PayableWhereInput,
>(where: T): T {
  return {
    ...where,
    costCenterDetailStatus: { in: [...ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES] },
  };
}

export function buildActiveInstallmentWhere(
  scope: FinanceReadScope,
): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  const where: Prisma.ReceivableWhereInput & Prisma.PayableWhereInput = {
    tenantId: scope.tenantId,
    lifecycleStatus: 'ACTIVE',
    status: { in: [...ACTIVE_INSTALLMENT_STATUSES] },
  };
  if (scope.integrationId !== undefined && scope.integrationId.trim() !== '') {
    where.integrationId = scope.integrationId;
  }
  return where;
}

/** CURRENT/stock/forecast: ACTIVE + status financeiro ativo + detalhe CC confirmado. */
export function buildActiveInstallmentWhereForConfirmedCostCenterAllocation(
  scope: FinanceReadScope,
): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  return withAnalyticallyConfirmedCostCenterDetail(buildActiveInstallmentWhere(scope));
}

export function buildMonthlyCompetenceWhere(
  scope: FinanceReadScope,
  from: Date,
  to: Date,
): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  const where: Prisma.ReceivableWhereInput & Prisma.PayableWhereInput = {
    tenantId: scope.tenantId,
    lifecycleStatus: 'ACTIVE',
    status: { in: [...MONTHLY_COMPETENCE_REVENUE_STATUSES] },
    competenceDate: { not: null, gte: from, lte: to },
  };
  if (scope.integrationId !== undefined && scope.integrationId.trim() !== '') {
    where.integrationId = scope.integrationId;
  }
  return where;
}

/** CURRENT competência: ACTIVE + statuses de competência + detalhe CC confirmado. */
export function buildMonthlyCompetenceWhereForConfirmedCostCenterAllocation(
  scope: FinanceReadScope,
  from: Date,
  to: Date,
): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  return withAnalyticallyConfirmedCostCenterDetail(buildMonthlyCompetenceWhere(scope, from, to));
}

export function buildMonthlyCompetenceRevenueWhere(
  scope: FinanceReadScope,
  from: Date,
  to: Date,
): Prisma.ReceivableWhereInput {
  return buildMonthlyCompetenceWhere(scope, from, to);
}
