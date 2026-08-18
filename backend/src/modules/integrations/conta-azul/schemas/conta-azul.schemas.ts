import { ValidationError } from '../../../../shared/errors/application-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTenantIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Identificador da empresa inválido.', { httpStatus: 400 });
  }
  const tenantId = (params as Record<string, unknown>).tenantId;
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    throw new ValidationError('Identificador da empresa inválido.', { httpStatus: 400 });
  }
  return tenantId;
}

export function parseCallbackQuery(query: unknown): {
  readonly code: string | null;
  readonly state: string | null;
  readonly oauthError: string | null;
} {
  const record =
    query !== null && typeof query === 'object' && !Array.isArray(query)
      ? (query as Record<string, unknown>)
      : {};

  const code = typeof record.code === 'string' && record.code.length > 0 ? record.code : null;
  const state = typeof record.state === 'string' && record.state.length > 0 ? record.state : null;
  const oauthError =
    typeof record.error === 'string' && record.error.length > 0 ? record.error : null;

  return { code, state, oauthError };
}
