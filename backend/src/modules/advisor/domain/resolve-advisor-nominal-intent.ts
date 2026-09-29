import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
} from './advisor-cash-realized-breakdown.js';
import { extractAdvisorDrilldownLimit } from './resolve-advisor-drilldown-intent.js';
import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from './advisor-nominal-dimension.js';
import {
  resolveAdvisorCivilRange,
  type AdvisorCivilRange,
} from './resolve-advisor-civil-range.js';

export type AdvisorNominalIntent = {
  readonly toolName:
    | typeof CASH_NOMINAL_RANKING_TOOL_NAME
    | typeof CASH_NOMINAL_LOOKUP_TOOL_NAME
    | typeof COMPARE_CASH_NOMINAL_TOOL_NAME;
  readonly categoryReference?: string;
  readonly entityQuery?: string;
  readonly limit: number;
  /** Período anual/YTD oficial; ausente = monthKey do resolvedor mensal. */
  readonly civilRange?: AdvisorCivilRange;
};

/**
 * Intenção nominal da pergunta atual. Não resolve monthKey mensal;
 * resolve civilRange anual/YTD quando aplicável (F13.8.3).
 */
export function resolveAdvisorNominalIntent(
  content: string,
  options: { readonly comparison?: boolean; readonly now?: Date } = {},
): AdvisorNominalIntent | null {
  const folded = foldPt(content);
  const convenioCue = /\bconvenios?\b/.test(folded);
  const entityQuery = extractAdvisorNominalEntityQuery(content);
  const wantsRank =
    /\b(mais fatur(?:ei|ou|aram|ava)?|que mais fatur(?:ei|ou|aram)?|que eu mais fatur(?:ei|ou)?|top\s+\d+|quanto recebi de cada|quais foram os\s+\d+\s+convenios|representam do total)\b/.test(
      folded,
    ) ||
    (convenioCue &&
      /\b(ranking|maiores|maior|individual|mais gerou|mais geraram)\b/.test(folded));
  const wantsLookup =
    (/\bquanto (?:eu )?recebi (?:da|do|de)\b/.test(folded) ||
      /\bquanto (?:a|o)\s+.+\s+fatur(?:ou|aram|ei)\b/.test(folded) ||
      /\bquanto (?:a|o)\s+.+\s+recebeu\b/.test(folded)) &&
    entityQuery !== null;
  const wantsCompare =
    options.comparison === true &&
    (/\bcresceu\b|\bcompare\b|\bcompar/.test(folded) || (entityQuery !== null && convenioCue));

  const civilRange = resolveAdvisorCivilRange({ content, now: options.now });

  // Comparação anual não entra nesta fase — se há civilRange, não roteia compare.
  if (wantsCompare && (convenioCue || entityQuery !== null) && civilRange === null) {
    return {
      toolName: COMPARE_CASH_NOMINAL_TOOL_NAME,
      categoryReference: convenioCue ? 'convenio' : undefined,
      ...(entityQuery !== null ? { entityQuery } : {}),
      limit: extractAdvisorDrilldownLimit(folded),
    };
  }

  if (wantsLookup) {
    return {
      toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
      ...(convenioCue ? { categoryReference: 'convenio' } : {}),
      entityQuery: entityQuery ?? undefined,
      limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
      ...(civilRange !== null ? { civilRange } : {}),
    };
  }

  if (convenioCue && wantsRank) {
    return {
      toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
      categoryReference: 'convenio',
      limit: extractAdvisorDrilldownLimit(folded),
      ...(civilRange !== null ? { civilRange } : {}),
    };
  }

  return null;
}

export function extractAdvisorNominalEntityQuery(content: string): string | null {
  const received = /quanto(?:\s+eu)?\s+recebi\s+(?:da|do|de)\s+(.+)/i.exec(content);
  const receivedEntity = /quanto\s+(?:a|o)\s+(.+?)\s+(?:recebeu|fatur(?:ou|aram|ei))/i.exec(content);
  const grew = /quanto\s+(?:a|o)\s+(.+?)\s+cresceu/i.exec(content);
  const compare = /compare\s+(.+?)(?:\s+ness|\s+em\s+|\s+de\s+jul|\s+de\s+ago|[?.!]|$)/i.exec(content);
  const raw = received?.[1] ?? receivedEntity?.[1] ?? grew?.[1] ?? compare?.[1];
  if (raw === undefined) {
    return null;
  }
  const cleaned = raw
    .replace(/\s+em\s+.+?$/i, '')
    .replace(/\s+neste\s+ano.*$/i, '')
    .replace(/\s+este\s+ano.*$/i, '')
    .replace(/\s+no\s+ano.*$/i, '')
    .replace(/\s+de\s+\d{4}.*$/i, '')
    .replace(/[?.!].*$/g, '')
    .trim();
  if (cleaned === '' || isPeriodOnlyQuery(cleaned)) {
    return null;
  }
  return cleaned;
}

function isPeriodOnlyQuery(value: string): boolean {
  const folded = foldPt(value);
  return /^(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?|meses?|anos?)(?:\s+e\s+(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?|meses?|anos?))*$/.test(
    folded,
  );
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
