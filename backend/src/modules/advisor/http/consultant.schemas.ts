import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { ADVISOR_ADMIN_FIELD_LIMITS } from './public-dtos.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREATE_CONVERSATION_KEYS = new Set(['title']);
const SEND_MESSAGE_KEYS = new Set(['content', 'month']);
const LIST_QUERY_KEYS = new Set(['limit', 'offset']);

export type CreateConsultantConversationBody = {
  readonly title?: string;
};

export type SendConsultantMessageBody = {
  readonly content: string;
  readonly month?: string;
};

export type ListConsultantConversationsQuery = {
  readonly limit?: number;
  readonly offset?: number;
};

export function assertNoTenantIdBody(body: unknown): void {
  if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'tenantId' in body) {
    throw new ValidationError('tenantId não é aceito nesta rota.', {
      httpStatus: 400,
      details: [{ field: 'tenantId', issue: 'not_allowed' }],
    });
  }
}

export function parseConversationIdParam(params: unknown): string {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('Parâmetro de rota inválido.', {
      details: [{ field: 'conversationId', issue: 'required' }],
      httpStatus: 400,
    });
  }

  const conversationId = (params as Record<string, unknown>).conversationId;
  if (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId)) {
    throw new ValidationError('Identificador de conversa inválido.', {
      details: [{ field: 'conversationId', issue: 'invalid_uuid' }],
      httpStatus: 400,
    });
  }

  return conversationId;
}

export function parseCreateConversationBody(body: unknown): CreateConsultantConversationBody {
  if (body === undefined || body === null) {
    return {};
  }

  const record = assertObjectBody(body, 'Payload de conversa');
  assertNoTenantIdBody(record);
  rejectUnknownKeys(record, CREATE_CONVERSATION_KEYS, 'Payload de conversa');

  if (record.title === undefined) {
    return {};
  }
  if (typeof record.title !== 'string') {
    throw new ValidationError('Dados de conversa inválidos.', {
      details: [{ field: 'title', issue: 'must_be_string' }],
      httpStatus: 400,
    });
  }

  const title = record.title.trim();
  if (title.length === 0) {
    return {};
  }
  if (title.length > ADVISOR_ADMIN_FIELD_LIMITS.conversationTitle) {
    throw new ValidationError('Dados de conversa inválidos.', {
      details: [{ field: 'title', issue: 'too_long' }],
      httpStatus: 400,
    });
  }

  return { title };
}

export function parseSendMessageBody(body: unknown): SendConsultantMessageBody {
  const record = assertObjectBody(body, 'Payload de mensagem');
  assertNoTenantIdBody(record);
  rejectUnknownKeys(record, SEND_MESSAGE_KEYS, 'Payload de mensagem');

  if (typeof record.content !== 'string' || record.content.trim().length === 0) {
    throw new ValidationError('Conteúdo da mensagem é obrigatório.', {
      details: [{ field: 'content', issue: 'required' }],
      httpStatus: 400,
    });
  }

  const content = record.content.trim();
  if (content.length > ADVISOR_ADMIN_FIELD_LIMITS.messageContent) {
    throw new ValidationError('Conteúdo da mensagem é inválido.', {
      details: [{ field: 'content', issue: 'too_long' }],
      httpStatus: 400,
    });
  }

  if (record.month === undefined) {
    return { content };
  }
  if (typeof record.month !== 'string' || !isValidMonthKey(record.month.trim())) {
    throw new ValidationError('month deve estar no formato YYYY-MM.', {
      details: [{ field: 'month', issue: 'invalid_format' }],
      httpStatus: 400,
    });
  }

  return { content, month: record.month.trim() };
}

export function parseListConversationsQuery(query: unknown): ListConsultantConversationsQuery {
  if (query === undefined || query === null) {
    return {};
  }
  if (typeof query !== 'object' || Array.isArray(query)) {
    throw new ValidationError('Query string inválida.', {
      details: [{ field: 'query', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }

  const record = query as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !LIST_QUERY_KEYS.has(key));
  if (unknown.length > 0) {
    throw new ValidationError('Query string contém parâmetros não permitidos.', {
      details: unknown.map((field) => ({ field, issue: 'unknown_field' })),
      httpStatus: 400,
    });
  }

  const details: Array<{ field: string; issue: string }> = [];
  let limit: number | undefined;
  let offset: number | undefined;

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
    throw new ValidationError('Parâmetros de listagem inválidos.', {
      details,
      httpStatus: 400,
    });
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}

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
