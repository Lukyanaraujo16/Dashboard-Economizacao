import { ValidationError } from '../../../shared/errors/application-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_BODY_KEYS = new Set(['triggerType', 'parameters']);
const UPDATE_BODY_KEYS = new Set(['parameters']);
const ACTIVE_BODY_KEYS = new Set(['active']);

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
      httpStatus: 400,
    });
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) {
      return true;
    }
  }
  return false;
}

export function parseProactiveTriggerConfigurationIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'configurationId', issue: 'required' }],
      httpStatus: 400,
    });
  }

  const configurationId = (params as Record<string, unknown>).configurationId;
  if (typeof configurationId !== 'string' || !UUID_PATTERN.test(configurationId)) {
    throw new ValidationError('Identificador de gatilho inválido.', {
      details: [{ field: 'configurationId', issue: 'invalid_uuid' }],
      httpStatus: 400,
    });
  }

  return configurationId;
}

export type CreateProactiveTriggerRequestBody = {
  readonly triggerType: string;
  readonly parameters: unknown;
};

export function parseCreateProactiveTriggerRequestBody(
  body: unknown,
): CreateProactiveTriggerRequestBody {
  const record = assertObjectBody(body, 'Payload de gatilho');
  rejectUnknownKeys(record, CREATE_BODY_KEYS, 'Payload de gatilho');

  const triggerType = record.triggerType;
  if (typeof triggerType !== 'string' || triggerType.trim().length === 0 || hasControlCharacters(triggerType)) {
    throw new ValidationError('Tipo de gatilho inválido.', {
      details: [{ field: 'triggerType', issue: 'required_string' }],
      httpStatus: 400,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(record, 'parameters')) {
    throw new ValidationError('Parâmetros do gatilho são obrigatórios.', {
      details: [{ field: 'parameters', issue: 'required' }],
      httpStatus: 400,
    });
  }

  return {
    triggerType,
    parameters: record.parameters,
  };
}

export function parseUpdateProactiveTriggerRequestBody(body: unknown): { readonly parameters: unknown } {
  const record = assertObjectBody(body, 'Payload de gatilho');
  rejectUnknownKeys(record, UPDATE_BODY_KEYS, 'Payload de gatilho');

  if (!Object.prototype.hasOwnProperty.call(record, 'parameters')) {
    throw new ValidationError('Parâmetros do gatilho são obrigatórios.', {
      details: [{ field: 'parameters', issue: 'required' }],
      httpStatus: 400,
    });
  }

  return { parameters: record.parameters };
}

export function parseSetProactiveTriggerActiveRequestBody(body: unknown): { readonly active: boolean } {
  const record = assertObjectBody(body, 'Payload de gatilho');
  rejectUnknownKeys(record, ACTIVE_BODY_KEYS, 'Payload de gatilho');

  if (typeof record.active !== 'boolean') {
    throw new ValidationError('Informe se o gatilho fica ativo.', {
      details: [{ field: 'active', issue: 'required_boolean' }],
      httpStatus: 400,
    });
  }

  return { active: record.active };
}
