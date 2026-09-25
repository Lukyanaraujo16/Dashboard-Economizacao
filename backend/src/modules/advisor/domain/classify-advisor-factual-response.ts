import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from './advisor-nominal-dimension.js';
import type { AdvisorNominalAnaphoraStatus } from './resolve-advisor-conversational-nominal.js';

export const ADVISOR_FACTUAL_RESPONSE_KINDS = [
  'FACTUAL_CLOSED',
  'INTERPRETIVE',
  'UNRESOLVED',
] as const;

export type AdvisorFactualResponseKind = (typeof ADVISOR_FACTUAL_RESPONSE_KINDS)[number];

export const ADVISOR_FACTUAL_INTENT_KINDS = [
  'RANKING_WINNER',
  'RANKING_TOPN',
  'RANKING_SHARE',
  'LOOKUP',
  'COMPARISON',
  'IDENTITY_AMBIGUITY',
  'FACTUAL_LIMITATION',
  'INTERPRETIVE',
  'NONE',
] as const;

export type AdvisorFactualIntentKind = (typeof ADVISOR_FACTUAL_INTENT_KINDS)[number];

export type AdvisorFactualClassification = {
  readonly kind: AdvisorFactualResponseKind;
  readonly intentKind: AdvisorFactualIntentKind;
  readonly factKind: string | null;
};

export type ClassifyAdvisorFactualResponseInput = {
  readonly content: string;
  readonly anaphora: AdvisorNominalAnaphoraStatus;
  readonly toolName: string | null;
  readonly toolOk: boolean;
  readonly facts: Record<string, unknown> | null;
};

/**
 * Na dúvida, INTERPRETIVE/UNRESOLVED — o composer só fecha o que já está determinado.
 */
export function classifyAdvisorFactualResponse(
  input: ClassifyAdvisorFactualResponseInput,
): AdvisorFactualClassification {
  if (isAdvisorInterpretiveQuestion(input.content)) {
    return {
      kind: 'INTERPRETIVE',
      intentKind: 'INTERPRETIVE',
      factKind: readFactKind(input.facts),
    };
  }

  const facts = input.facts;
  const status = typeof facts?.status === 'string' ? facts.status : null;
  const factKind = readFactKind(facts);

  if (isAdvisorNominalIdentityFollowUp(input.content)) {
    if (
      input.toolName === CASH_NOMINAL_RANKING_TOOL_NAME &&
      input.toolOk &&
      facts !== null &&
      status === 'OK' &&
      hasIdentityAmbiguityFacts(facts)
    ) {
      return {
        kind: 'FACTUAL_CLOSED',
        intentKind: 'IDENTITY_AMBIGUITY',
        factKind,
      };
    }
    return { kind: 'UNRESOLVED', intentKind: 'IDENTITY_AMBIGUITY', factKind };
  }

  if (!input.toolOk || facts === null) {
    return { kind: 'UNRESOLVED', intentKind: 'NONE', factKind };
  }

  if (input.toolName === CASH_NOMINAL_RANKING_TOOL_NAME) {
    if (status === 'OK' && hasRankingClosedFacts(facts)) {
      if (isAdvisorNominalShareQuestion(input.content)) {
        return { kind: 'FACTUAL_CLOSED', intentKind: 'RANKING_SHARE', factKind };
      }
      if (isAdvisorNominalWinnerQuestion(input.content)) {
        return { kind: 'FACTUAL_CLOSED', intentKind: 'RANKING_WINNER', factKind };
      }
      return { kind: 'FACTUAL_CLOSED', intentKind: 'RANKING_TOPN', factKind };
    }
    if (isKnownAbsentStatus(status)) {
      return { kind: 'FACTUAL_CLOSED', intentKind: 'FACTUAL_LIMITATION', factKind };
    }
    return { kind: 'UNRESOLVED', intentKind: 'RANKING_WINNER', factKind };
  }

  if (input.toolName === CASH_NOMINAL_LOOKUP_TOOL_NAME) {
    if (status === 'OK' && hasLookupClosedFacts(facts)) {
      return { kind: 'FACTUAL_CLOSED', intentKind: 'LOOKUP', factKind };
    }
    if (
      isKnownAbsentStatus(status) ||
      input.anaphora === 'AMBIGUOUS' ||
      input.anaphora === 'UNRESOLVED'
    ) {
      return { kind: 'FACTUAL_CLOSED', intentKind: 'FACTUAL_LIMITATION', factKind };
    }
    return { kind: 'UNRESOLVED', intentKind: 'LOOKUP', factKind };
  }

  if (input.toolName === COMPARE_CASH_NOMINAL_TOOL_NAME) {
    if (status === 'OK' && hasComparisonClosedFacts(facts)) {
      return { kind: 'FACTUAL_CLOSED', intentKind: 'COMPARISON', factKind };
    }
    if (isKnownAbsentStatus(status)) {
      return { kind: 'FACTUAL_CLOSED', intentKind: 'FACTUAL_LIMITATION', factKind };
    }
    return { kind: 'UNRESOLVED', intentKind: 'COMPARISON', factKind };
  }

  return { kind: 'UNRESOLVED', intentKind: 'NONE', factKind };
}

export function isAdvisorInterpretiveQuestion(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\bo que voce acha\b/.test(folded) ||
    /\bestrategias?\b/.test(folded) ||
    /\brecomend/.test(folded) ||
    /\bcomo (?:posso |devo )?(?:aumentar|melhorar|fazer)\b/.test(folded) ||
    /\bo que (?:posso |devo )?fazer\b/.test(folded) ||
    /\bpriorizar\b/.test(folded) ||
    /\b(?:isso |esse crescimento |essa concentracao )?e (?:bom|ruim)\b/.test(folded) ||
    /\bpor que .{0,80}(?:cresceu|aumentou|caiu|diminuiu|mudou)\b/.test(folded)
  );
}

export function isAdvisorNominalIdentityFollowUp(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\bposso somar\b/.test(folded) ||
    /\be a mesma empresa\b/.test(folded) ||
    /\be o mesmo convenio\b/.test(folded) ||
    /\besse valor pertence\b/.test(folded) ||
    /\bposso considerar tudo como\b/.test(folded) ||
    /\bconsiderar tudo como\b/.test(folded) ||
    /\besses dois sao a mesma\b/.test(folded) ||
    /\bmesma entidade\b/.test(folded)
  );
}

export function isAdvisorNominalShareQuestion(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\brepresentam do total\b/.test(folded) ||
    /\bquanto os \d+ maiores\b/.test(folded) ||
    /\bos \d+ maiores .{0,40}represent/.test(folded)
  );
}

export function isAdvisorNominalWinnerQuestion(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\bmais fatur\b/.test(folded) ||
    /\bque mais\b/.test(folded) ||
    /\bqual convenio(?: individual)?\b/.test(folded)
  );
}

function hasRankingClosedFacts(facts: Record<string, unknown>): boolean {
  const population = asRecord(facts.population);
  const coverage = asRecord(facts.coverage);
  const cardinality = asRecord(facts.cardinality);
  const identityCoverage = asRecord(facts.identityCoverage);
  const ranking = Array.isArray(facts.ranking) ? facts.ranking : null;
  return (
    isAmount(population?.amount) &&
    isAmount(identityCoverage?.identifiedAmount) &&
    (isAmount(coverage?.identifiedPercent) || isAmount(coverage?.amountPercent)) &&
    typeof cardinality?.returnedCount === 'number' &&
    typeof cardinality?.identifiedEntityCount === 'number' &&
    ranking !== null
  );
}

function hasLookupClosedFacts(facts: Record<string, unknown>): boolean {
  const entity = asRecord(facts.entity);
  return (
    entity !== null &&
    entity.identityStatus === 'IDENTIFIED' &&
    typeof entity.displayName === 'string' &&
    entity.displayName.trim() !== '' &&
    isAmount(entity.amount) &&
    isAmount(entity.shareOfPopulation) &&
    isAmount(facts.populationAmount)
  );
}

function hasComparisonClosedFacts(facts: Record<string, unknown>): boolean {
  const items = Array.isArray(facts.items) ? facts.items : [];
  const first = asRecord(items[0]);
  return (
    typeof facts.monthKey === 'string' &&
    typeof facts.comparisonMonthKey === 'string' &&
    first !== null &&
    typeof first.displayName === 'string' &&
    isAmount(first.amountA) &&
    isAmount(first.amountB) &&
    isAmount(first.deltaAmount)
  );
}

function hasIdentityAmbiguityFacts(facts: Record<string, unknown>): boolean {
  const identityCoverage = asRecord(facts.identityCoverage);
  const ranking = Array.isArray(facts.ranking) ? facts.ranking : [];
  return (
    isAmount(identityCoverage?.ambiguousAmount) &&
    identityCoverage!.ambiguousAmount !== '0' &&
    ranking.some((row) => asRecord(row)?.identityStatus === 'IDENTIFIED')
  );
}

function isKnownAbsentStatus(status: string | null): boolean {
  return (
    status === 'UNAVAILABLE' ||
    status === 'ABSENT' ||
    status === 'NOT_FOUND' ||
    status === 'AMBIGUOUS' ||
    status === 'UNRESOLVED' ||
    status === 'INSUFFICIENT'
  );
}

function readFactKind(facts: Record<string, unknown> | null): string | null {
  return typeof facts?.factKind === 'string' ? facts.factKind : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAmount(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value);
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
