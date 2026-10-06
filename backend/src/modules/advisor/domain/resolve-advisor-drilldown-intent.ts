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
  if (/\bcentros?(?:\s+de\s+custo)?\b/.test(folded)) {
    return null;
  }
  const limit = extractAdvisorDrilldownLimit(folded);
  const hasCategoryDimension = /\bcategorias?\b/.test(folded);
  const hasReceipt = /\b(recebimentos?|entradas?)\b/.test(folded);
  const hasOutflow = /\b(saidas?|pagamentos?|desembolsos?)\b/.test(folded);
  const hasFlowCue =
    hasReceipt ||
    hasOutflow ||
    /\bfatur/.test(folded) ||
    /\bmaior(?:es)?\b/.test(folded) ||
    /\bconsumiram caixa\b/.test(folded);

  // Dimensão explícita CATEGORY vence wording genérico de lançamento
  // ("entradas", "recebimentos", "pagamentos").
  if (hasCategoryDimension && hasFlowCue) {
    const direction: AdvisorCashDirection =
      hasOutflow && !hasReceipt ? 'OUTFLOW' : 'INFLOW';
    return {
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      direction,
      sort: 'AMOUNT_DESC',
      limit,
    };
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
  return extractExplicitAdvisorTopNLimit(folded) ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
}

/**
 * Extrai N explícito de cardinalidade (top N / os N …).
 * Retorna null quando a pergunta não pede N — não confundir com default.
 */
export function extractExplicitAdvisorTopNLimit(folded: string): number | null {
  const match =
    /\b(?:quais (?:foram )?)?(?:mostre(?:\s+os)?|os|meus?)\s+(\d{1,4})\s+(?:maiores?\s+)?(?:convenios?|fornecedor(?:es)?|clientes?|contrapartes?|entidades?|recebimentos?|saidas?|gastos?|despesas?|pagamentos?|desembolsos?|movimentos?|categorias?|centros?(?:\s+de\s+custo)?)\b/.exec(
      folded,
    ) ??
    /(?:os\s+|meus?\s+)?(\d{1,4})\s+maior(?:es)?\b/.exec(folded) ??
    /\btop\s+(\d{1,4})\b/.exec(folded) ??
    /\bmostre(?:\s+os)?\s+(\d{1,4})\b/.exec(folded);
  const raw = match?.[1];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
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
