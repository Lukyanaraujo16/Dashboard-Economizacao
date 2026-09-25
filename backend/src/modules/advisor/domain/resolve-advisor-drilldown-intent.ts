import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  CASH_REALIZED_BREAKDOWN_TOOL_NAME,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import {
  CASH_MOVEMENT_LINES_TOOL_NAME,
  type AdvisorCashMovementSort,
} from './advisor-cash-movement-lines.js';

/**
 * Intenção de drill-down da pergunta atual (F13.8.1D2.1).
 * Não resolve monthKey — o resolvedor temporal oficial continua a autoridade.
 */
export type AdvisorDrilldownIntent = {
  readonly toolName: typeof CASH_MOVEMENT_LINES_TOOL_NAME | typeof CASH_REALIZED_BREAKDOWN_TOOL_NAME;
  readonly direction: AdvisorCashDirection;
  readonly sort: AdvisorCashMovementSort;
  readonly limit: number;
};

export function resolveAdvisorDrilldownIntent(content: string): AdvisorDrilldownIntent | null {
  const folded = foldPt(content);
  const hasCategory = /\bcategorias?\b/.test(folded);
  const hasReceipt = /\b(recebimentos?|entradas?)\b/.test(folded);
  const hasOutflow = /\b(saidas?|pagamentos?|desembolsos?)\b/.test(folded);
  const limit = extractAdvisorDrilldownLimit(folded);

  if (hasCategory && !hasReceipt) {
    if (hasOutflow) {
      return {
        toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
        direction: 'OUTFLOW',
        sort: 'AMOUNT_DESC',
        limit,
      };
    }
    if (/\bfatur|maior(?:es)?\b|consumiram caixa/.test(folded)) {
      return {
        toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
        direction: 'INFLOW',
        sort: 'AMOUNT_DESC',
        limit,
      };
    }
  }

  if (hasReceipt && !hasOutflow) {
    return {
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      direction: 'INFLOW',
      sort: dateSort(folded),
      limit,
    };
  }

  if (hasOutflow && !hasReceipt) {
    return {
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      direction: 'OUTFLOW',
      sort: dateSort(folded),
      limit,
    };
  }

  return null;
}

export function extractAdvisorDrilldownLimit(folded: string): number {
  const match = /(?:os\s+)?(\d{1,4})\s+maior(?:es)?\b|\btop\s+(\d{1,4})\b/.exec(folded);
  const raw = match?.[1] ?? match?.[2];
  if (raw === undefined) {
    return ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.trunc(parsed)), ADVISOR_DRILLDOWN_MAX_LIMIT);
}

function dateSort(folded: string): AdvisorCashMovementSort {
  return /\bmais recentes\b|\bdata\b/.test(folded) ? 'DATE_DESC' : 'AMOUNT_DESC';
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
