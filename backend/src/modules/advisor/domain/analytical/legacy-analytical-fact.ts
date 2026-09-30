import type { AnalyticalCapability } from './analytical-capability-registry.js';
import type { AnalyticalQuery } from './analytical-query.js';
import type { AnalyticalResult } from './analytical-result.js';
import { legacyPercentToCanonicalRatio } from './coverage-conversion.js';

/**
 * Envelope canônico + fact legado verbatim (parity F13.8.5B).
 * Composer/classifier continuam no legacyFact; 5C convergirá o composer.
 */
export function wrapLegacyAnalyticalResult(input: {
  readonly query: AnalyticalQuery;
  readonly capability: AnalyticalCapability;
  readonly legacyFact: Record<string, unknown>;
}): AnalyticalResult {
  const status = resolveStatus(input.legacyFact);
  const coverage = extractCoverage(input.legacyFact);

  if (status === 'DENIED') {
    return {
      status: 'DENIED',
      reasonCode: 'UNEXPECTED',
      messageSafe: 'Resultado negado inesperado.',
      capabilityKey: input.capability.key,
    };
  }

  if (status === 'AMBIGUOUS') {
    return {
      status: 'AMBIGUOUS',
      metric: input.query.metric,
      semanticFamily: input.query.semanticFamily,
      period: input.query.period,
      ...(input.query.direction !== undefined ? { direction: input.query.direction } : {}),
      ...(input.query.dimension !== undefined ? { dimension: input.query.dimension } : {}),
      operation: input.query.operation,
      reasonCode: String(input.legacyFact.code ?? 'AMBIGUOUS'),
      candidates: [],
      legacyFact: input.legacyFact,
    };
  }

  if (status === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      metric: input.query.metric,
      semanticFamily: input.query.semanticFamily,
      period: input.query.period,
      ...(input.query.direction !== undefined ? { direction: input.query.direction } : {}),
      ...(input.query.dimension !== undefined ? { dimension: input.query.dimension } : {}),
      operation: input.query.operation,
      reasonCode: String(input.legacyFact.code ?? 'UNAVAILABLE'),
      messageSafe: String(input.legacyFact.message ?? 'Indisponível.'),
      legacyFact: input.legacyFact,
    };
  }

  return {
    status,
    metric: input.query.metric,
    semanticFamily: input.query.semanticFamily,
    period: input.query.period,
    ...(input.query.direction !== undefined ? { direction: input.query.direction } : {}),
    ...(input.query.dimension !== undefined ? { dimension: input.query.dimension } : {}),
    operation: input.query.operation,
    payload: {
      operation: 'VALUE',
      value: null,
      meaning: 'LEGACY_ENVELOPE',
    },
    ...(coverage !== undefined ? { coverage } : {}),
    legacyFact: input.legacyFact,
  };
}

/**
 * Adapter legado: devolve o fact publicado atual.
 * Autoridade de parity = legacyFact anexado na execução.
 */
export function toLegacyAnalyticalFact(
  result: AnalyticalResult,
): Record<string, unknown> {
  if ('legacyFact' in result && result.legacyFact !== undefined) {
    return result.legacyFact;
  }
  if (result.status === 'DENIED') {
    return {
      status: 'UNAVAILABLE',
      code: result.reasonCode,
      message: result.messageSafe,
    };
  }
  throw new Error('AnalyticalResult sem legacyFact — parity 5B exige envelope legado.');
}

function resolveStatus(
  legacyFact: Record<string, unknown>,
): 'AVAILABLE' | 'PARTIAL' | 'AMBIGUOUS' | 'UNAVAILABLE' | 'DENIED' {
  const raw = legacyFact.status;
  if (raw === 'AMBIGUOUS') {
    return 'AMBIGUOUS';
  }
  if (raw === 'UNAVAILABLE' || raw === 'ABSENT') {
    return 'UNAVAILABLE';
  }
  if (raw === 'EMPTY_RESULT' || raw === 'OK' || raw === undefined) {
    const coverage = extractCoverage(legacyFact);
    if (coverage?.ratio !== null && coverage?.ratio !== undefined && coverage.ratio < 1) {
      return 'PARTIAL';
    }
    return 'AVAILABLE';
  }
  if (typeof raw === 'string' && raw.includes('PARTIAL')) {
    return 'PARTIAL';
  }
  return 'AVAILABLE';
}

function extractCoverage(legacyFact: Record<string, unknown>) {
  const coverage = legacyFact.coverage;
  if (coverage === null || typeof coverage !== 'object' || Array.isArray(coverage)) {
    if (typeof legacyFact.coveragePercentage === 'string') {
      return {
        identifiedAmount: null,
        ambiguousAmount: null,
        unavailableAmount: null,
        populationAmount: null,
        ratio: legacyPercentToCanonicalRatio(legacyFact.coveragePercentage),
      };
    }
    return undefined;
  }
  const record = coverage as Record<string, unknown>;
  const percent =
    typeof record.amountPercent === 'string'
      ? record.amountPercent
      : typeof record.identifiedPercent === 'string'
        ? record.identifiedPercent
        : typeof legacyFact.coveragePercentage === 'string'
          ? legacyFact.coveragePercentage
          : null;
  return {
    identifiedAmount:
      typeof record.identifiedAmount === 'string' ? record.identifiedAmount : null,
    ambiguousAmount:
      typeof record.ambiguousAmount === 'string' ? record.ambiguousAmount : null,
    unavailableAmount:
      typeof record.unknownAmount === 'string'
        ? record.unknownAmount
        : typeof record.unidentifiedAmount === 'string'
          ? record.unidentifiedAmount
          : null,
    populationAmount:
      typeof record.populationAmount === 'string' ? record.populationAmount : null,
    ratio: legacyPercentToCanonicalRatio(percent),
  };
}
