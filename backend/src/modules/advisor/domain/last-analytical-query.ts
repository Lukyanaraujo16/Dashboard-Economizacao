/**
 * C.2.3 — LastAnalyticalQuery: representação tipada da última investigação
 * analítica executada e respondida com evidência compatível.
 *
 * Sem tenantId/userId/costCenterId/SQL/valores financeiros/prosa.
 * Reusa AnalyticalQuery (filters textuais allowlisted).
 */
import { listAnalyticalCapabilities } from './analytical/analytical-capability-registry.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import { parseAnalyticalQueryBoundary } from './analytical/parse-analytical-query.js';
import { validateAnalyticalCapability } from './analytical/validate-analytical-capability.js';

export const LAST_ANALYTICAL_QUERY_KIND = 'LAST_ANALYTICAL_QUERY' as const;
export const LAST_ANALYTICAL_QUERY_VERSION = 1 as const;

export const LAST_ANALYTICAL_EXECUTION_STATUSES = ['OK', 'EMPTY'] as const;
export type LastAnalyticalExecutionStatus =
  (typeof LAST_ANALYTICAL_EXECUTION_STATUSES)[number];

/**
 * Capabilities cobertas na persistência (C.2.3 + C.2.7 F).
 * A–D billing; E = C.1 movements; F = INFLOW lookup/value oficiais.
 */
export const LAST_ANALYTICAL_QUERY_COVERED_KEYS = [
  'billing.value.month',
  'billing.series.months',
  'billing.cost_center.month',
  'billing.cost_center.series.months',
  'realized_cash.cost_center.month.movements',
  'realized_cash.cost_center.window.movements',
  'realized_cash.cost_center.month.lookup',
  'realized_cash.value.month',
] as const;

export type LastAnalyticalQueryCoveredKey =
  (typeof LAST_ANALYTICAL_QUERY_COVERED_KEYS)[number];

export type LastAnalyticalQuery = {
  readonly version: typeof LAST_ANALYTICAL_QUERY_VERSION;
  readonly kind: typeof LAST_ANALYTICAL_QUERY_KIND;
  readonly query: AnalyticalQuery;
  readonly capabilityKey: LastAnalyticalQueryCoveredKey;
  readonly executionStatus: LastAnalyticalExecutionStatus;
};

const FORBIDDEN_ROOT_KEYS = [
  'tenantId',
  'tenantid',
  'userId',
  'userid',
  'conversationId',
  'costCenterId',
  'costcenterid',
  'integrationId',
  'partyId',
  'sql',
  'rawSql',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isLastAnalyticalQueryCoveredKey(
  value: string,
): value is LastAnalyticalQueryCoveredKey {
  return (LAST_ANALYTICAL_QUERY_COVERED_KEYS as readonly string[]).includes(value);
}

export function isPersistableAnalyticalExecutionStatus(
  status: string | null | undefined,
): status is LastAnalyticalExecutionStatus {
  if (status === 'OK' || status === 'EMPTY') {
    return true;
  }
  // Compatível com EMPTY_RESULT das tools.
  return status === 'EMPTY_RESULT';
}

export function normalizePersistableExecutionStatus(
  status: string,
): LastAnalyticalExecutionStatus {
  return status === 'OK' ? 'OK' : 'EMPTY';
}

/**
 * Parser estrito. Rejeita versão desconhecida, extras, IDs, capability fora
 * da cobertura/registry, e query incompatível com a capability.
 */
export function parseLastAnalyticalQuery(value: unknown): LastAnalyticalQuery | null {
  if (!isRecord(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (
      (FORBIDDEN_ROOT_KEYS as readonly string[]).some(
        (forbidden) => forbidden.toLowerCase() === key.toLowerCase(),
      )
    ) {
      return null;
    }
  }
  const allowed = new Set([
    'version',
    'kind',
    'query',
    'capabilityKey',
    'executionStatus',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return null;
    }
  }
  if (
    value.version !== LAST_ANALYTICAL_QUERY_VERSION ||
    value.kind !== LAST_ANALYTICAL_QUERY_KIND
  ) {
    return null;
  }
  if (
    typeof value.capabilityKey !== 'string' ||
    !isLastAnalyticalQueryCoveredKey(value.capabilityKey)
  ) {
    return null;
  }
  if (
    typeof value.executionStatus !== 'string' ||
    !(LAST_ANALYTICAL_EXECUTION_STATUSES as readonly string[]).includes(
      value.executionStatus,
    )
  ) {
    return null;
  }
  const published = listAnalyticalCapabilities().some(
    (row) => row.key === value.capabilityKey,
  );
  if (!published) {
    return null;
  }
  const parsed = parseAnalyticalQueryBoundary(value.query);
  if (!parsed.ok) {
    return null;
  }
  const validation = validateAnalyticalCapability(parsed.query);
  if (!validation.ok || validation.capability.key !== value.capabilityKey) {
    return null;
  }
  return {
    version: LAST_ANALYTICAL_QUERY_VERSION,
    kind: LAST_ANALYTICAL_QUERY_KIND,
    query: parsed.query,
    capabilityKey: value.capabilityKey,
    executionStatus: value.executionStatus as LastAnalyticalExecutionStatus,
  };
}

export function buildLastAnalyticalQuery(input: {
  readonly query: AnalyticalQuery;
  readonly capabilityKey: string;
  readonly executionStatus: string;
}): LastAnalyticalQuery | null {
  if (!isLastAnalyticalQueryCoveredKey(input.capabilityKey)) {
    return null;
  }
  if (!isPersistableAnalyticalExecutionStatus(input.executionStatus)) {
    return null;
  }
  const validation = validateAnalyticalCapability(input.query);
  if (!validation.ok || validation.capability.key !== input.capabilityKey) {
    return null;
  }
  return {
    version: LAST_ANALYTICAL_QUERY_VERSION,
    kind: LAST_ANALYTICAL_QUERY_KIND,
    query: input.query,
    capabilityKey: input.capabilityKey,
    executionStatus: normalizePersistableExecutionStatus(input.executionStatus),
  };
}
