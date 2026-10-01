import type { AnalyticalFilters } from './analytical-filters.js';
import type { AnalyticalIdentityRef } from './analytical-identity.js';
import {
  ANALYTICAL_CIVIL_TIME_ZONE,
  isAnalyticalDimensionKey,
  isAnalyticalDirection,
  isAnalyticalMetricKey,
  isAnalyticalOperationKey,
  isAnalyticalPartyProfile,
  isAnalyticalSemanticFamily,
  type AnalyticalDimensionKey,
  type AnalyticalDirection,
} from './analytical-keys.js';
import {
  isAnalyticalCivilDate,
  isAnalyticalMonthKey,
  type AnalyticalPeriod,
} from './analytical-period.js';
import type { AnalyticalQuery } from './analytical-query.js';

/**
 * Campos proibidos em fronteira futura (LLM/provider/tool args).
 * Mirror do espírito FORBIDDEN_ARG_KEYS das analytical tools.
 */
export const ANALYTICAL_QUERY_FORBIDDEN_KEYS = [
  'tenantId',
  'tenantid',
  'userId',
  'userid',
  'sql',
  'rawSql',
  'rawsql',
  'table',
  'tables',
  'field',
  'fields',
  'datasource',
  'dataSource',
  'prisma',
  'url',
  'urls',
  'contaAzul',
  'conta_azul',
  'from',
  'to',
  'where',
  'repository',
  'integrationId',
  'companyId',
  'partyId',
  'dateRange',
] as const;

export type ParseAnalyticalQueryResult =
  | { readonly ok: true; readonly query: AnalyticalQuery }
  | { readonly ok: false; readonly reason: string; readonly message: string };

type ParseFail = {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
};

type ParseOk<T> = { readonly ok: true; readonly value: T };

type ParseStep<T> = ParseOk<T> | ParseFail;

/**
 * Runtime allowlist estrita para objetos de fronteira.
 * Sem Zod. Tipos TS + validação manual.
 */
export function parseAnalyticalQueryBoundary(
  input: unknown,
): ParseAnalyticalQueryResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail('NOT_OBJECT', 'AnalyticalQuery deve ser um objeto.');
  }
  const record = input as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (isForbiddenKey(key)) {
      return fail('FORBIDDEN_FIELD', `Campo proibido em AnalyticalQuery: ${key}`);
    }
  }

  const allowedTop = new Set([
    'semanticFamily',
    'metric',
    'direction',
    'period',
    'dimension',
    'operation',
    'filters',
    'identity',
    'limit',
  ]);
  for (const key of Object.keys(record)) {
    if (!allowedTop.has(key)) {
      return fail('UNKNOWN_FIELD', `Campo não allowlisted: ${key}`);
    }
  }

  const semanticFamily = requireEnumString(
    record.semanticFamily,
    isAnalyticalSemanticFamily,
    'semanticFamily',
  );
  if (!semanticFamily.ok) {
    return semanticFamily;
  }
  const metric = requireEnumString(record.metric, isAnalyticalMetricKey, 'metric');
  if (!metric.ok) {
    return metric;
  }
  const operation = requireEnumString(
    record.operation,
    isAnalyticalOperationKey,
    'operation',
  );
  if (!operation.ok) {
    return operation;
  }

  let direction: AnalyticalDirection | undefined;
  if (record.direction !== undefined) {
    const parsed = requireEnumString(record.direction, isAnalyticalDirection, 'direction');
    if (!parsed.ok) {
      return parsed;
    }
    direction = parsed.value;
  }

  let dimension: AnalyticalDimensionKey | undefined;
  if (record.dimension !== undefined) {
    const parsed = requireEnumString(
      record.dimension,
      isAnalyticalDimensionKey,
      'dimension',
    );
    if (!parsed.ok) {
      return parsed;
    }
    dimension = parsed.value;
  }

  const period = parsePeriod(record.period);
  if (!period.ok) {
    return period;
  }
  const periodValue = period.value;

  const filtersStep = parseFilters(record.filters);
  if (!filtersStep.ok) {
    return filtersStep;
  }
  const filtersValue = filtersStep.value;

  const identityStep = parseIdentity(record.identity);
  if (!identityStep.ok) {
    return identityStep;
  }
  const identityValue = identityStep.value;

  let limit: number | undefined;
  if (record.limit !== undefined) {
    if (typeof record.limit !== 'number' || !Number.isInteger(record.limit)) {
      return fail('INVALID_LIMIT', 'limit deve ser inteiro.');
    }
    limit = record.limit;
  }

  const query: AnalyticalQuery = {
    semanticFamily: semanticFamily.value,
    metric: metric.value,
    ...(direction !== undefined ? { direction } : {}),
    period: periodValue,
    ...(dimension !== undefined ? { dimension } : {}),
    operation: operation.value,
    ...(filtersValue !== undefined ? { filters: filtersValue } : {}),
    ...(identityValue !== undefined ? { identity: identityValue } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };

  return { ok: true, query };
}

function fail(reason: string, message: string): ParseFail {
  return { ok: false, reason, message };
}

function isForbiddenKey(key: string): boolean {
  const normalized = key.trim();
  return (ANALYTICAL_QUERY_FORBIDDEN_KEYS as readonly string[]).some(
    (forbidden) => forbidden.toLowerCase() === normalized.toLowerCase(),
  );
}

function requireEnumString<T extends string>(
  value: unknown,
  guard: (value: string) => value is T,
  field: string,
): ParseStep<T> {
  if (typeof value !== 'string' || !guard(value)) {
    return fail('INVALID_ENUM', `${field} inválido.`);
  }
  return { ok: true, value };
}

function parsePeriod(value: unknown): ParseStep<AnalyticalPeriod> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('INVALID_PERIOD', 'period deve ser objeto.');
  }
  const period = value as Record<string, unknown>;
  for (const key of Object.keys(period)) {
    if (isForbiddenKey(key)) {
      return fail('FORBIDDEN_FIELD', `Campo proibido em period: ${key}`);
    }
  }
  const kind = period.kind;
  if (kind === 'MONTH') {
    if (typeof period.monthKey !== 'string' || !isAnalyticalMonthKey(period.monthKey)) {
      return fail('INVALID_PERIOD', 'MONTH exige monthKey YYYY-MM.');
    }
    return { ok: true, value: { kind: 'MONTH', monthKey: period.monthKey } };
  }
  if (kind === 'YTD') {
    if (typeof period.year !== 'number' || !Number.isInteger(period.year)) {
      return fail('INVALID_PERIOD', 'YTD exige year inteiro.');
    }
    if (typeof period.rangeKey !== 'string' || period.rangeKey.trim() === '') {
      return fail('INVALID_PERIOD', 'YTD exige rangeKey.');
    }
    return {
      ok: true,
      value: { kind: 'YTD', year: period.year, rangeKey: period.rangeKey },
    };
  }
  if (kind === 'YEAR') {
    if (typeof period.year !== 'number' || !Number.isInteger(period.year)) {
      return fail('INVALID_PERIOD', 'YEAR exige year inteiro.');
    }
    if (typeof period.rangeKey !== 'string' || period.rangeKey.trim() === '') {
      return fail('INVALID_PERIOD', 'YEAR exige rangeKey.');
    }
    return {
      ok: true,
      value: {
        kind: 'YEAR',
        year: period.year,
        rangeKey: period.rangeKey,
        isPartialYear: false,
      },
    };
  }
  if (kind === 'CURRENT') {
    if (!(period.asOf instanceof Date) && typeof period.asOf !== 'string') {
      return fail('INVALID_PERIOD', 'CURRENT exige asOf.');
    }
    const asOf =
      period.asOf instanceof Date ? period.asOf : new Date(String(period.asOf));
    if (Number.isNaN(asOf.getTime())) {
      return fail('INVALID_PERIOD', 'CURRENT asOf inválido.');
    }
    if (
      period.timeZone !== undefined &&
      period.timeZone !== ANALYTICAL_CIVIL_TIME_ZONE
    ) {
      return fail('INVALID_PERIOD', 'timeZone deve ser America/Sao_Paulo.');
    }
    return {
      ok: true,
      value: {
        kind: 'CURRENT',
        asOf,
        timeZone: ANALYTICAL_CIVIL_TIME_ZONE,
      },
    };
  }
  if (kind === 'DAY') {
    if (typeof period.date !== 'string' || !isAnalyticalCivilDate(period.date)) {
      return fail('INVALID_PERIOD', 'DAY exige date YYYY-MM-DD.');
    }
    return { ok: true, value: { kind: 'DAY', date: period.date } };
  }
  if (kind === 'COMPARISON') {
    const left = parsePeriod(period.left);
    if (!left.ok) {
      return left;
    }
    const right = parsePeriod(period.right);
    if (!right.ok) {
      return right;
    }
    if (left.value.kind === 'COMPARISON' || right.value.kind === 'COMPARISON') {
      return fail('INVALID_PERIOD', 'COMPARISON aninhado não é permitido.');
    }
    return {
      ok: true,
      value: { kind: 'COMPARISON', left: left.value, right: right.value },
    };
  }
  return fail('INVALID_PERIOD', 'period.kind desconhecido.');
}

function parseFilters(value: unknown): ParseStep<AnalyticalFilters | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('INVALID_FILTER', 'filters deve ser objeto.');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (isForbiddenKey(key)) {
      return fail('FORBIDDEN_FIELD', `Campo proibido em filters: ${key}`);
    }
    if (key !== 'partyProfile' && key !== 'categoryReference' && key !== 'costCenterQuery') {
      return fail('INVALID_FILTER', `Filter key não allowlisted: ${key}`);
    }
  }
  let partyProfile: AnalyticalFilters['partyProfile'];
  let categoryReference: string | undefined;
  let costCenterQuery: string | undefined;

  if (record.partyProfile !== undefined) {
    if (
      typeof record.partyProfile !== 'string' ||
      !isAnalyticalPartyProfile(record.partyProfile)
    ) {
      return fail('INVALID_FILTER', 'partyProfile inválido.');
    }
    partyProfile = record.partyProfile;
  }
  if (record.categoryReference !== undefined) {
    if (
      typeof record.categoryReference !== 'string' ||
      record.categoryReference.trim() === ''
    ) {
      return fail('INVALID_FILTER', 'categoryReference inválido.');
    }
    categoryReference = record.categoryReference.trim();
  }
  if (record.costCenterQuery !== undefined) {
    if (
      typeof record.costCenterQuery !== 'string' ||
      record.costCenterQuery.trim() === ''
    ) {
      return fail('INVALID_FILTER', 'costCenterQuery inválido.');
    }
    costCenterQuery = record.costCenterQuery.trim();
  }

  return {
    ok: true,
    value: {
      ...(partyProfile !== undefined ? { partyProfile } : {}),
      ...(categoryReference !== undefined ? { categoryReference } : {}),
      ...(costCenterQuery !== undefined ? { costCenterQuery } : {}),
    },
  };
}

function parseIdentity(value: unknown): ParseStep<AnalyticalIdentityRef | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('INVALID_IDENTITY', 'identity deve ser objeto.');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (isForbiddenKey(key)) {
      return fail('FORBIDDEN_FIELD', `Campo proibido em identity: ${key}`);
    }
  }
  if (record.kind !== 'QUERY') {
    return fail('INVALID_IDENTITY', 'identity.kind deve ser QUERY.');
  }
  if (typeof record.query !== 'string' || record.query.trim() === '') {
    return fail('INVALID_IDENTITY', 'identity.query deve ser string não vazia.');
  }
  return {
    ok: true,
    value: { kind: 'QUERY', query: record.query.trim() },
  };
}