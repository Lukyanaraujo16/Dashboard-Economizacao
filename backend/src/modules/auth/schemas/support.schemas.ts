import { ValidationError } from '../../../shared/errors/application-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EnterSupportRequestBody = {
  readonly tenantId: string;
};

export function parseEnterSupportRequestBody(body: unknown): EnterSupportRequestBody {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Payload de suporte inválido.', {
      details: [{ field: 'body', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }

  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => key !== 'tenantId');
  if (unknown.length > 0) {
    throw new ValidationError('Payload de suporte contém campos não permitidos.', {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
    });
  }
  if (typeof record.tenantId !== 'string' || !UUID_PATTERN.test(record.tenantId)) {
    throw new ValidationError('Empresa inválida.', {
      details: [{ field: 'tenantId', issue: 'invalid_uuid' }],
    });
  }

  return { tenantId: record.tenantId };
}
