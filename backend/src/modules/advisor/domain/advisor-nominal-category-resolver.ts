import { foldAdvisorNominalText, tokenizeAdvisorNominalText } from './advisor-nominal-text.js';

export const ADVISOR_CATEGORY_RESOLUTIONS = ['RESOLVED', 'NOT_FOUND', 'AMBIGUOUS'] as const;
export type AdvisorCategoryResolutionStatus = (typeof ADVISOR_CATEGORY_RESOLUTIONS)[number];

export type AdvisorResolvableCategory = {
  readonly key: string;
  readonly name: string;
  readonly type: string;
};

export type AdvisorResolvedCategory = {
  readonly key: string;
  readonly name: string;
};

export type AdvisorCategoryResolution =
  | { readonly status: 'RESOLVED'; readonly category: AdvisorResolvedCategory }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'AMBIGUOUS'; readonly candidates: readonly AdvisorResolvedCategory[] };

/**
 * Resolução tenant-scoped, determinística, sem SQL/ILIKE/fuzzy.
 * Match exato de key/nome; senão contenção única de tokens.
 */
export function resolveAdvisorOfficialCategory(
  reference: string,
  catalog: readonly AdvisorResolvableCategory[],
  expectedType: 'REVENUE' | 'EXPENSE' = 'REVENUE',
): AdvisorCategoryResolution {
  const query = reference.trim();
  if (query === '') {
    return { status: 'NOT_FOUND' };
  }

  const scoped = catalog.filter((row) => row.type === expectedType);
  const byKey = scoped.filter((row) => row.key === query);
  if (byKey.length === 1) {
    return resolved(byKey[0]!);
  }
  if (byKey.length > 1) {
    return ambiguous(byKey);
  }

  const folded = foldAdvisorNominalText(query);
  const exactName = scoped.filter((row) => foldAdvisorNominalText(row.name) === folded);
  if (exactName.length === 1) {
    return resolved(exactName[0]!);
  }
  if (exactName.length > 1) {
    return ambiguous(exactName);
  }

  const queryTokens = tokenizeAdvisorNominalText(query);
  if (queryTokens.length === 0) {
    return { status: 'NOT_FOUND' };
  }
  const tokenMatches = scoped.filter((row) => {
    const nameTokens = tokenizeAdvisorNominalText(row.name);
    return queryTokens.every((token) => nameTokens.includes(token));
  });
  if (tokenMatches.length === 1) {
    return resolved(tokenMatches[0]!);
  }
  if (tokenMatches.length > 1) {
    return ambiguous(tokenMatches);
  }
  return { status: 'NOT_FOUND' };
}

function resolved(row: AdvisorResolvableCategory): AdvisorCategoryResolution {
  return { status: 'RESOLVED', category: { key: row.key, name: row.name } };
}

function ambiguous(rows: readonly AdvisorResolvableCategory[]): AdvisorCategoryResolution {
  return {
    status: 'AMBIGUOUS',
    candidates: rows.map((row) => ({ key: row.key, name: row.name })),
  };
}
