import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../lib/format-money-brl';
import type { MonthlyCashFlowView } from './dashboard-monthly-cash-flow-view';
import type { SignalTone } from './v2/executive-signals';

export type CashExecutiveMetric = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly tone: SignalTone;
};

export type CashExecutiveStatus = {
  readonly id: string;
  readonly body: string;
  readonly kind: 'clear' | 'overdue' | 'unavailable';
};

/**
 * Leitura executiva de caixa (CASH-4C / FINAL-UI).
 * Mesmos números do MonthlyCashFlow; apresentação em métricas curtas + status.
 */
export type CashExecutiveReadingModel = {
  readonly metrics: readonly CashExecutiveMetric[];
  readonly status: CashExecutiveStatus | null;
};

/**
 * Constrói a leitura determinística a partir do MonthlyCashFlow.
 * Não usa monthly-revenue / monthly-expenses / executive-insights de competência.
 */
export function buildCashExecutiveReading(
  view: MonthlyCashFlowView,
): CashExecutiveReadingModel {
  if (!view.costCenterCashSplit) {
    return {
      metrics: [],
      status: {
        id: 'cash-unavailable',
        kind: 'unavailable',
        body: 'Indicadores de caixa indisponíveis no filtro por centro de custo.',
      },
    };
  }

  const metrics: CashExecutiveMetric[] = [];

  if (view.received !== null && !isDecimalZero(view.received)) {
    metrics.push({
      id: 'cash-received',
      label: 'Entrou no caixa',
      value: formatMoneyBrl(view.received),
      hint: 'Neste mês',
      tone: 'revenue',
    });
  }

  if (view.receivable !== null && !isDecimalZero(view.receivable)) {
    metrics.push({
      id: 'cash-receivable',
      label: 'Ainda a receber',
      value: formatMoneyBrl(view.receivable),
      hint: 'Até o fim do mês',
      tone: 'receivable',
    });
  }

  if (view.paid !== null && !isDecimalZero(view.paid)) {
    metrics.push({
      id: 'cash-paid',
      label: 'Saiu do caixa',
      value: formatMoneyBrl(view.paid),
      hint: 'Neste mês',
      tone: 'expense',
    });
  }

  if (view.payable !== null && !isDecimalZero(view.payable)) {
    metrics.push({
      id: 'cash-payable',
      label: 'Ainda a pagar',
      value: formatMoneyBrl(view.payable),
      hint: 'Até o fim do mês',
      tone: 'expense',
    });
  }

  if (view.managerialResult !== null && !isDecimalZero(view.managerialResult)) {
    metrics.push({
      id: 'cash-result',
      label: 'Resultado projetado',
      value: formatMoneyBrl(view.managerialResult),
      hint: 'Realizado + previsto no prazo',
      tone: 'result',
    });
  }

  if (
    view.coverage !== null &&
    view.received !== null &&
    view.billing !== null &&
    !isDecimalZero(view.received) &&
    !isDecimalZero(view.billing)
  ) {
    const share = formatDelinquencyRate(
      String(Math.round(Number(view.coverage) * 10_000) / 100),
    );
    if (share !== '—' && share !== '0%') {
      metrics.push({
        id: 'cash-coverage',
        label: 'Faturamento realizado',
        value: share,
        hint: 'Do faturamento do mês já realizado',
        tone: 'positive',
      });
    }
  }

  let status: CashExecutiveStatus | null = null;
  if (view.overdueReceivables !== null) {
    if (isDecimalZero(view.overdueReceivables)) {
      status = {
        id: 'cash-overdue-clear',
        kind: 'clear',
        body: 'Nenhum valor a receber vencido no momento',
      };
    } else {
      status = {
        id: 'cash-overdue',
        kind: 'overdue',
        body: `${formatMoneyBrl(view.overdueReceivables)} vencidos a receber`,
      };
    }
  }

  return { metrics, status };
}
