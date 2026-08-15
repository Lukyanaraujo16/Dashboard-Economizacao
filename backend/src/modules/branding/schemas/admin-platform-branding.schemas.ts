import { ValidationError } from '../../../shared/errors/application-error.js';
import { isAllowedBrandColorToken } from '../domain/allowed-color-tokens.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import { parseBrandColorOverrides } from '../domain/color-validation.js';
import { normalizePlatformBrandName } from '../domain/platform-brand-name.js';
import type { UpsertPlatformBrandingInput } from '../domain/types.js';

const PATCH_BODY_KEYS = new Set(['name', 'light', 'dark']);

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
): UpsertPlatformBrandingInput['lightColors'] | undefined {
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

/**
 * PATCH /admin/platform/branding — name / light / dark.
 * Não aceita logoFileId / faviconFileId (endpoints de asset).
 */
export function parsePatchPlatformBrandingRequestBody(body: unknown): UpsertPlatformBrandingInput {
  const record = assertObjectBody(body, 'Payload de branding da plataforma');
  rejectUnknownKeys(record, PATCH_BODY_KEYS, 'Payload de branding da plataforma');

  if (record.name === undefined && record.light === undefined && record.dark === undefined) {
    throw new ValidationError('Payload de branding da plataforma inválido.', {
      details: [{ field: 'body', issue: 'at_least_one_field_required' }],
    });
  }

  let name: string | undefined;
  let lightColors: UpsertPlatformBrandingInput['lightColors'];
  let darkColors: UpsertPlatformBrandingInput['darkColors'];

  if (record.name !== undefined) {
    if (typeof record.name !== 'string') {
      throw new ValidationError('Nome da plataforma inválido.', {
        details: [{ field: 'name', issue: 'required_string' }],
      });
    }
    try {
      name = normalizePlatformBrandName(record.name);
    } catch (error) {
      if (error instanceof BrandingDomainError) {
        throw new ValidationError(error.message, {
          details: [{ field: 'name', issue: 'invalid' }],
        });
      }
      throw error;
    }
  }

  if (record.light !== undefined) {
    lightColors = parseSchemeInput(record.light, 'light');
  }

  if (record.dark !== undefined) {
    darkColors = parseSchemeInput(record.dark, 'dark');
  }

  return {
    ...(name !== undefined ? { name } : {}),
    ...(lightColors !== undefined ? { lightColors } : {}),
    ...(darkColors !== undefined ? { darkColors } : {}),
  };
}
