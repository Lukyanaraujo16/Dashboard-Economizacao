import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
} from './advisor-cash-realized-breakdown.js';
import {
  extractAdvisorDrilldownLimit,
  extractExplicitAdvisorTopNLimit,
} from './resolve-advisor-drilldown-intent.js';
import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from './advisor-nominal-dimension.js';
import {
  resolveAdvisorCivilRange,
  type AdvisorCivilRange,
} from './resolve-advisor-civil-range.js';
import {
  isAdvisorNominalWinnerQuestion,
} from './classify-advisor-factual-response.js';

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

const DIMENSION_REFERENCES = [
  'convenio',
  'fornecedor',
  'cliente',
  'contraparte',
] as const;

/**
 * Intenção nominal da pergunta atual. Não resolve monthKey mensal;
 * resolve civilRange anual/YTD quando aplicável (F13.8.3).
 */
export function resolveAdvisorNominalIntent(
  content: string,
  options: { readonly comparison?: boolean; readonly now?: Date } = {},
): AdvisorNominalIntent | null {
  const folded = foldPt(content);
  const categoryReference = extractAdvisorNominalCategoryReference(folded);
  const entityQuery = extractAdvisorNominalEntityQuery(content);
  const wantsRank =
    /\b(mais fatur(?:ei|ou|aram|ava)?|que mais fatur(?:ei|ou|aram)?|que eu mais fatur(?:ei|ou)?|top\s+\d+|quanto recebi de cada|quais foram os\s+\d+\s+(?:convenios?|fornecedor(?:es)?|clientes?|contrapartes?)|representam do total)\b/.test(
      folded,
    ) ||
    (categoryReference !== undefined &&
      /\b(ranking|maiores|maior|individual|mais gerou|mais geraram)\b/.test(folded));
  const wantsLookup =
    entityQuery !== null &&
    (/\bquanto (?:eu )?recebi (?:da|do|de)\b/.test(folded) ||
      /\bquanto (?:a|o)\s+.+\s+fatur(?:ou|aram|ei)\b/.test(folded) ||
      /\bquanto (?:a|o)\s+.+\s+recebeu\b/.test(folded) ||
      /\bquanto (?:a|o)\s+.+\s+gerou\b/.test(folded) ||
      /\bgerou (?:de )?entrada(?:s)?(?:\s+de\s+caixa)?\b/.test(folded) ||
      /\bentrada(?:s)?\s+de\s+caixa\b/.test(folded));
  const wantsCompare =
    options.comparison === true &&
    (/\bcresceu\b|\bcompare\b|\bcompar/.test(folded) ||
      (entityQuery !== null && categoryReference !== undefined));

  const civilRange = resolveAdvisorCivilRange({ content, now: options.now });

  // Comparação anual não entra nesta fase — se há civilRange, não roteia compare.
  if (wantsCompare && (categoryReference !== undefined || entityQuery !== null) && civilRange === null) {
    return {
      toolName: COMPARE_CASH_NOMINAL_TOOL_NAME,
      ...(categoryReference !== undefined ? { categoryReference } : {}),
      ...(entityQuery !== null ? { entityQuery } : {}),
      limit: extractAdvisorDrilldownLimit(folded),
    };
  }

  if (wantsLookup) {
    return {
      toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
      ...(categoryReference !== undefined ? { categoryReference } : {}),
      entityQuery: entityQuery ?? undefined,
      limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
      ...(civilRange !== null ? { civilRange } : {}),
    };
  }

  if (categoryReference !== undefined && wantsRank) {
    return {
      toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
      categoryReference,
      limit: resolveNominalRankingLimit(content, folded),
      ...(civilRange !== null ? { civilRange } : {}),
    };
  }

  return null;
}

/**
 * WINNER → requestedLimit=1; TOP N explícito → N; demais → default da tool.
 */
function resolveNominalRankingLimit(content: string, folded: string): number {
  const explicit = extractExplicitAdvisorTopNLimit(folded);
  if (explicit !== null) {
    return explicit;
  }
  if (isAdvisorNominalWinnerQuestion(content)) {
    return 1;
  }
  return ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
}

/**
 * Só convênio é categoryReference executável.
 * Fornecedor, cliente e contraparte são papel de COUNTERPARTY, não categoria default.
 */
export function extractAdvisorNominalCategoryReference(folded: string): string | undefined {
  if (/\bconvenios?\b/.test(folded)) {
    return 'convenio';
  }
  return undefined;
}

export function extractAdvisorNominalEntityQuery(content: string): string | null {
  const dimensionAlt = 'conv[eê]nios?|fornecedor(?:es)?|clientes?|contrapartes?';
  const patterns: RegExp[] = [
    new RegExp(
      `quanto\\s+(?:o|a)\\s+(?:${dimensionAlt})\\s+(.+?)\\s+(?:gerou|recebeu|fatur(?:ou|aram|ei))`,
      'i',
    ),
    /quanto(?:\s+eu)?\s+recebi\s+(?:da|do|de)\s+(.+)/i,
    /quanto\s+(?:a|o)\s+(.+?)\s+(?:gerou|recebeu|fatur(?:ou|aram|ei))/i,
    /quanto\s+(?:a|o)\s+(.+?)\s+cresceu/i,
    /compare\s+(.+?)(?:\s+ness|\s+em\s+|\s+de\s+jul|\s+de\s+ago|[?.!]|$)/i,
  ];
  let raw: string | undefined;
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1] !== undefined) {
      raw = match[1];
      break;
    }
  }
  if (raw === undefined) {
    return null;
  }
  const cleaned = raw
    .replace(new RegExp(`^(?:${dimensionAlt})\\s+`, 'i'), '')
    .replace(/\s+de\s+entrada(?:s)?(?:\s+de\s+caixa)?.*$/i, '')
    .replace(/\s+em\s+entrada(?:s)?(?:\s+de\s+caixa)?.*$/i, '')
    .replace(/\s+em\s+.+?$/i, '')
    .replace(/\s+neste\s+ano.*$/i, '')
    .replace(/\s+este\s+ano.*$/i, '')
    .replace(/\s+no\s+ano.*$/i, '')
    .replace(/\s+de\s+\d{4}.*$/i, '')
    .replace(/[?.!].*$/g, '')
    .trim();
  if (cleaned === '' || isPeriodOnlyQuery(cleaned) || isDimensionOnlyQuery(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Probe curto de entidade: "E a Unimed?", "A Vale?".
 * Não é autoridade financeira — só extrai o nome para lookup estruturado.
 */
export function extractShortNominalEntityProbe(content: string): string | null {
  const trimmed = content.trim().replace(/[?.!]+$/g, '').trim();
  const match = /^(?:e\s+)?(?:a|o)\s+(.+)$/i.exec(trimmed);
  if (match?.[1] === undefined) {
    return null;
  }
  const cleaned = match[1].trim();
  if (cleaned === '' || cleaned.length < 2 || isPeriodOnlyQuery(cleaned) || isDimensionOnlyQuery(cleaned)) {
    return null;
  }
  // "O que …" / "A que …" são interrogativos, não entidade nominal curta.
  if (/^que\b/i.test(cleaned)) {
    return null;
  }
  if (/\b(quanto|quais|mostre|ranking|entrada|caixa|ano|mes)\b/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function isDimensionOnlyQuery(value: string): boolean {
  const folded = foldPt(value);
  return new RegExp(`^(?:${DIMENSION_REFERENCES.join('|')})s?$`).test(folded);
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
