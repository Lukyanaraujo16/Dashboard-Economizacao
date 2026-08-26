import type {
  DashboardMonthlyCashFlowDailyExpectedPoint,
  DashboardMonthlyCashFlowDailyRealizedPoint,
  DashboardMonthlyCashFlowResponse,
} from '../../services/dashboard/monthly-cash-flow.types';
import { subtractDecimalStrings } from './v2/chart-math';

/**
 * View-model CASH-4A: DTO de caixa → valores seguros para a Home (CASH-4B).
 *
 * Não é um segundo motor. `billing` vem do DTO. Composições simples
 * (despesas / resultado) somam as peças do mesmo aggregate.
 * Null permanece null — `costCenterCashSplit=false` não vira R$ 0,00.
 * Vencidos ficam fora de Faturamento e Despesas.
 * Sem `grossAmount`: caixa realizado usa as strings net já serializadas.
 */
export type MonthlyCashFlowView = {
  readonly monthKey: string;
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit: boolean;
  readonly billing: string | null;
  readonly received: string | null;
  readonly realizedInflows: string | null;
  readonly receivable: string | null;
  readonly expectedReceivables: string | null;
  readonly paid: string | null;
  readonly realizedOutflows: string | null;
  readonly payable: string | null;
  readonly expectedPayables: string | null;
  readonly monthlyExpenses: string | null;
  readonly managerialResult: string | null;
  readonly realizedResult: string | null;
  readonly overdueReceivables: string | null;
  readonly overduePayables: string | null;
  readonly overdueReceivablesOfMonth: string | null;
  readonly overduePayablesOfMonth: string | null;
  readonly coverage: string | null;
  readonly dailyRealized: readonly DashboardMonthlyCashFlowDailyRealizedPoint[];
  readonly dailyExpected: readonly DashboardMonthlyCashFlowDailyExpectedPoint[];
};

function addDecimalStrings(left: string, right: string): string {
  return subtractDecimalStrings(left, subtractDecimalStrings('0', right));
}

function addNullable(left: string | null, right: string | null): string | null {
  if (left === null || right === null) {
    return null;
  }
  return addDecimalStrings(left, right);
}

function subtractNullable(left: string | null, right: string | null): string | null {
  if (left === null || right === null) {
    return null;
  }
  return subtractDecimalStrings(left, right);
}

export function toMonthlyCashFlowView(data: DashboardMonthlyCashFlowResponse): MonthlyCashFlowView {
  const realizedInflows = data.realized.inflows;
  const expectedReceivables = data.expected.receivables;
  const realizedOutflows = data.realized.outflows;
  const expectedPayables = data.expected.payables;
  const monthlyExpenses = addNullable(realizedOutflows, expectedPayables);

  return {
    monthKey: data.monthKey,
    today: data.today,
    from: data.from,
    to: data.to,
    costCenterCashSplit: data.costCenterCashSplit,
    billing: data.billing,
    received: realizedInflows,
    realizedInflows,
    receivable: expectedReceivables,
    expectedReceivables,
    paid: realizedOutflows,
    realizedOutflows,
    payable: expectedPayables,
    expectedPayables,
    monthlyExpenses,
    managerialResult: subtractNullable(data.billing, monthlyExpenses),
    realizedResult: data.realized.result,
    overdueReceivables: data.overdue.receivables,
    overduePayables: data.overdue.payables,
    overdueReceivablesOfMonth: data.overdue.ofMonth.receivables,
    overduePayablesOfMonth: data.overdue.ofMonth.payables,
    coverage: data.coverage,
    dailyRealized: data.daily.realized,
    dailyExpected: data.daily.expected,
  };
}
