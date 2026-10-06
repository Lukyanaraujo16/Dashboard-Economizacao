import { ANALYTICAL_OUTCOMES } from '../../advisor/domain/classify-analytical-outcome.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { isAuditAction, type AuditAction } from '../domain/audit-actions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SYNC_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] as const;
const AI_RUN_STATUSES = ['STARTED', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'LIMIT_BLOCKED'] as const;

export type SyncRunListStatus = (typeof SYNC_STATUSES)[number];
export type AiRunListStatus = (typeof AI_RUN_STATUSES)[number];

export type OperationsListQuery = {
  readonly tenantId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: string;
  readonly action?: AuditAction;
};

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new ValidationError('Parâmetros de listagem inválidos.', {
      details: [{ field, issue: 'invalid_integer' }],
    });
  }
  return parsed;
}

export function parseOperationsListQuery(
  query: unknown,
  options: {
    readonly statusValues?: readonly string[];
    readonly allowAction?: boolean;
  } = {},
): OperationsListQuery {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new ValidationError('Query string inválida.', {
      details: [{ field: 'query', issue: 'must_be_object' }],
    });
  }

  const allowed = new Set(['tenantId', 'limit', 'offset']);
  if (options.statusValues) {
    allowed.add('status');
  }
  if (options.allowAction) {
    allowed.add('action');
  }

  const record = query as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ValidationError('Query string contém parâmetros não permitidos.', {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
    });
  }

  let tenantId: string | undefined;
  if (record.tenantId !== undefined) {
    if (typeof record.tenantId !== 'string' || !UUID_PATTERN.test(record.tenantId)) {
      throw new ValidationError('Identificador de empresa inválido.', {
        details: [{ field: 'tenantId', issue: 'invalid_uuid' }],
      });
    }
    tenantId = record.tenantId;
  }

  let limit: number | undefined;
  if (record.limit !== undefined) {
    if (typeof record.limit !== 'string') {
      throw new ValidationError('Parâmetros de listagem inválidos.', {
        details: [{ field: 'limit', issue: 'required_string' }],
      });
    }
    limit = parsePositiveInt(record.limit, 'limit');
  }

  let offset: number | undefined;
  if (record.offset !== undefined) {
    if (typeof record.offset !== 'string') {
      throw new ValidationError('Parâmetros de listagem inválidos.', {
        details: [{ field: 'offset', issue: 'required_string' }],
      });
    }
    offset = parsePositiveInt(record.offset, 'offset');
  }

  let status: string | undefined;
  if (record.status !== undefined) {
    if (!options.statusValues) {
      throw new ValidationError('Query string contém parâmetros não permitidos.', {
        details: [{ field: 'status', issue: 'unknown_field' }],
      });
    }
    if (typeof record.status !== 'string' || !options.statusValues.includes(record.status)) {
      throw new ValidationError('Filtro de status inválido.', {
        details: [{ field: 'status', issue: 'invalid_enum' }],
      });
    }
    status = record.status;
  }

  let action: AuditAction | undefined;
  if (record.action !== undefined) {
    if (!options.allowAction) {
      throw new ValidationError('Query string contém parâmetros não permitidos.', {
        details: [{ field: 'action', issue: 'unknown_field' }],
      });
    }
    if (typeof record.action !== 'string' || !isAuditAction(record.action)) {
      throw new ValidationError('Filtro de ação inválido.', {
        details: [{ field: 'action', issue: 'invalid_enum' }],
      });
    }
    action = record.action;
  }

  return {
    ...(tenantId !== undefined ? { tenantId } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(action !== undefined ? { action } : {}),
  };
}

export function parseSyncRunListQuery(query: unknown): OperationsListQuery {
  return parseOperationsListQuery(query, { statusValues: SYNC_STATUSES });
}

export function parseAiRunListQuery(query: unknown): OperationsListQuery {
  return parseOperationsListQuery(query, { statusValues: AI_RUN_STATUSES });
}

export function parseAnalyticalResultListQuery(query: unknown): OperationsListQuery {
  return parseOperationsListQuery(query, { statusValues: ANALYTICAL_OUTCOMES });
}

export function parseAuditLogListQuery(query: unknown): OperationsListQuery {
  return parseOperationsListQuery(query, { allowAction: true });
}

export function parseOperationsPageQuery(query: unknown): OperationsListQuery {
  return parseOperationsListQuery(query);
}
