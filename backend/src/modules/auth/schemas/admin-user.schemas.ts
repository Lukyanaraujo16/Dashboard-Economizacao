import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isPasswordLengthValid,
} from '../domain/password-policy.js';
import { USER_STATUSES, type UserStatus } from '../domain/types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREATE_BODY_KEYS = new Set(['name', 'email', 'password']);
const UPDATE_BODY_KEYS = new Set(['name', 'email']);
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

export function parseUserIdParam(params: unknown, field = 'userId'): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field, issue: 'required' }],
    });
  }
  const value = (params as Record<string, unknown>)[field];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError('Identificador de usuário inválido.', {
      details: [{ field, issue: 'invalid_uuid' }],
    });
  }
  return value;
}

export type CreateAdminUserRequestBody = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export function parseCreateAdminUserRequestBody(body: unknown): CreateAdminUserRequestBody {
  const record = assertObjectBody(body, 'Payload de criação');
  rejectUnknownKeys(record, CREATE_BODY_KEYS, 'Payload de criação');

  const details: Array<{ field: string; issue: string }> = [];
  parseRequiredString(record.name, 'name', details);
  parseRequiredString(record.email, 'email', details);

  if (typeof record.password !== 'string') {
    details.push({ field: 'password', issue: 'required_string' });
  } else if (!isPasswordLengthValid(record.password)) {
    details.push({
      field: 'password',
      issue: `length_between_${PASSWORD_MIN_LENGTH}_${PASSWORD_MAX_LENGTH}`,
    });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de criação inválidos.', { details });
  }

  return {
    name: record.name as string,
    email: record.email as string,
    password: record.password as string,
  };
}

export type UpdateAdminUserRequestBody = {
  readonly name?: string;
  readonly email?: string;
};

export function parseUpdateAdminUserRequestBody(body: unknown): UpdateAdminUserRequestBody {
  const record = assertObjectBody(body, 'Payload de atualização');
  rejectUnknownKeys(record, UPDATE_BODY_KEYS, 'Payload de atualização');

  const details: Array<{ field: string; issue: string }> = [];
  if (record.name !== undefined) {
    parseRequiredString(record.name, 'name', details);
  }
  if (record.email !== undefined) {
    parseRequiredString(record.email, 'email', details);
  }
  if (record.name === undefined && record.email === undefined) {
    details.push({ field: 'body', issue: 'empty_update' });
  }
  if (details.length > 0) {
    throw new ValidationError('Dados de atualização inválidos.', { details });
  }

  return {
    ...(record.name !== undefined ? { name: record.name as string } : {}),
    ...(record.email !== undefined ? { email: record.email as string } : {}),
  };
}

export type ListUsersQuery = {
  readonly status?: UserStatus;
  readonly limit?: number;
  readonly offset?: number;
};

export function parseListUsersQuery(query: unknown): ListUsersQuery {
  if (query === null || query === undefined) {
    return {};
  }
  if (typeof query !== 'object' || Array.isArray(query)) {
    throw new ValidationError('Query inválida.', {
      details: [{ field: 'query', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }

  const record = query as Record<string, unknown>;
  rejectUnknownKeys(record, LIST_QUERY_KEYS, 'Query');

  const details: Array<{ field: string; issue: string }> = [];
  let status: UserStatus | undefined;
  let limit: number | undefined;
  let offset: number | undefined;

  if (record.status !== undefined) {
    if (typeof record.status !== 'string' || !USER_STATUSES.includes(record.status as UserStatus)) {
      details.push({ field: 'status', issue: 'invalid' });
    } else {
      status = record.status as UserStatus;
    }
  }

  if (record.limit !== undefined) {
    const raw = typeof record.limit === 'string' ? Number(record.limit) : record.limit;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      details.push({ field: 'limit', issue: 'invalid' });
    } else {
      limit = raw;
    }
  }

  if (record.offset !== undefined) {
    const raw = typeof record.offset === 'string' ? Number(record.offset) : record.offset;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      details.push({ field: 'offset', issue: 'invalid' });
    } else {
      offset = raw;
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Parâmetros de listagem inválidos.', { details });
  }

  return { status, limit, offset };
}
