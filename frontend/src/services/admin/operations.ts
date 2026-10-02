import {
  adminOperationsAiRunsPath,
  adminOperationsAuditLogsPath,
  adminOperationsFailuresPath,
  adminOperationsHealthPath,
  adminOperationsOverviewPath,
  adminOperationsSyncRunsPath,
} from '../../lib/api-config';

export type OperationsPagination = {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export type OperationsList<T> = {
  readonly data: readonly T[];
  readonly pagination: OperationsPagination;
};

export type OperationsQuery = {
  readonly tenantId?: string;
  readonly limit: number;
  readonly offset: number;
  readonly status?: string;
  readonly action?: string;
};

export type SyncRunRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly integrationId: string;
  readonly status: string;
  readonly triggerType: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly heartbeatAt: string | null;
  readonly errorCode: string | null;
  readonly counts: Record<string, number> | null;
};

export type IntegrationHealthRow = {
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly tenantStatus: string;
  readonly integration: {
    readonly id: string;
    readonly status: string;
    readonly lastSuccessfulSyncAt: string | null;
    readonly lastErrorAt: string | null;
    readonly lastErrorCode: string | null;
    readonly currentRun: {
      readonly id: string;
      readonly status: string;
      readonly triggerType: string;
      readonly startedAt: string;
      readonly heartbeatAt: string | null;
    } | null;
  } | null;
};

export type AiRunRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly runType: string;
  readonly provider: string;
  readonly model: string;
  readonly status: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly durationMs: number | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
};

export type AuditLogRow = {
  readonly id: string;
  readonly operatorUserId: string;
  readonly operatorName: string;
  readonly tenantId: string | null;
  readonly tenantDisplayName: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly result: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
};

export class OperationsRequestError extends Error {
  readonly kind: 'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'unknown';

  constructor(kind: OperationsRequestError['kind'], message: string) {
    super(message);
    this.name = 'OperationsRequestError';
    this.kind = kind;
  }
}

const SENSITIVE_KEY =
  /(password|passwd|secret|token|credential|authorization|prompt|hash|api[-_]?key|oauth|bearer)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || key === 'content' || key === 'body' || key === 'payload';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
      counts[key] = raw;
    }
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

function readMetadata(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const metadata: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' || raw === null) {
      metadata[key] = raw;
    } else if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
      metadata[key] = raw;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function readPagination(value: unknown): OperationsPagination | null {
  if (!isRecord(value)) {
    return null;
  }
  const limit = value.limit;
  const offset = value.offset;
  const total = value.total;
  const hasMore = value.hasMore;
  if (
    typeof limit !== 'number' ||
    typeof offset !== 'number' ||
    typeof total !== 'number' ||
    typeof hasMore !== 'boolean'
  ) {
    return null;
  }
  return { limit, offset, total, hasMore };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toFailure(response: Response, body: unknown): OperationsRequestError {
  const message =
    isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : 'Não foi possível carregar a operação.';
  if (response.status === 401) {
    return new OperationsRequestError('unauthenticated', 'Sua sessão expirou. Faça login novamente.');
  }
  if (response.status === 403) {
    return new OperationsRequestError('forbidden', 'Você não tem permissão para esta área.');
  }
  if (response.status === 404) {
    return new OperationsRequestError('not_found', message);
  }
  if (response.status === 400) {
    return new OperationsRequestError('validation', message);
  }
  return new OperationsRequestError('unknown', message);
}

function queryString(query: OperationsQuery): string {
  const params = new URLSearchParams();
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));
  if (query.tenantId) {
    params.set('tenantId', query.tenantId);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.action) {
    params.set('action', query.action);
  }
  return params.toString();
}

async function getList(path: string, query: OperationsQuery): Promise<unknown> {
  const response = await fetch(`${path}?${queryString(query)}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  return body;
}

function parseList<T>(
  body: unknown,
  mapItem: (value: unknown) => T | null,
): OperationsList<T> {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
  }
  const pagination = readPagination(body.pagination);
  if (!pagination) {
    throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
  }
  const data: T[] = [];
  for (const item of body.data) {
    const mapped = mapItem(item);
    if (!mapped) {
      throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
    }
    data.push(mapped);
  }
  return { data, pagination };
}

function mapSyncRun(value: unknown): SyncRunRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const tenantId = readString(value.tenantId);
  const tenantDisplayName = readString(value.tenantDisplayName);
  const integrationId = readString(value.integrationId);
  const status = readString(value.status);
  const triggerType = readString(value.triggerType);
  const startedAt = readString(value.startedAt);
  if (!id || !tenantId || !tenantDisplayName || !integrationId || !status || !triggerType || !startedAt) {
    return null;
  }
  return {
    id,
    tenantId,
    tenantDisplayName,
    integrationId,
    status,
    triggerType,
    startedAt,
    finishedAt: readNullableString(value.finishedAt),
    durationMs: readNullableNumber(value.durationMs),
    heartbeatAt: readNullableString(value.heartbeatAt),
    errorCode: readNullableString(value.errorCode),
    counts: readCounts(value.counts),
  };
}

type CurrentRun = NonNullable<NonNullable<IntegrationHealthRow['integration']>['currentRun']>;

function mapCurrentRun(value: unknown): CurrentRun | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const status = readString(value.status);
  const triggerType = readString(value.triggerType);
  const startedAt = readString(value.startedAt);
  if (!id || !status || !triggerType || !startedAt) {
    return null;
  }
  return {
    id,
    status,
    triggerType,
    startedAt,
    heartbeatAt: readNullableString(value.heartbeatAt),
  };
}

function mapHealth(value: unknown): IntegrationHealthRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const tenantId = readString(value.tenantId);
  const tenantDisplayName = readString(value.tenantDisplayName);
  const tenantStatus = readString(value.tenantStatus);
  if (!tenantId || !tenantDisplayName || !tenantStatus) {
    return null;
  }
  if (value.integration === null) {
    return { tenantId, tenantDisplayName, tenantStatus, integration: null };
  }
  if (!isRecord(value.integration)) {
    return null;
  }
  const id = readString(value.integration.id);
  const status = readString(value.integration.status);
  if (!id || !status) {
    return null;
  }
  const currentRun = mapCurrentRun(value.integration.currentRun);
  if (value.integration.currentRun != null && currentRun === null) {
    return null;
  }
  return {
    tenantId,
    tenantDisplayName,
    tenantStatus,
    integration: {
      id,
      status,
      lastSuccessfulSyncAt: readNullableString(value.integration.lastSuccessfulSyncAt),
      lastErrorAt: readNullableString(value.integration.lastErrorAt),
      lastErrorCode: readNullableString(value.integration.lastErrorCode),
      currentRun,
    },
  };
}

function mapAiRun(value: unknown): AiRunRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const tenantId = readString(value.tenantId);
  const tenantDisplayName = readString(value.tenantDisplayName);
  const runType = readString(value.runType);
  const provider = readString(value.provider);
  const model = readString(value.model);
  const status = readString(value.status);
  const createdAt = readString(value.createdAt);
  if (!id || !tenantId || !tenantDisplayName || !runType || !provider || !model || !status || !createdAt) {
    return null;
  }
  return {
    id,
    tenantId,
    tenantDisplayName,
    userId: readNullableString(value.userId),
    userName: readNullableString(value.userName),
    runType,
    provider,
    model,
    status,
    inputTokens: readNullableNumber(value.inputTokens),
    outputTokens: readNullableNumber(value.outputTokens),
    durationMs: readNullableNumber(value.durationMs),
    errorCode: readNullableString(value.errorCode),
    createdAt,
    finishedAt: readNullableString(value.finishedAt),
  };
}

function mapAuditLog(value: unknown): AuditLogRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const operatorUserId = readString(value.operatorUserId);
  const operatorName = readString(value.operatorName);
  const action = readString(value.action);
  const targetType = readString(value.targetType);
  const result = readString(value.result);
  const createdAt = readString(value.createdAt);
  if (!id || !operatorUserId || !operatorName || !action || !targetType || !result || !createdAt) {
    return null;
  }
  return {
    id,
    operatorUserId,
    operatorName,
    tenantId: readNullableString(value.tenantId),
    tenantDisplayName: readNullableString(value.tenantDisplayName),
    action,
    targetType,
    targetId: readNullableString(value.targetId),
    result,
    metadata: readMetadata(value.metadata),
    createdAt,
  };
}

export async function listOperationSyncRuns(query: OperationsQuery): Promise<OperationsList<SyncRunRow>> {
  return parseList(await getList(adminOperationsSyncRunsPath(), query), mapSyncRun);
}

export async function listOperationFailures(query: OperationsQuery): Promise<OperationsList<SyncRunRow>> {
  return parseList(await getList(adminOperationsFailuresPath(), query), mapSyncRun);
}

export async function listOperationHealth(
  query: OperationsQuery,
): Promise<OperationsList<IntegrationHealthRow>> {
  return parseList(await getList(adminOperationsHealthPath(), query), mapHealth);
}

export async function listOperationAiRuns(query: OperationsQuery): Promise<OperationsList<AiRunRow>> {
  return parseList(await getList(adminOperationsAiRunsPath(), query), mapAiRun);
}

export async function listOperationAuditLogs(query: OperationsQuery): Promise<OperationsList<AuditLogRow>> {
  return parseList(await getList(adminOperationsAuditLogsPath(), query), mapAuditLog);
}

export type OperationsMoney = string | null;

export type OperationsCompanyFinancials = {
  readonly billing: OperationsMoney;
  readonly result: OperationsMoney;
  readonly receivables: OperationsMoney;
  readonly payables: OperationsMoney;
  readonly overdueReceivables: OperationsMoney;
  readonly overduePayables: OperationsMoney;
};

export type OperationsCompanyRow = {
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly tenantStatus: string;
  readonly integrationState: string;
  readonly referenceMonthKey: string;
  readonly integration: IntegrationHealthRow['integration'];
  readonly financials: OperationsCompanyFinancials;
};

export type OperationsOverview = {
  readonly referenceMonthKey: string;
  readonly windows: {
    readonly syncFreshnessHours: number;
    readonly recentDays: number;
  };
  readonly kpis: {
    readonly companies: { readonly total: number };
    readonly integrations: {
      readonly connected: number;
      readonly total: number;
      readonly withError: number;
    };
    readonly synchronization: {
      readonly syncedCompaniesLast24Hours: number;
      readonly failuresLast7Days: number;
    };
    readonly ai: {
      readonly runsLast7Days: number;
      readonly errorsLast7Days: number;
    };
    readonly audit: { readonly changesLast7Days: number };
  };
  readonly companies: OperationsList<OperationsCompanyRow>;
  readonly alerts: {
    readonly failures: readonly SyncRunRow[];
    readonly aiErrors: readonly AiRunRow[];
    readonly audit: readonly AuditLogRow[];
  };
};

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readMoney(value: unknown): OperationsMoney | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }
  return undefined;
}

function mapFinancials(value: unknown): OperationsCompanyFinancials | null {
  if (!isRecord(value)) {
    return null;
  }
  const billing = readMoney(value.billing);
  const result = readMoney(value.result);
  const receivables = readMoney(value.receivables);
  const payables = readMoney(value.payables);
  const overdueReceivables = readMoney(value.overdueReceivables);
  const overduePayables = readMoney(value.overduePayables);
  if (
    billing === undefined ||
    result === undefined ||
    receivables === undefined ||
    payables === undefined ||
    overdueReceivables === undefined ||
    overduePayables === undefined
  ) {
    return null;
  }
  return { billing, result, receivables, payables, overdueReceivables, overduePayables };
}

function mapCompany(value: unknown): OperationsCompanyRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const tenantId = readString(value.tenantId);
  const tenantDisplayName = readString(value.tenantDisplayName);
  const tenantStatus = readString(value.tenantStatus);
  const integrationState = readString(value.integrationState);
  const referenceMonthKey = readString(value.referenceMonthKey);
  const financials = mapFinancials(value.financials);
  if (!tenantId || !tenantDisplayName || !tenantStatus || !integrationState || !referenceMonthKey || !financials) {
    return null;
  }
  if (value.integration === null) {
    return {
      tenantId,
      tenantDisplayName,
      tenantStatus,
      integrationState,
      referenceMonthKey,
      integration: null,
      financials,
    };
  }
  const health = mapHealth({
    tenantId,
    tenantDisplayName,
    tenantStatus,
    integration: value.integration,
  });
  if (!health?.integration) {
    return null;
  }
  return {
    tenantId,
    tenantDisplayName,
    tenantStatus,
    integrationState,
    referenceMonthKey,
    integration: health.integration,
    financials,
  };
}

export async function getOperationOverview(query: OperationsQuery): Promise<OperationsOverview> {
  const body = await getList(adminOperationsOverviewPath(), query);
  if (!isRecord(body) || !isRecord(body.kpis) || !isRecord(body.windows) || !isRecord(body.alerts)) {
    throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
  }
  const referenceMonthKey = readString(body.referenceMonthKey);
  const syncFreshnessHours = readCount(body.windows.syncFreshnessHours);
  const recentDays = readCount(body.windows.recentDays);
  const companies = parseList(body.companies, mapCompany);
  if (!referenceMonthKey || syncFreshnessHours === null || recentDays === null) {
    throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
  }
  const companiesKpi = isRecord(body.kpis.companies) ? readCount(body.kpis.companies.total) : null;
  const integrations = isRecord(body.kpis.integrations) ? body.kpis.integrations : null;
  const synchronization = isRecord(body.kpis.synchronization) ? body.kpis.synchronization : null;
  const ai = isRecord(body.kpis.ai) ? body.kpis.ai : null;
  const audit = isRecord(body.kpis.audit) ? body.kpis.audit : null;
  const connected = integrations ? readCount(integrations.connected) : null;
  const integrationTotal = integrations ? readCount(integrations.total) : null;
  const withError = integrations ? readCount(integrations.withError) : null;
  const synced = synchronization ? readCount(synchronization.syncedCompaniesLast24Hours) : null;
  const failures = synchronization ? readCount(synchronization.failuresLast7Days) : null;
  const runs = ai ? readCount(ai.runsLast7Days) : null;
  const errors = ai ? readCount(ai.errorsLast7Days) : null;
  const changes = audit ? readCount(audit.changesLast7Days) : null;
  if (
    companiesKpi === null ||
    connected === null ||
    integrationTotal === null ||
    withError === null ||
    synced === null ||
    failures === null ||
    runs === null ||
    errors === null ||
    changes === null
  ) {
    throw new OperationsRequestError('unknown', 'Resposta administrativa inválida.');
  }
  const failureList = parseList({ data: body.alerts.failures, pagination: companies.pagination }, mapSyncRun);
  const aiList = parseList({ data: body.alerts.aiErrors, pagination: companies.pagination }, mapAiRun);
  const auditList = parseList({ data: body.alerts.audit, pagination: companies.pagination }, mapAuditLog);
  return {
    referenceMonthKey,
    windows: { syncFreshnessHours, recentDays },
    kpis: {
      companies: { total: companiesKpi },
      integrations: { connected, total: integrationTotal, withError },
      synchronization: { syncedCompaniesLast24Hours: synced, failuresLast7Days: failures },
      ai: { runsLast7Days: runs, errorsLast7Days: errors },
      audit: { changesLast7Days: changes },
    },
    companies,
    alerts: {
      failures: failureList.data,
      aiErrors: aiList.data,
      audit: auditList.data,
    },
  };
}
