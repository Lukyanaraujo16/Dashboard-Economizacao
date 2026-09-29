import { ValidationError } from '../../../shared/errors/application-error.js';
import { AI_KNOWLEDGE_STATUSES, type AiKnowledgeStatus } from '../domain/types.js';
import { ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX } from '../domain/advisor-knowledge-document-limits.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UPDATE_DOCUMENT_BODY_KEYS = new Set(['title', 'status']);

function assertObjectBody(body: unknown, label: string): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError(`${label} inválido.`, {
      details: [{ field: 'body', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }
  return body as Record<string, unknown>;
}

export function parseKnowledgeDocumentIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'documentId', issue: 'required' }],
    });
  }
  const documentId = (params as Record<string, unknown>).documentId;
  if (typeof documentId !== 'string' || !UUID_PATTERN.test(documentId)) {
    throw new ValidationError('Identificador de documento inválido.', {
      details: [{ field: 'documentId', issue: 'invalid_uuid' }],
    });
  }
  return documentId;
}

export type UpdateAdminKnowledgeDocumentRequestBody = {
  readonly title?: string;
  readonly status?: AiKnowledgeStatus;
};

export function parseUpdateAdminKnowledgeDocumentRequestBody(
  body: unknown,
): UpdateAdminKnowledgeDocumentRequestBody {
  const record = assertObjectBody(body, 'Payload de atualização de documento');
  const unknown = Object.keys(record).filter((key) => !UPDATE_DOCUMENT_BODY_KEYS.has(key));
  if (unknown.length > 0) {
    throw new ValidationError('Payload de atualização de documento contém campos não permitidos.', {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
    });
  }

  const details: Array<{ field: string; issue: string }> = [];

  let title: string | undefined;
  if (record.title !== undefined) {
    if (typeof record.title !== 'string' || record.title.trim().length === 0) {
      details.push({ field: 'title', issue: 'required_string' });
    } else if (record.title.trim().length > ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX) {
      details.push({ field: 'title', issue: 'too_long' });
    } else {
      title = record.title.trim();
    }
  }

  let status: AiKnowledgeStatus | undefined;
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !(AI_KNOWLEDGE_STATUSES as readonly string[]).includes(record.status)
    ) {
      details.push({ field: 'status', issue: 'invalid_enum' });
    } else {
      status = record.status as AiKnowledgeStatus;
    }
  }

  if (title === undefined && status === undefined) {
    details.push({ field: 'body', issue: 'at_least_one_field_required' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de atualização de documento inválidos.', { details });
  }

  return {
    ...(title !== undefined ? { title } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}
