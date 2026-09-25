import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import {
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
} from './advisor-cost-center-dimension.js';
import { extractAdvisorDrilldownLimit } from './resolve-advisor-drilldown-intent.js';
import type { AdvisorConversationalPeriod } from './resolve-advisor-conversational-period.js';

export const ADVISOR_COST_CENTER_INTENT_KINDS = [
  'COST_CENTER_RANKING_WINNER',
  'COST_CENTER_RANKING_TOPN',
  'COST_CENTER_LOOKUP',
  'COST_CENTER_SHARE',
] as const;

export type AdvisorCostCenterIntentKind = (typeof ADVISOR_COST_CENTER_INTENT_KINDS)[number];

export type AdvisorCostCenterIntent = {
  readonly kind: AdvisorCostCenterIntentKind;
  readonly toolName: typeof CASH_COST_CENTER_RANKING_TOOL_NAME | typeof CASH_COST_CENTER_LOOKUP_TOOL_NAME;
  readonly direction: AdvisorCashDirection;
  readonly limit: number;
  readonly costCenterQuery?: string;
};

export function hasAdvisorCostCenterCue(content: string): boolean {
  return /\bcentros?(?:\s+de\s+custo)?\b/.test(foldPt(content));
}

/**
 * Intenção de centro de custo no caixa realizado. Não resolve monthKey.
 * Recusa comparação, anáfora e snapshot atual.
 */
export function resolveAdvisorCostCenterIntent(input: {
  readonly content: string;
  readonly period: Pick<AdvisorConversationalPeriod, 'source' | 'comparison'>;
}): AdvisorCostCenterIntent | null {
  if (input.period.comparison) {
    return null;
  }
  const folded = foldPt(input.content);
  if (!hasAdvisorCostCenterCue(input.content)) {
    return null;
  }
  if (isCostCenterAnaphora(folded) || isCostCenterComparison(folded)) {
    return null;
  }
  if (isCurrentSnapshotCue(folded) && !hasNamedPeriodAttribution(folded)) {
    return null;
  }

  const direction = resolveCostCenterDirection(folded);
  if (direction === null) {
    return null;
  }

  const costCenterQuery = extractAdvisorCostCenterQuery(input.content);
  const limit = extractAdvisorDrilldownLimit(folded);
  const share = isCostCenterShareQuestion(folded);
  const topN = isCostCenterTopNQuestion(folded);
  const winner = isCostCenterWinnerQuestion(folded);

  if (costCenterQuery !== null && (share || isCostCenterLookupQuestion(folded))) {
    return {
      kind: share ? 'COST_CENTER_SHARE' : 'COST_CENTER_LOOKUP',
      toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      direction,
      limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
      costCenterQuery,
    };
  }
  if (topN) {
    return {
      kind: 'COST_CENTER_RANKING_TOPN',
      toolName: CASH_COST_CENTER_RANKING_TOOL_NAME,
      direction,
      limit,
    };
  }
  if (winner || (costCenterQuery === null && /\bcentros? de custo\b/.test(folded))) {
    return {
      kind: winner ? 'COST_CENTER_RANKING_WINNER' : 'COST_CENTER_RANKING_TOPN',
      toolName: CASH_COST_CENTER_RANKING_TOOL_NAME,
      direction,
      limit,
    };
  }
  return null;
}

export function isAdvisorCostCenterIntentKind(value: string): value is AdvisorCostCenterIntentKind {
  return (ADVISOR_COST_CENTER_INTENT_KINDS as readonly string[]).includes(value);
}

export function extractAdvisorCostCenterQuery(content: string): string | null {
  const patterns = [
    /(?:no|do|pelo|ao)\s+centro(?:\s+de\s+custo)?\s+(.+)/i,
    /centro(?:\s+de\s+custo)?\s+(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1] === undefined) {
      continue;
    }
    const cleaned = match[1]
      .replace(/\s+representou.*$/i, '')
      .replace(/\s+em\s+.+?$/i, '')
      .replace(/\s+de\s+\d{4}.*$/i, '')
      .replace(/[?.!].*$/g, '')
      .replace(/\s+(?:teve|com|das|dos|da|do)\s+.+$/i, '')
      .trim();
    if (cleaned === '' || isGenericCenterQuery(cleaned)) {
      continue;
    }
    return cleaned;
  }
  return null;
}

function isGenericCenterQuery(value: string): boolean {
  const folded = foldPt(value);
  return /^(?:de custo|com maior|com maiores|que mais|maior|maiores)$/.test(folded);
}

function resolveCostCenterDirection(folded: string): AdvisorCashDirection | null {
  const outflow =
    /\b(saidas?|gasto|gastos|gastei|pagamentos? realizados?|paguei pelo centro)\b/.test(folded);
  const inflow =
    /\b(entradas?|recebi pelo centro|recebimentos? realizados?)\b/.test(folded);
  if (outflow && !inflow) {
    return 'OUTFLOW';
  }
  if (inflow && !outflow) {
    return 'INFLOW';
  }
  return null;
}

function isCostCenterWinnerQuestion(folded: string): boolean {
  return (
    /\bqual centros? (?:de custo )?(?:teve |com )?(?:a )?maior\b/.test(folded) ||
    /\bcentro(?:s)?(?:\s+de\s+custo)? (?:teve |com )?(?:a )?maior\b/.test(folded) ||
    /\bmaior (?:saida|entrada|gasto)\b/.test(folded)
  );
}

function isCostCenterTopNQuestion(folded: string): boolean {
  return (
    /\b(?:os\s+)?\d+\s+centros?(?:\s+de\s+custo)?\b/.test(folded) ||
    /\bquais (?:foram )?os\s+\d+\s+centros?\b/.test(folded) ||
    /\btop\s+\d+\s+centros?\b/.test(folded)
  );
}

function isCostCenterLookupQuestion(folded: string): boolean {
  return (
    /\b(gastei|gastos?|paguei|quanto (?:eu )?gastei|quanto entrou|recebi pelo)\b/.test(folded) ||
    /\bquanto (?:o |a )?centro\b/.test(folded)
  );
}

function isCostCenterShareQuestion(folded: string): boolean {
  return /\brepresent/.test(folded);
}

function isCostCenterAnaphora(folded: string): boolean {
  return /\b(nesse|neste|desse|deste|esse|este)\s+centro\b/.test(folded);
}

function isCostCenterComparison(folded: string): boolean {
  return /\b(compare|comparad|comparando|comparacao|versus|\bvs\.?)\b/.test(folded);
}

function isCurrentSnapshotCue(folded: string): boolean {
  return /\b(hoje|agora|atual|atualmente|neste momento)\b/.test(folded);
}

function hasNamedPeriodAttribution(folded: string): boolean {
  return (
    /\b(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\b/.test(
      folded,
    ) || /\b\d{4}-(0[1-9]|1[0-2])\b/.test(folded)
  );
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
