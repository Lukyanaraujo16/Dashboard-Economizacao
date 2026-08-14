import { ValidationError } from '../../../shared/errors/application-error.js';
import { TENANT_STATUSES, type TenantStatus } from '../domain/types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREATE_BODY_KEYS = new Set(['name', 'displayName']);
const UPDATE_BODY_KEYS = new Set(['name', 'displayName']);
const LIST_QUERY_KEYS = new Set(['status', 'limit', 'offset']);

function assertObjectBody(body: unknown, label: string): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError(`${label} inválido.`, {
      details: [{ field: 'body', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }

  return body as Record<string, unknown>;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(`${label} contém campos não permitidos.`, {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
    });
  }
}

function parseRequiredString(
  value: unknown,
  field: string,
  details: Array<{ field: string; issue: string }>,
): void {
  if (typeof value !== 'string') {
    details.push({ field, issue: 'required_string' });
  } else if (value.trim().length === 0) {
    details.push({ field, issue: 'required' });
  }
}

export function parseTenantIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'tenantId', issue: 'required' }],
    });
  }

  const tenantId = (params as Record<string, unknown>).tenantId;
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    throw new ValidationError('Identificador de empresa inválido.', {
      details: [{ field: 'tenantId', issue: 'invalid_uuid' }],
    });
  }

  return tenantId;
}

export type CreateTenantRequestBody = {
  readonly name: string;
  readonly displayName: string;
};

export function parseCreateTenantRequestBody(body: unknown): CreateTenantRequestBody {
  const record = assertObjectBody(body, 'Payload de criação');
  rejectUnknownKeys(record, CREATE_BODY_KEYS, 'Payload de criação');

  const details: Array<{ field: string; issue: string }> = [];
  parseRequiredString(record.name, 'name', details);
  parseRequiredString(record.displayName, 'displayName', details);

  if (details.length > 0) {
    throw new ValidationError('Dados de criação inválidos.', { details });
  }

  return {
    name: (record.name as string).trim(),
    displayName: (record.displayName as string).trim(),
  };
}

export type UpdateTenantRequestBody = {
  readonly name?: string;
  readonly displayName?: string;
};

export function parseUpdateTenantRequestBody(body: unknown): UpdateTenantRequestBody {
  const record = assertObjectBody(body, 'Payload de atualização');
  rejectUnknownKeys(record, UPDATE_BODY_KEYS, 'Payload de atualização');

  const details: Array<{ field: string; issue: string }> = [];

  if (record.name !== undefined) {
    parseRequiredString(record.name, 'name', details);
  }

  if (record.displayName !== undefined) {
    parseRequiredString(record.displayName, 'displayName', details);
  }

  if (record.name === undefined && record.displayName === undefined) {
    details.push({ field: 'body', issue: 'at_least_one_field_required' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de atualização inválidos.', { details });
  }

  const update: UpdateTenantRequestBody = {
    ...(record.name !== undefined ? { name: (record.name as string).trim() } : {}),
    ...(record.displayName !== undefined
      ? { displayName: (record.displayName as string).trim() }
      : {}),
  };

  return update;
}

export type ListTenantsQuery = {
  readonly status?: TenantStatus;
  readonly limit?: number;
  readonly offset?: number;
};

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError('Parâmetros de listagem inválidos.', {
      details: [{ field, issue: 'invalid_integer' }],
    });
  }
  return parsed;
}

export function parseListTenantsQuery(query: unknown): ListTenantsQuery {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new ValidationError('Query string inválida.', {
      details: [{ field: 'query', issue: 'must_be_object' }],
    });
  }

  const record = query as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !LIST_QUERY_KEYS.has(key));
  if (unknown.length > 0) {
    throw new ValidationError('Query string contém parâmetros não permitidos.', {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
    });
  }

  let status: TenantStatus | undefined;
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !TENANT_STATUSES.includes(record.status as TenantStatus)
    ) {
      throw new ValidationError('Filtro de status inválido.', {
        details: [{ field: 'status', issue: 'invalid_enum' }],
      });
    }
    status = record.status as TenantStatus;
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

  return {
    ...(status !== undefined ? { status } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}
