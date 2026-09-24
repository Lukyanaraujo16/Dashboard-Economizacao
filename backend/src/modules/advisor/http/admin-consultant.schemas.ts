import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  AI_CONSULTANT_STATUSES,
  AI_KNOWLEDGE_STATUSES,
  type AiConsultantStatus,
  type AiKnowledgeStatus,
  type AiProviderId,
} from '../domain/types.js';
import { assertAllowedAiModel, isAiProviderId } from '../domain/ai-provider-models.js';
import { ADVISOR_ADMIN_FIELD_LIMITS } from './public-dtos.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUT_SETTINGS_BODY_KEYS = new Set([
  'status',
  'provider',
  'model',
  'businessSegment',
  'businessDescription',
  'adminPrompt',
  'tone',
]);
const CREATE_KNOWLEDGE_BODY_KEYS = new Set(['title', 'content', 'status']);
const UPDATE_KNOWLEDGE_BODY_KEYS = new Set(['title', 'content', 'status']);

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

export function parseKnowledgeEntryIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'entryId', issue: 'required' }],
    });
  }

  const entryId = (params as Record<string, unknown>).entryId;
  if (typeof entryId !== 'string' || !UUID_PATTERN.test(entryId)) {
    throw new ValidationError('Identificador de conhecimento inválido.', {
      details: [{ field: 'entryId', issue: 'invalid_uuid' }],
    });
  }

  return entryId;
}

function parseRequiredBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
  details: Array<{ field: string; issue: string }>,
): void {
  if (typeof value !== 'string') {
    details.push({ field, issue: 'required_string' });
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    details.push({ field, issue: 'required' });
    return;
  }
  if (trimmed.length > maxLength) {
    details.push({ field, issue: 'too_long' });
  }
}

function parseOptionalNullableBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
  details: Array<{ field: string; issue: string }>,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    details.push({ field, issue: 'invalid_string' });
    return undefined;
  }
  if (value.trim().length > maxLength) {
    details.push({ field, issue: 'too_long' });
  }
  return value;
}

export type PutAdminConsultantRequestBody = {
  readonly status: AiConsultantStatus;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly businessSegment?: string | null;
  readonly businessDescription?: string | null;
  readonly adminPrompt?: string | null;
  readonly tone?: string | null;
};

export function parsePutAdminConsultantRequestBody(body: unknown): PutAdminConsultantRequestBody {
  const record = assertObjectBody(body, 'Payload do Consultor');
  rejectUnknownKeys(record, PUT_SETTINGS_BODY_KEYS, 'Payload do Consultor');

  const details: Array<{ field: string; issue: string }> = [];

  if (
    typeof record.status !== 'string' ||
    !(AI_CONSULTANT_STATUSES as readonly string[]).includes(record.status)
  ) {
    details.push({ field: 'status', issue: 'invalid_enum' });
  }

  let provider: AiProviderId | undefined;
  if (typeof record.provider !== 'string' || !isAiProviderId(record.provider)) {
    details.push({ field: 'provider', issue: 'invalid_enum' });
  } else {
    provider = record.provider;
  }

  if (typeof record.model !== 'string' || record.model.trim().length === 0) {
    details.push({ field: 'model', issue: 'required_string' });
  } else if (provider !== undefined) {
    try {
      assertAllowedAiModel(provider, record.model);
    } catch {
      details.push({ field: 'model', issue: 'not_allowed' });
    }
  }

  const businessSegment = parseOptionalNullableBoundedString(
    record.businessSegment,
    'businessSegment',
    ADVISOR_ADMIN_FIELD_LIMITS.businessSegment,
    details,
  );
  const businessDescription = parseOptionalNullableBoundedString(
    record.businessDescription,
    'businessDescription',
    ADVISOR_ADMIN_FIELD_LIMITS.businessDescription,
    details,
  );
  const adminPrompt = parseOptionalNullableBoundedString(
    record.adminPrompt,
    'adminPrompt',
    ADVISOR_ADMIN_FIELD_LIMITS.adminPrompt,
    details,
  );
  const tone = parseOptionalNullableBoundedString(
    record.tone,
    'tone',
    ADVISOR_ADMIN_FIELD_LIMITS.tone,
    details,
  );

  if (details.length > 0) {
    throw new ValidationError('Dados do Consultor inválidos.', { details });
  }

  return {
    status: record.status as AiConsultantStatus,
    provider: provider!,
    model: (record.model as string).trim(),
    ...(businessSegment !== undefined ? { businessSegment } : {}),
    ...(businessDescription !== undefined ? { businessDescription } : {}),
    ...(adminPrompt !== undefined ? { adminPrompt } : {}),
    ...(tone !== undefined ? { tone } : {}),
  };
}

export type CreateAdminKnowledgeRequestBody = {
  readonly title: string;
  readonly content: string;
  readonly status?: AiKnowledgeStatus;
};

export function parseCreateAdminKnowledgeRequestBody(
  body: unknown,
): CreateAdminKnowledgeRequestBody {
  const record = assertObjectBody(body, 'Payload de conhecimento');
  rejectUnknownKeys(record, CREATE_KNOWLEDGE_BODY_KEYS, 'Payload de conhecimento');

  const details: Array<{ field: string; issue: string }> = [];
  parseRequiredBoundedString(
    record.title,
    'title',
    ADVISOR_ADMIN_FIELD_LIMITS.knowledgeTitle,
    details,
  );
  parseRequiredBoundedString(
    record.content,
    'content',
    ADVISOR_ADMIN_FIELD_LIMITS.knowledgeContent,
    details,
  );

  if (
    record.status !== undefined &&
    (typeof record.status !== 'string' ||
      !(AI_KNOWLEDGE_STATUSES as readonly string[]).includes(record.status))
  ) {
    details.push({ field: 'status', issue: 'invalid_enum' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de conhecimento inválidos.', { details });
  }

  return {
    title: (record.title as string).trim(),
    content: (record.content as string).trim(),
    ...(record.status !== undefined ? { status: record.status as AiKnowledgeStatus } : {}),
  };
}

export type UpdateAdminKnowledgeRequestBody = {
  readonly title?: string;
  readonly content?: string;
  readonly status?: AiKnowledgeStatus;
};

export function parseUpdateAdminKnowledgeRequestBody(
  body: unknown,
): UpdateAdminKnowledgeRequestBody {
  const record = assertObjectBody(body, 'Payload de atualização de conhecimento');
  rejectUnknownKeys(record, UPDATE_KNOWLEDGE_BODY_KEYS, 'Payload de atualização de conhecimento');

  const details: Array<{ field: string; issue: string }> = [];

  if (record.title !== undefined) {
    parseRequiredBoundedString(
      record.title,
      'title',
      ADVISOR_ADMIN_FIELD_LIMITS.knowledgeTitle,
      details,
    );
  }
  if (record.content !== undefined) {
    parseRequiredBoundedString(
      record.content,
      'content',
      ADVISOR_ADMIN_FIELD_LIMITS.knowledgeContent,
      details,
    );
  }
  if (
    record.status !== undefined &&
    (typeof record.status !== 'string' ||
      !(AI_KNOWLEDGE_STATUSES as readonly string[]).includes(record.status))
  ) {
    details.push({ field: 'status', issue: 'invalid_enum' });
  }

  if (
    record.title === undefined &&
    record.content === undefined &&
    record.status === undefined
  ) {
    details.push({ field: 'body', issue: 'at_least_one_field_required' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de atualização de conhecimento inválidos.', { details });
  }

  return {
    ...(record.title !== undefined ? { title: (record.title as string).trim() } : {}),
    ...(record.content !== undefined ? { content: (record.content as string).trim() } : {}),
    ...(record.status !== undefined ? { status: record.status as AiKnowledgeStatus } : {}),
  };
}
