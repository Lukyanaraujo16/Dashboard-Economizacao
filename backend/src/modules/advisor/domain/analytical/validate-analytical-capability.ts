import { listAnalyticalCapabilities, type AnalyticalCapability } from './analytical-capability-registry.js';
import { getAnalyticalDimension } from './analytical-dimension-registry.js';
import { isAnalyticalFilterKey, type AnalyticalFilterKey } from './analytical-keys.js';
import { getAnalyticalMetric } from './analytical-metric-registry.js';
import { getAnalyticalOperation } from './analytical-operation-registry.js';
import type { AnalyticalPeriod } from './analytical-period.js';
import type { AnalyticalQuery } from './analytical-query.js';

export const ANALYTICAL_CAPABILITY_DENY_REASONS = [
  'METRIC_NOT_FOUND',
  'SEMANTIC_FAMILY_MISMATCH',
  'INVALID_DIRECTION',
  'DIRECTION_REQUIRED',
  'DIRECTION_FORBIDDEN',
  'INVALID_DIMENSION',
  'PERIOD_INCOMPATIBLE',
  'COMPARISON_INCOMPATIBLE',
  'INVALID_OPERATION',
  'INVALID_FILTER',
  'MISSING_REQUIRED_FILTER',
  'IDENTITY_REQUIRED',
  'IDENTITY_FORBIDDEN_EMPTY',
  'INVALID_LIMIT',
  'WINNER_LIMIT_MUST_BE_ONE',
  'CAPABILITY_NOT_FOUND',
] as const;

export type AnalyticalCapabilityDenyReason =
  (typeof ANALYTICAL_CAPABILITY_DENY_REASONS)[number];

export type AnalyticalCapabilityValidation =
  | { readonly ok: true; readonly capability: AnalyticalCapability }
  | {
      readonly ok: false;
      readonly reason: AnalyticalCapabilityDenyReason;
      readonly message: string;
    };

/**
 * Validador puro deny-by-default. Sem DB. Sem side-effects.
 */
export function validateAnalyticalCapability(
  query: AnalyticalQuery,
): AnalyticalCapabilityValidation {
  const metric = getAnalyticalMetric(query.metric);
  if (metric === undefined) {
    return deny('METRIC_NOT_FOUND', `Métrica desconhecida: ${query.metric}`);
  }
  if (metric.semanticFamily !== query.semanticFamily) {
    return deny(
      'SEMANTIC_FAMILY_MISMATCH',
      `semanticFamily ${query.semanticFamily} não corresponde à métrica ${query.metric} (${metric.semanticFamily}).`,
    );
  }

  if (query.direction !== undefined) {
    if (!metric.possibleDirections.includes(query.direction)) {
      return deny(
        'INVALID_DIRECTION',
        `Direção ${query.direction} incompatível com ${query.metric}.`,
      );
    }
  }

  if (query.dimension !== undefined) {
    const dimension = getAnalyticalDimension(query.dimension);
    if (dimension === undefined) {
      return deny('INVALID_DIMENSION', `Dimensão desconhecida: ${query.dimension}`);
    }
    if (!dimension.compatibleFamilies.includes(query.semanticFamily)) {
      return deny(
        'INVALID_DIMENSION',
        `Dimensão ${query.dimension} incompatível com family ${query.semanticFamily}.`,
      );
    }
  }

  const operation = getAnalyticalOperation(query.operation);
  if (operation === undefined) {
    return deny('INVALID_OPERATION', `Operação desconhecida: ${query.operation}`);
  }

  if (query.operation === 'COMPARE' && query.period.kind !== 'COMPARISON') {
    return deny(
      'PERIOD_INCOMPATIBLE',
      'COMPARE exige period.kind=COMPARISON.',
    );
  }
  if (query.period.kind === 'COMPARISON' && query.operation !== 'COMPARE') {
    return deny(
      'PERIOD_INCOMPATIBLE',
      'period COMPARISON só é válido com operation COMPARE.',
    );
  }

  if (query.identity !== undefined && query.identity.query.trim() === '') {
    return deny('IDENTITY_FORBIDDEN_EMPTY', 'identity.query não pode ser vazio.');
  }

  const filterShape = validateFilterShape(query);
  if (filterShape !== null) {
    return filterShape;
  }

  const limitCheck = validateLimit(query);
  if (limitCheck !== null) {
    return limitCheck;
  }

  const baseCandidates = listAnalyticalCapabilities().filter(
    (capability) =>
      capability.metric === query.metric &&
      capability.semanticFamily === query.semanticFamily &&
      capability.operations.includes(query.operation) &&
      matchesDirection(capability, query) &&
      matchesDimension(capability, query) &&
      matchesPeriod(capability, query.period) &&
      matchesAllowedFiltersOnly(capability, query) &&
      matchesPartyProfile(capability, query) &&
      matchesLimitAgainstCapability(capability, query),
  );

  if (baseCandidates.length === 0) {
    return deny(
      'CAPABILITY_NOT_FOUND',
      'Nenhuma capability publicada para esta combinação (deny by default).',
    );
  }

  const missingRequired = baseCandidates.filter(
    (capability) => !matchesRequiredFilters(capability, query),
  );
  if (
    missingRequired.length === baseCandidates.length &&
    missingRequired.some((c) => c.requiredFilters.length > 0)
  ) {
    return deny(
      'MISSING_REQUIRED_FILTER',
      'Filter obrigatório ausente para a capability publicada.',
    );
  }

  const identityReady = baseCandidates.filter(
    (capability) =>
      matchesRequiredFilters(capability, query) &&
      matchesIdentityRequirement(capability, query),
  );
  if (identityReady.length === 0) {
    if (
      baseCandidates.some(
        (capability) =>
          capability.identityRequired &&
          matchesRequiredFilters(capability, query) &&
          !hasIdentity(query),
      )
    ) {
      return deny('IDENTITY_REQUIRED', 'Operação exige identity.query não vazio.');
    }
    return deny(
      'CAPABILITY_NOT_FOUND',
      'Nenhuma capability publicada para esta combinação (deny by default).',
    );
  }

  return { ok: true, capability: identityReady[0]! };
}

function deny(
  reason: AnalyticalCapabilityDenyReason,
  message: string,
): AnalyticalCapabilityValidation {
  return { ok: false, reason, message };
}

function hasIdentity(query: AnalyticalQuery): boolean {
  return query.identity !== undefined && query.identity.query.trim().length > 0;
}

function matchesDirection(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  if (capability.directions === null) {
    return query.direction === undefined;
  }
  if (query.direction === undefined) {
    return false;
  }
  return capability.directions.includes(query.direction);
}

function matchesDimension(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  const dimension = query.dimension ?? null;
  return capability.dimensions.includes(dimension);
}

function matchesPeriod(
  capability: AnalyticalCapability,
  period: AnalyticalPeriod,
): boolean {
  if (!capability.periodKinds.includes(period.kind)) {
    return false;
  }
  if (period.kind !== 'COMPARISON') {
    return true;
  }
  if (capability.comparisonChildKinds === null) {
    return false;
  }
  return (
    capability.comparisonChildKinds.includes(period.left.kind) &&
    capability.comparisonChildKinds.includes(period.right.kind) &&
    period.left.kind !== 'COMPARISON' &&
    period.right.kind !== 'COMPARISON'
  );
}

function presentFilterKeys(query: AnalyticalQuery): readonly AnalyticalFilterKey[] {
  const filters = query.filters ?? {};
  return (Object.keys(filters) as AnalyticalFilterKey[]).filter((key) => {
    const value = filters[key];
    return value !== undefined && String(value).trim() !== '';
  });
}

function validateFilterShape(
  query: AnalyticalQuery,
): AnalyticalCapabilityValidation | null {
  for (const key of presentFilterKeys(query)) {
    if (!isAnalyticalFilterKey(key)) {
      return deny('INVALID_FILTER', `Filter key inválida: ${key}`);
    }
  }
  return null;
}

function matchesAllowedFiltersOnly(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  for (const key of presentFilterKeys(query)) {
    if (!capability.allowedFilters.includes(key)) {
      return false;
    }
  }
  return true;
}

function matchesPartyProfile(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  const profile = query.filters?.partyProfile;
  if (capability.requiredPartyProfile === undefined) {
    return profile === undefined;
  }
  return profile === capability.requiredPartyProfile;
}

function matchesRequiredFilters(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  const filters = query.filters ?? {};
  for (const required of capability.requiredFilters) {
    const value = filters[required];
    if (value === undefined || String(value).trim() === '') {
      return false;
    }
  }
  return true;
}

function matchesIdentityRequirement(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  if (capability.identityRequired) {
    return hasIdentity(query);
  }
  return true;
}

function matchesLimitAgainstCapability(
  capability: AnalyticalCapability,
  query: AnalyticalQuery,
): boolean {
  if (capability.maxLimit === null) {
    // limit sem semântica na capability: ignorado pelo matcher (tool pode omitir).
    return true;
  }
  if (query.operation === 'RANKING_WINNER') {
    const limit = query.limit ?? capability.defaultLimit ?? 1;
    return limit === 1 && capability.maxLimit === 1;
  }
  if (query.limit === undefined) {
    return true;
  }
  return Number.isInteger(query.limit) && query.limit >= 1;
}

function validateLimit(
  query: AnalyticalQuery,
): AnalyticalCapabilityValidation | null {
  if (query.limit === undefined) {
    return null;
  }
  if (!Number.isInteger(query.limit) || query.limit < 1) {
    return deny('INVALID_LIMIT', 'limit deve ser inteiro >= 1.');
  }
  if (query.operation === 'RANKING_WINNER' && query.limit !== 1) {
    return deny(
      'WINNER_LIMIT_MUST_BE_ONE',
      'RANKING_WINNER exige limit=1.',
    );
  }
  // maxLimit do registry é teto de clamp do executor/serviço legado — não deny.
  // Ferramentas atuais aceitam requestedLimit abusivo e clamam (parity F13.8.5B).
  return null;
}
