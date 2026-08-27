import { formatDelinquencyRate } from '../../lib/format-money-brl';
import type { MonthlyCashFlowView } from './dashboard-monthly-cash-flow-view';
import {
  accumulate,
  decimalRatio,
  signedSharePercent,
  subtractDecimalStrings,
  type DailyPoint,
} from './v2/chart-math';

function mapNullableSeries(
  points: readonly { readonly date: string; readonly amount: string | null }[],
): readonly DailyPoint[] | undefined {
  const mapped = points
    .filter((point) => point.amount !== null)
    .map((point) => ({ date: point.date, amount: point.amount as string }));
  return mapped.length > 0 ? mapped : undefined;
}

/** Entradas realizadas por dia de baixa (occurredOn). */
export function cashRealizedInflowsSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit) {
    return undefined;
  }
  return mapNullableSeries(
    view.dailyRealized.map((point) => ({ date: point.date, amount: point.inflows })),
  );
}

/** Saídas realizadas por dia de baixa (occurredOn). */
export function cashRealizedOutflowsSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit) {
    return undefined;
  }
  return mapNullableSeries(
    view.dailyRealized.map((point) => ({ date: point.date, amount: point.outflows })),
  );
}

/** A receber previsto por dia de vencimento (dueDate, no prazo). */
export function cashExpectedReceivablesSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit) {
    return undefined;
  }
  return mapNullableSeries(
    view.dailyExpected.map((point) => ({ date: point.date, amount: point.receivables })),
  );
}

/** A pagar previsto por dia de vencimento (dueDate, no prazo). */
export function cashExpectedPayablesSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit) {
    return undefined;
  }
  return mapNullableSeries(
    view.dailyExpected.map((point) => ({ date: point.date, amount: point.payables })),
  );
}

/**
 * Despesas — opção B (série única no card):
 * até o dia d: Σ outflows[≤d] + expected.payables (estoque no prazo do mês).
 * Último ponto = realized.outflows + expected.payables = monthlyExpenses.
 */
export function cashExpensesComposedSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit || view.monthlyExpenses === null || view.payable === null) {
    return undefined;
  }
  const outflows = cashRealizedOutflowsSeries(view);
  if (!outflows || outflows.length === 0) {
    return undefined;
  }

  let cumOutflows = '0';
  const composed: DailyPoint[] = [];
  for (const point of outflows) {
    cumOutflows = subtractDecimalStrings(cumOutflows, subtractDecimalStrings('0', point.amount));
    composed.push({
      date: point.date,
      amount: subtractDecimalStrings(cumOutflows, subtractDecimalStrings('0', view.payable)),
    });
  }

  return composed.length > 0 ? composed : undefined;
}

/**
 * Resultado projetado do mês (série única):
 * até d: (Σ inflows − Σ outflows)[≤d] + (expected.receivables − expected.payables).
 * Último ponto = realized.result + expected.result = managerialResult.
 */
export function cashManagerialResultComposedSeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (
    !view.costCenterCashSplit ||
    view.managerialResult === null ||
    view.receivable === null ||
    view.payable === null
  ) {
    return undefined;
  }
  const inflows = cashRealizedInflowsSeries(view);
  const outflows = cashRealizedOutflowsSeries(view);
  if (!inflows || !outflows) {
    return undefined;
  }

  const expectedNet = subtractDecimalStrings(view.receivable, view.payable);
  let cumIn = '0';
  let cumOut = '0';
  const composed: DailyPoint[] = [];

  for (let index = 0; index < inflows.length; index += 1) {
    cumIn = subtractDecimalStrings(cumIn, subtractDecimalStrings('0', inflows[index]!.amount));
    cumOut = subtractDecimalStrings(
      cumOut,
      subtractDecimalStrings('0', outflows[index]?.amount ?? '0'),
    );
    const realizedSoFar = subtractDecimalStrings(cumIn, cumOut);
    composed.push({
      date: inflows[index]!.date,
      amount: subtractDecimalStrings(realizedSoFar, subtractDecimalStrings('0', expectedNet)),
    });
  }

  return composed.length > 0 ? composed : undefined;
}

/** Acumulado de entradas realizadas — gráfico Receitas × Despesas. */
export function cashRealizedInflowsAccumulated(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  const series = cashRealizedInflowsSeries(view);
  return series ? accumulate(series) : undefined;
}

/** Acumulado de saídas realizadas — gráfico Receitas × Despesas. */
export function cashRealizedOutflowsAccumulated(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  const series = cashRealizedOutflowsSeries(view);
  return series ? accumulate(series) : undefined;
}

/**
 * Coverage do mês corrente como razão 0–1 para RatioMeter do Faturamento.
 * Não é Meta. Indisponível quando coverage null / split false.
 */
export function cashBillingCoverageRatio(
  view: MonthlyCashFlowView,
): { readonly ratio: number; readonly label: string } | undefined {
  if (!view.costCenterCashSplit || view.coverage === null || view.billing === null) {
    return undefined;
  }
  if (view.received === null) {
    return undefined;
  }
  const share = signedSharePercent(view.received, view.billing);
  if (share === null) {
    return undefined;
  }
  return {
    ratio: decimalRatio(view.received, view.billing),
    label: `${formatDelinquencyRate(share)} do faturamento do mês já realizado`,
  };
}

export const CASH_EXPENSES_SPARKLINE_CAPTION =
  'Pago acumulado + total a pagar ainda no prazo';
export const CASH_RESULT_SPARKLINE_CAPTION =
  'Resultado projetado do mês (realizado + previsto no prazo)';
export const CASH_REALIZED_COMPARISON_CAPTION = 'Entradas e saídas realizadas no mês';
export const CASH_DAILY_REALIZED_CAPTION = 'Movimentação realizada por dia de baixa';
export const CASH_DAILY_EXPECTED_CAPTION = 'Previsto no prazo por dia de vencimento';
