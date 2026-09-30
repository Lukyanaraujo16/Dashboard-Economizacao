import type { AnalyticalQuery } from './analytical/analytical-query.js';
import type { AnalyticalFilters } from './analytical/analytical-filters.js';
import type {
  AnalyticalDimensionKey,
  AnalyticalDirection,
  AnalyticalOperationKey,
} from './analytical/analytical-keys.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import {
  validateAnalyticalCapability,
  type AnalyticalCapabilityValidation,
} from './analytical/validate-analytical-capability.js';
import { extractExplicitAdvisorTopNLimit } from './resolve-advisor-drilldown-intent.js';
import { extractAdvisorNominalEntityQuery } from './resolve-advisor-nominal-intent.js';
import { resolveAdvisorCivilRange } from './resolve-advisor-civil-range.js';
import { resolveAdvisorCurrentSnapshotIntent } from './resolve-advisor-current-snapshot-intent.js';
import {
  listAdvisorNamedPeriodKeys,
  resolveAdvisorPeriod,
} from './resolve-advisor-period.js';

/**
 * Intenção analítica universal (F13.8.5E).
 * Entender não publica capability: o Registry continua a autoridade.
 * Sem Prisma, HTTP, provider, tenant ou SQL.
 */
export type UniversalAnalyticalIntent =
  | { readonly kind: 'UNRESOLVED' }
  | { readonly kind: 'UNSUPPORTED_ORDINAL' }
  | {
      readonly kind: 'RESOLVED';
      readonly query: AnalyticalQuery;
      readonly validation: AnalyticalCapabilityValidation;
    };

export type ResolveUniversalAnalyticalIntentInput = {
  readonly content: string;
  readonly now?: Date;
  readonly referenceMonthKey?: string;
};

const ORDINAL_CUE = /\b(?:segundo|terceiro|quarto|penultimo)\s+colocado\b/;
const UNSUPPORTED_DOMAIN =
  /\b(?:produtos?|funcionarios?|colaboradores?|empregados?|folha de pagamento|comissoes?)\b/;

/**
 * Direção pela perspectiva de caixa da empresa.
 * "Recebeu" isolado não decide: quem recebeu importa.
 */
export function resolveCompanyCashDirection(content: string): AnalyticalDirection | null {
  const folded = foldPt(content);
  if (/\bfornecedor(?:es)?\b/.test(folded) && /\bme pagou\b/.test(folded)) {
    return 'INFLOW';
  }
  if (
    /\bclientes?\b/.test(folded) &&
    /\b(?:me pagou|pagou para a empresa|pagou pra empresa)\b/.test(folded)
  ) {
    return 'INFLOW';
  }
  if (
    /\bfornecedor(?:es)?\b/.test(folded) &&
    (/\breceb/.test(folded) ||
      /\bpaguei\b/.test(folded) ||
      /\bpagamos\b/.test(folded) ||
      /\bempresa pagou\b/.test(folded))
  ) {
    return 'OUTFLOW';
  }
  if (/\b(?:a empresa recebeu|empresa recebeu|recebemos|entrou no caixa)\b/.test(folded)) {
    return 'INFLOW';
  }
  if (/\b(?:a empresa pagou|empresa pagou|pagamos|paguei)\b/.test(folded)) {
    return 'OUTFLOW';
  }
  const inflow =
    /\b(?:entradas?|recebimentos?)\b/.test(folded) || /\bgerou entradas?\b/.test(folded);
  const outflow = /\b(?:saidas?|pagamentos?|desembolsos?)\b/.test(folded);
  if (inflow && !outflow) {
    return 'INFLOW';
  }
  if (outflow && !inflow) {
    return 'OUTFLOW';
  }
  return null;
}

export function resolveUniversalAnalyticalIntent(
  input: ResolveUniversalAnalyticalIntentInput,
): UniversalAnalyticalIntent {
  const folded = foldPt(input.content);
  if (ORDINAL_CUE.test(folded)) {
    return { kind: 'UNSUPPORTED_ORDINAL' };
  }
  if (UNSUPPORTED_DOMAIN.test(folded)) {
    return { kind: 'UNRESOLVED' };
  }

  const month = resolveAdvisorPeriod({
    content: input.content,
    now: input.now,
    referenceMonthKey: input.referenceMonthKey,
  });
  const snapshot = resolveAdvisorCurrentSnapshotIntent({
    content: input.content,
    period: { source: month.source, comparison: false },
  });
  if (snapshot !== null) {
    return { kind: 'UNRESOLVED' };
  }

  const comparison = resolveComparisonQuery(input, folded);
  if (comparison !== null) {
    return comparison;
  }

  const dimension = resolveDimension(folded);
  if (dimension === null) {
    return { kind: 'UNRESOLVED' };
  }
  const direction = resolveCompanyCashDirection(input.content);
  if (direction === null) {
    return { kind: 'UNRESOLVED' };
  }
  const identity = resolveSearchIdentity(input.content);
  const explicitLimit = extractExplicitAdvisorTopNLimit(folded);
  const operation = resolveOperation(folded, dimension, explicitLimit, identity);
  if (operation === null) {
    return { kind: 'UNRESOLVED' };
  }
  const period = resolveFlowPeriod(input);
  if (period === null) {
    return { kind: 'UNRESOLVED' };
  }
  const filters = buildFilters(dimension);
  const limit = resolveLimit(operation, explicitLimit);
  const query: AnalyticalQuery = {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction,
    period,
    ...(dimension.dimension !== null ? { dimension: dimension.dimension } : {}),
    operation,
    ...(filters !== undefined ? { filters } : {}),
    ...(identity !== undefined && operation === 'LOOKUP'
      ? { identity: { kind: 'QUERY', query: identity } }
      : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
  return {
    kind: 'RESOLVED',
    query,
    validation: validateAnalyticalCapability(query),
  };
}

/**
 * Limitação determinística. O motivo vem do Registry, não da frase nem de coverage local.
 */
export function composeCapabilityDeniedAnswer(input: {
  readonly query: AnalyticalQuery;
  readonly validation: Extract<AnalyticalCapabilityValidation, { ok: false }>;
}): string {
  const subject =
    input.query.operation === 'RANKING_WINNER' || input.query.operation === 'RANKING_TOPN'
      ? 'esse ranking'
      : 'esse recorte';
  if (input.validation.reason === 'MISSING_REQUIRED_FILTER') {
    return `Não consigo fechar ${subject} com segurança porque os dados disponíveis não trazem o recorte oficial necessário.`;
  }
  return `Não consigo fechar ${subject} com segurança porque não há suporte analítico oficial suficiente para essa combinação nos dados disponíveis.`;
}

type DimensionResolution = {
  readonly dimension: AnalyticalDimensionKey | null;
  readonly movementWording: boolean;
  readonly partyProfile?: 'CUSTOMER' | 'SUPPLIER';
  readonly categoryReference?: 'convenio';
};

function resolveDimension(folded: string): DimensionResolution | null {
  if (/\bcentros?(?:\s+de\s+custo)?\b/.test(folded)) {
    return { dimension: 'COST_CENTER', movementWording: false };
  }
  if (/\bcategorias?\b/.test(folded) || /\bpor categoria\b/.test(folded)) {
    return { dimension: 'CATEGORY', movementWording: false };
  }
  if (/\bconvenios?\b/.test(folded)) {
    return {
      dimension: 'COUNTERPARTY',
      movementWording: false,
      categoryReference: 'convenio',
    };
  }
  if (/\bfornecedor(?:es)?\b/.test(folded)) {
    return { dimension: 'COUNTERPARTY', movementWording: false, partyProfile: 'SUPPLIER' };
  }
  if (/\bclientes?\b/.test(folded)) {
    return { dimension: 'COUNTERPARTY', movementWording: false, partyProfile: 'CUSTOMER' };
  }
  if (
    /\bcontrapartes?\b/.test(folded) ||
    /\bquem mais\b/.test(folded) ||
    /\b(?:pagadores?|beneficiarios?)\b/.test(folded)
  ) {
    return { dimension: 'COUNTERPARTY', movementWording: false };
  }
  if (/\b(?:lancamentos?|movimentos?|recebimentos?|pagamentos?|entradas?|saidas?)\b/.test(folded)) {
    return { dimension: null, movementWording: true };
  }
  if (/\bquanto\b/.test(folded)) {
    return { dimension: null, movementWording: false };
  }
  return null;
}

function resolveOperation(
  folded: string,
  dimension: DimensionResolution,
  explicitLimit: number | null,
  identity: string | undefined,
): AnalyticalOperationKey | null {
  if (
    dimension.dimension === 'CATEGORY' &&
    (/\bpor categoria\b/.test(folded) || /\bcategorias?\b/.test(folded))
  ) {
    return 'BREAKDOWN';
  }
  if (dimension.dimension === null && dimension.movementWording) {
    return 'MOVEMENTS';
  }
  if (explicitLimit !== null && dimension.dimension !== null) {
    return 'RANKING_TOPN';
  }
  if (/\b(?:qual|quem)\b/.test(folded) && /\b(?:mais|maior)\b/.test(folded)) {
    return 'RANKING_WINNER';
  }
  if (/\bquanto\b/.test(folded) && identity !== undefined) {
    return 'LOOKUP';
  }
  if (/\bquanto\b/.test(folded) && dimension.dimension === null) {
    return 'VALUE';
  }
  return null;
}

function resolveLimit(
  operation: AnalyticalOperationKey,
  explicitLimit: number | null,
): number | undefined {
  if (operation === 'RANKING_WINNER') {
    return 1;
  }
  if (operation === 'VALUE' || operation === 'LOOKUP' || operation === 'COMPARE') {
    return undefined;
  }
  return explicitLimit ?? 5;
}

function resolveSearchIdentity(content: string): string | undefined {
  const raw = extractAdvisorNominalEntityQuery(content) ?? extractCounterpartyPayerIdentity(content);
  if (raw === null) {
    return undefined;
  }
  const folded = foldPt(raw);
  if (/^(?:empresa|nos|a gente|fornecedor(?:es)?|clientes?|convenios?|contrapartes?)$/.test(folded)) {
    return undefined;
  }
  return raw;
}

function extractCounterpartyPayerIdentity(content: string): string | null {
  const match =
    /quanto\s+(?:o|a)\s+(?:fornecedor|cliente|conv[eê]nio)\s+(.+?)\s+pagou/i.exec(content);
  const raw = match?.[1]?.replace(/[?.!].*$/g, '').trim();
  if (raw === undefined || raw === '') {
    return null;
  }
  return raw;
}

function resolveFlowPeriod(input: ResolveUniversalAnalyticalIntentInput): AnalyticalPeriod | null {
  const civil = resolveAdvisorCivilRange({ content: input.content, now: input.now });
  if (civil?.kind === 'YEAR') {
    return {
      kind: 'YEAR',
      year: civil.year,
      rangeKey: civil.rangeKey,
      isPartialYear: false,
      from: civil.from,
      to: civil.to,
    };
  }
  if (civil?.kind === 'YTD') {
    return {
      kind: 'YTD',
      year: civil.year,
      rangeKey: civil.rangeKey,
      from: civil.from,
      to: civil.to,
      asOf: civil.asOf,
    };
  }
  const month = resolveAdvisorPeriod({
    content: input.content,
    now: input.now,
    referenceMonthKey: input.referenceMonthKey,
  });
  return { kind: 'MONTH', monthKey: month.monthKey };
}

function resolveComparisonQuery(
  input: ResolveUniversalAnalyticalIntentInput,
  folded: string,
): UniversalAnalyticalIntent | null {
  if (!/\bcompar/.test(folded)) {
    return null;
  }
  const keys = listAdvisorNamedPeriodKeys({
    content: input.content,
    now: input.now,
    referenceMonthKey: input.referenceMonthKey,
  });
  if (keys.length < 2) {
    return { kind: 'UNRESOLVED' };
  }
  const query: AnalyticalQuery = {
    semanticFamily: 'BILLING',
    metric: 'BILLING',
    period: {
      kind: 'COMPARISON',
      left: { kind: 'MONTH', monthKey: keys[0]! },
      right: { kind: 'MONTH', monthKey: keys[1]! },
    },
    operation: 'COMPARE',
  };
  return {
    kind: 'RESOLVED',
    query,
    validation: validateAnalyticalCapability(query),
  };
}

function buildFilters(dimension: DimensionResolution): AnalyticalFilters | undefined {
  const filters: {
    partyProfile?: 'CUSTOMER' | 'SUPPLIER';
    categoryReference?: string;
  } = {};
  if (dimension.partyProfile !== undefined) {
    filters.partyProfile = dimension.partyProfile;
  }
  if (dimension.categoryReference !== undefined) {
    filters.categoryReference = dimension.categoryReference;
  }
  if (filters.partyProfile === undefined && filters.categoryReference === undefined) {
    return undefined;
  }
  return filters;
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
