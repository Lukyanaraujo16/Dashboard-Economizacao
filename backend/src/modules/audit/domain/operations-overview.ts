import type { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling, monthlyExpenses } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlow } from '../../analytics/domain/types.js';

/** Empresas com sincronização bem-sucedida dentro desta janela. */
export const OPERATIONS_SYNC_FRESHNESS_HOURS = 24;

/** Falhas, execuções de IA, auditoria e alertas. */
export const OPERATIONS_RECENT_DAYS = 7;

/** Teto da página financeira para não calcular caixa de dezenas de empresas de uma vez. */
export const OPERATIONS_COMPANY_PAGE_LIMIT = 20;

export const OPERATIONS_ALERT_LIMIT = 5;

export type OperationsIntegrationState =
  | 'NONE'
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'ERROR'
  | 'SYNC_FAILED';

export type OperationsCompanyFinancials = {
  readonly billing: string | null;
  readonly result: string | null;
  readonly receivables: string | null;
  readonly payables: string | null;
  readonly overdueReceivables: string | null;
  readonly overduePayables: string | null;
};

function money(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

/**
 * Fatos da Home para uma empresa.
 * Faturamento = monthlyBilling. Resultado = billing − monthlyExpenses.
 * A receber e contas a pagar = estoque em aberto do mês. Vencidos = estoque vencido do mês.
 * null permanece null.
 */
export function toOperationsCompanyFinancials(flow: MonthlyCashFlow): OperationsCompanyFinancials {
  const billing = monthlyBilling(flow);
  const expenses = monthlyExpenses(flow);
  const result = billing === null || expenses === null ? null : billing.minus(expenses);
  return {
    billing: money(billing),
    result: money(result),
    receivables: money(flow.stock.receivables.open),
    payables: money(flow.stock.payables.open),
    overdueReceivables: money(flow.stock.receivables.overdue),
    overduePayables: money(flow.stock.payables.overdue),
  };
}

export function unavailableOperationsFinancials(): OperationsCompanyFinancials {
  return {
    billing: null,
    result: null,
    receivables: null,
    payables: null,
    overdueReceivables: null,
    overduePayables: null,
  };
}

export function resolveOperationsIntegrationState(input: {
  readonly status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | null;
  readonly lastSuccessfulSyncAt: Date | null;
  readonly lastErrorAt: Date | null;
}): OperationsIntegrationState {
  if (input.status === null) {
    return 'NONE';
  }
  if (input.status === 'DISCONNECTED') {
    return 'DISCONNECTED';
  }
  if (input.status === 'ERROR') {
    return 'ERROR';
  }
  if (
    input.lastErrorAt !== null &&
    (input.lastSuccessfulSyncAt === null || input.lastErrorAt.getTime() > input.lastSuccessfulSyncAt.getTime())
  ) {
    return 'SYNC_FAILED';
  }
  return 'CONNECTED';
}
