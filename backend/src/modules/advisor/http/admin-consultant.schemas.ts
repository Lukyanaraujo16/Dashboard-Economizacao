import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  AI_CONSULTANT_STATUSES,
  AI_KNOWLEDGE_STATUSES,
  type AiConsultantStatus,
  type AiKnowledgeStatus,
  type AiProviderId,
  type AiTonePreset,
} from '../domain/types.js';
import { assertAllowedAiModel, isAiProviderId } from '../domain/ai-provider-models.js';
import { CONSULTANT_NAME_MAX_LENGTH, assertConsultantName } from '../domain/consultant-name.js';
import { isAiTonePreset } from '../domain/tone-presets.js';
import { ADVISOR_ADMIN_FIELD_LIMITS } from './public-dtos.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUT_SETTINGS_BODY_KEYS = new Set([
  'status',
  'provider',
  'model',
  'consultantName',
  'businessSegment',
  'businessDescription',
  'adminPrompt',
  'tonePreset',
  'tone',
]);
const PUT_PROVIDER_CREDENTIAL_KEYS = new Set(['credential']);
const CREATE_KNOWLEDGE_BODY_KEYS = new Set(['title', 'content', 'status', 'contentType']);
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

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32) {
      return true;
    }
  }
  return false;
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
  readonly consultantName?: string | null;
  readonly businessSegment?: string | null;
  readonly businessDescription?: string | null;
  readonly adminPrompt?: string | null;
  readonly tonePreset?: AiTonePreset;
  readonly tone?: string | null;
};

export type PutAdminProviderCredentialBody = {
  readonly credential: string;
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
  const consultantName = parseOptionalNullableBoundedString(
    record.consultantName,
    'consultantName',
    CONSULTANT_NAME_MAX_LENGTH,
    details,
  );
  if (typeof consultantName === 'string' && consultantName.trim().length > 0) {
    try {
      assertConsultantName(consultantName);
    } catch {
      details.push({ field: 'consultantName', issue: 'invalid_content' });
    }
  }

  let tonePreset: AiTonePreset | undefined;
  if (record.tonePreset !== undefined) {
    if (typeof record.tonePreset !== 'string' || !isAiTonePreset(record.tonePreset)) {
      details.push({ field: 'tonePreset', issue: 'invalid_enum' });
    } else {
      tonePreset = record.tonePreset;
    }
  }

  const tone = parseOptionalNullableBoundedString(
    record.tone,
    'tone',
    ADVISOR_ADMIN_FIELD_LIMITS.tone,
    details,
  );

  if (
    tonePreset === 'PERSONALIZADO' &&
    (tone === undefined || tone === null || (typeof tone === 'string' && tone.trim().length === 0))
  ) {
    details.push({ field: 'tone', issue: 'required_for_custom_preset' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados do Consultor inválidos.', { details });
  }

  return {
    status: record.status as AiConsultantStatus,
    provider: provider!,
    model: (record.model as string).trim(),
    ...(consultantName !== undefined ? { consultantName } : {}),
    ...(businessSegment !== undefined ? { businessSegment } : {}),
    ...(businessDescription !== undefined ? { businessDescription } : {}),
    ...(adminPrompt !== undefined ? { adminPrompt } : {}),
    ...(tonePreset !== undefined ? { tonePreset } : {}),
    ...(tone !== undefined ? { tone } : {}),
  };
}

export function parseProviderParam(params: unknown): AiProviderId {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'provider', issue: 'required' }],
    });
  }

  const provider = (params as Record<string, unknown>).provider;
  if (typeof provider !== 'string' || !isAiProviderId(provider)) {
    throw new ValidationError('Provedor de IA inválido.', {
      details: [{ field: 'provider', issue: 'invalid_enum' }],
    });
  }

  return provider;
}

export function parsePutAdminProviderCredentialBody(body: unknown): PutAdminProviderCredentialBody {
  const record = assertObjectBody(body, 'Payload de credencial');
  rejectUnknownKeys(record, PUT_PROVIDER_CREDENTIAL_KEYS, 'Payload de credencial');

  if (typeof record.credential !== 'string') {
    throw new ValidationError('Credencial inválida.', {
      details: [{ field: 'credential', issue: 'required_string' }],
    });
  }

  const credential = record.credential.trim();
  if (credential.length === 0) {
    throw new ValidationError('Credencial inválida.', {
      details: [{ field: 'credential', issue: 'required' }],
    });
  }
  if (credential.length > ADVISOR_ADMIN_FIELD_LIMITS.credential) {
    throw new ValidationError('Credencial inválida.', {
      details: [{ field: 'credential', issue: 'too_long' }],
    });
  }
  if (credential.length < 8 || hasControlCharacters(credential)) {
    throw new ValidationError('Credencial inválida.', {
      details: [{ field: 'credential', issue: 'invalid' }],
    });
  }

  return { credential };
}

export type CreateAdminKnowledgeRequestBody = {
  readonly title: string;
  readonly content: string;
  readonly status: AiKnowledgeStatus;
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

  if (record.contentType !== undefined && record.contentType !== 'TEXT') {
    details.push({ field: 'contentType', issue: 'invalid_enum' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de conhecimento inválidos.', { details });
  }

  return {
    title: (record.title as string).trim(),
    content: (record.content as string).trim(),
    status:
      record.status === undefined ? 'ACTIVE' : (record.status as AiKnowledgeStatus),
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
