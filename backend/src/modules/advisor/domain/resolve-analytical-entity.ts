import type { AnalyticalUnresolvedDimension } from './classify-analytical-outcome.js';
import { foldAdvisorNominalText, tokenizeAdvisorNominalText } from './advisor-nominal-text.js';

/**
 * Resolução de menções contra o catálogo do tenant.
 * Não consulta texto de modelo, não escolhe tenant e não produz fato financeiro.
 */
export const ANALYTICAL_ENTITY_DIMENSIONS = [
  'COST_CENTER',
  'CATEGORY',
  'COUNTERPARTY',
  'FINANCIAL_ACCOUNT',
] as const;

export type AnalyticalEntityDimension = (typeof ANALYTICAL_ENTITY_DIMENSIONS)[number];

export const ANALYTICAL_ENTITY_RESOLUTIONS = ['RESOLVED', 'AMBIGUOUS', 'NOT_FOUND'] as const;
export type AnalyticalEntityResolutionStatus = (typeof ANALYTICAL_ENTITY_RESOLUTIONS)[number];

export const ANALYTICAL_ENTITY_MATCHES = ['EXACT', 'OFFICIAL_NAME', 'DISCRIMINANT_TOKENS'] as const;
export type AnalyticalEntityMatch = (typeof ANALYTICAL_ENTITY_MATCHES)[number];

export type AnalyticalEntityRecord = {
  readonly id: string;
  readonly dimension: AnalyticalEntityDimension;
  readonly name: string;
  readonly code: string | null;
};

export type AnalyticalEntityRef = {
  readonly id: string;
  readonly dimension: AnalyticalEntityDimension;
  readonly name: string;
  readonly code: string | null;
};

export type AnalyticalEntityResolution =
  | {
      readonly status: 'RESOLVED';
      readonly mention: string;
      readonly match: AnalyticalEntityMatch;
      readonly entity: AnalyticalEntityRef;
    }
  | {
      readonly status: 'AMBIGUOUS';
      readonly mention: string;
      readonly candidates: readonly AnalyticalEntityRef[];
    }
  | {
      readonly status: 'NOT_FOUND';
      readonly mention: string;
    };

const MIN_DISCRIMINANT_LENGTH = 3;

const GRAMMATICAL_TOKENS = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'para',
  'pra',
  'com',
  'por',
  'um',
  'uma',
  'uns',
  'umas',
  'que',
  'qual',
  'quais',
  'ou',
  'se',
  'ao',
  'aos',
  'entre',
  'sobre',
  'sem',
  'mais',
  'menos',
  'foi',
  'ter',
  'teve',
]);

function meaningfulTokens(value: string): readonly string[] {
  return tokenizeAdvisorNominalText(value).filter(
    (token) => token.length >= MIN_DISCRIMINANT_LENGTH && !GRAMMATICAL_TOKENS.has(token),
  );
}

function entityTokens(row: AnalyticalEntityRecord): readonly string[] {
  return [
    ...meaningfulTokens(row.name),
    ...(row.code === null ? [] : meaningfulTokens(row.code)),
  ];
}

function toRef(row: AnalyticalEntityRecord): AnalyticalEntityRef {
  return {
    id: row.id,
    dimension: row.dimension,
    name: row.name,
    code: row.code,
  };
}

function byNameThenId(left: AnalyticalEntityRecord, right: AnalyticalEntityRecord): number {
  const name = foldAdvisorNominalText(left.name).localeCompare(foldAdvisorNominalText(right.name));
  if (name !== 0) {
    return name;
  }
  return left.id.localeCompare(right.id);
}

function containsTokenPhrase(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    const matches = needle.every((token, offset) => haystack[start + offset] === token);
    if (matches) {
      return true;
    }
  }
  return false;
}

function resolved(
  mention: string,
  match: AnalyticalEntityMatch,
  row: AnalyticalEntityRecord,
): AnalyticalEntityResolution {
  return { status: 'RESOLVED', mention, match, entity: toRef(row) };
}

function ambiguous(mention: string, rows: readonly AnalyticalEntityRecord[]): AnalyticalEntityResolution {
  return {
    status: 'AMBIGUOUS',
    mention,
    candidates: [...rows].sort(byNameThenId).map(toRef),
  };
}

/**
 * Uma menção contra um catálogo já limitado ao tenant.
 * Exato normalizado, nome oficial contido na menção e tokens inequívocos.
 * Vários candidatos plausíveis permanecem AMBIGUOUS.
 */
export function resolveAnalyticalEntity(
  mention: string,
  catalog: readonly AnalyticalEntityRecord[],
): AnalyticalEntityResolution {
  const surface = mention.trim();
  const folded = foldAdvisorNominalText(surface);
  if (folded === '') {
    return { status: 'NOT_FOUND', mention: surface };
  }

  const exact = catalog.filter((row) => {
    const name = foldAdvisorNominalText(row.name);
    const code = row.code === null ? '' : foldAdvisorNominalText(row.code);
    return name === folded || (code !== '' && code === folded);
  });
  if (exact.length === 1) {
    return resolved(surface, 'EXACT', exact[0]!);
  }
  if (exact.length > 1) {
    return ambiguous(surface, exact);
  }

  const mentionTokens = meaningfulTokens(surface);
  const officialName = catalog.filter((row) => {
    const nameTokens = meaningfulTokens(row.name);
    return nameTokens.length > 0 && containsTokenPhrase(mentionTokens, nameTokens);
  });
  if (officialName.length === 1) {
    return resolved(surface, 'OFFICIAL_NAME', officialName[0]!);
  }
  if (officialName.length > 1) {
    return ambiguous(surface, officialName);
  }

  if (mentionTokens.length === 0) {
    return { status: 'NOT_FOUND', mention: surface };
  }
  const tokenHits = catalog.filter((row) => {
    const tokens = new Set(entityTokens(row));
    return mentionTokens.every((token) => tokens.has(token));
  });
  if (tokenHits.length === 1) {
    return resolved(surface, 'DISCRIMINANT_TOKENS', tokenHits[0]!);
  }
  if (tokenHits.length > 1) {
    return ambiguous(surface, tokenHits);
  }
  return { status: 'NOT_FOUND', mention: surface };
}

function discriminantOwners(
  catalog: readonly AnalyticalEntityRecord[],
): ReadonlyMap<string, AnalyticalEntityRecord> {
  const owners = new Map<string, Map<string, AnalyticalEntityRecord>>();
  for (const row of catalog) {
    for (const token of new Set(entityTokens(row))) {
      const bucket = owners.get(token) ?? new Map<string, AnalyticalEntityRecord>();
      bucket.set(row.id, row);
      owners.set(token, bucket);
    }
  }
  const unique = new Map<string, AnalyticalEntityRecord>();
  for (const [token, bucket] of owners) {
    if (bucket.size === 1) {
      unique.set(token, [...bucket.values()][0]!);
    }
  }
  return unique;
}

/**
 * Localiza menções apoiadas no catálogo, na ordem em que aparecem no texto.
 * Nome oficial consome os tokens antes da parte discriminante restante.
 */
export function resolveAnalyticalEntitiesInText(
  content: string,
  catalog: readonly AnalyticalEntityRecord[],
): readonly AnalyticalEntityResolution[] {
  const tokens = meaningfulTokens(content);
  const consumed = new Set<number>();
  const mentions: Array<{ readonly start: number; readonly text: string }> = [];

  const phrases = catalog
    .map((row) => ({ row, tokens: meaningfulTokens(row.name) }))
    .filter((item) => item.tokens.length > 0)
    .sort((left, right) => right.tokens.length - left.tokens.length || byNameThenId(left.row, right.row));

  for (const phrase of phrases) {
    for (let start = 0; start <= tokens.length - phrase.tokens.length; start += 1) {
      const indexes = phrase.tokens.map((_, offset) => start + offset);
      if (indexes.some((index) => consumed.has(index))) {
        continue;
      }
      const matches = phrase.tokens.every((token, offset) => tokens[start + offset] === token);
      if (!matches) {
        continue;
      }
      for (const index of indexes) {
        consumed.add(index);
      }
      mentions.push({ start, text: phrase.tokens.join(' ') });
    }
  }

  const owners = discriminantOwners(catalog);
  const resolvedIds = new Set(
    mentions
      .map((item) => resolveAnalyticalEntity(item.text, catalog))
      .flatMap((item) => (item.status === 'RESOLVED' ? [item.entity.id] : [])),
  );
  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const token = tokens[index]!;
    const owner = owners.get(token);
    if (owner === undefined || resolvedIds.has(owner.id)) {
      continue;
    }
    consumed.add(index);
    resolvedIds.add(owner.id);
    mentions.push({ start: index, text: token });
  }

  return mentions
    .sort((left, right) => left.start - right.start)
    .map((item) => resolveAnalyticalEntity(item.text, catalog));
}

const TRAIL_DIMENSIONS = new Set<AnalyticalUnresolvedDimension>([
  'CATEGORY',
  'COST_CENTER',
  'COUNTERPARTY',
]);

function trailDimension(dimension: AnalyticalEntityDimension): AnalyticalUnresolvedDimension | null {
  if (TRAIL_DIMENSIONS.has(dimension as AnalyticalUnresolvedDimension)) {
    return dimension as AnalyticalUnresolvedDimension;
  }
  return null;
}

/**
 * Sinal estruturado para a trilha do Bloco 1. Não altera status técnico de ai_runs.
 */
export function analyticalEntityFailureSignal(
  resolution: AnalyticalEntityResolution,
  dimension?: AnalyticalEntityDimension,
): {
  readonly reason: 'ENTITY_NOT_FOUND' | 'ENTITY_AMBIGUOUS';
  readonly dimension: AnalyticalUnresolvedDimension | null;
  readonly entity: string;
} | null {
  if (resolution.status === 'RESOLVED') {
    return null;
  }
  const entity = resolution.mention.trim().slice(0, 80);
  if (resolution.status === 'NOT_FOUND') {
    return {
      reason: 'ENTITY_NOT_FOUND',
      dimension: dimension === undefined ? null : trailDimension(dimension),
      entity,
    };
  }
  const candidateDimension = resolution.candidates[0]?.dimension ?? dimension;
  return {
    reason: 'ENTITY_AMBIGUOUS',
    dimension: candidateDimension === undefined ? null : trailDimension(candidateDimension),
    entity,
  };
}
