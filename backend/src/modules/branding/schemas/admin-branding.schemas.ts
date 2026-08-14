import { ValidationError } from '../../../shared/errors/application-error.js';
import { isAllowedBrandColorToken } from '../domain/allowed-color-tokens.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import { parseBrandColorOverrides } from '../domain/color-validation.js';
import type { UpsertTenantBrandingInput } from '../domain/types.js';

const PATCH_BODY_KEYS = new Set(['light', 'dark']);

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

function parseSchemeInput(
  value: unknown,
  field: string,
): UpsertTenantBrandingInput['lightColors'] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Esquema de cores inválido.', {
      details: [{ field, issue: 'must_be_object_or_null' }],
    });
  }

  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !isAllowedBrandColorToken(key));
  if (unknown.length > 0) {
    throw new ValidationError('Esquema de cores contém tokens não permitidos.', {
      details: unknown.map((token) => ({ field: `${field}.${token}`, issue: 'invalid_token' })),
    });
  }

  try {
    return parseBrandColorOverrides(record, field) ?? {};
  } catch (error) {
    if (error instanceof BrandingDomainError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

export function parsePatchTenantBrandingRequestBody(body: unknown): UpsertTenantBrandingInput {
  const record = assertObjectBody(body, 'Payload de branding');
  rejectUnknownKeys(record, PATCH_BODY_KEYS, 'Payload de branding');

  if (record.light === undefined && record.dark === undefined) {
    throw new ValidationError('Payload de branding inválido.', {
      details: [{ field: 'body', issue: 'at_least_one_field_required' }],
    });
  }

  const input: UpsertTenantBrandingInput = {
    ...(record.light !== undefined ? { lightColors: parseSchemeInput(record.light, 'light') } : {}),
    ...(record.dark !== undefined ? { darkColors: parseSchemeInput(record.dark, 'dark') } : {}),
  };

  return input;
}
