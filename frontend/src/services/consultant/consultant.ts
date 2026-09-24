import {
  consultantConversationMessagesPath,
  consultantConversationPath,
  consultantConversationsPath,
  consultantStatusPath,
} from '../../lib/api-config';
import type {
  ConsultantConversation,
  ConsultantConversationDetail,
  ConsultantErrorDetail,
  ConsultantMessage,
  ConsultantUserStatus,
  SendConsultantMessageInput,
  SendConsultantMessageResult,
} from './consultant.types';
import { ConsultantRequestError } from './consultant.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<ConsultantErrorDetail>;
    readonly requestId?: string;
  };
};

const UNAVAILABLE_MESSAGE = 'Não foi possível conectar ao serviço. Tente novamente.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isConsultantStatus(value: unknown): value is ConsultantUserStatus['status'] {
  return (
    value === 'ACTIVE' ||
    value === 'DISABLED' ||
    value === 'NOT_CONFIGURED' ||
    value === 'UNAVAILABLE'
  );
}

function isConsultantUserStatus(value: unknown): value is ConsultantUserStatus {
  return isRecord(value) && isConsultantStatus(value.status);
}

function isConversation(value: unknown): value is ConsultantConversation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    (value.title === null || typeof value.title === 'string') &&
    (value.status === 'OPEN' || value.status === 'CLOSED') &&
    typeof value.startedAt === 'string' &&
    typeof value.lastMessageAt === 'string'
  );
}

function isMessage(value: unknown): value is ConsultantMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    (value.senderType === 'USER' ||
      value.senderType === 'CONSULTANT' ||
      value.senderType === 'SYSTEM') &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function isConversationDetail(value: unknown): value is ConsultantConversationDetail {
  if (!isRecord(value) || !isConversation(value)) {
    return false;
  }
  const messages = (value as Record<string, unknown>).messages;
  return Array.isArray(messages) && messages.every(isMessage);
}

function isConversationList(value: unknown): value is readonly ConsultantConversation[] {
  if (Array.isArray(value)) {
    return value.every(isConversation);
  }
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isConversation);
}

function toConversationList(value: unknown): readonly ConsultantConversation[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.data)) {
    return value.data as ConsultantConversation[];
  }
  return [];
}

function toConsultantFailure(response: Response, body: unknown): ConsultantRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;
  const message = envelope?.error?.message ?? UNAVAILABLE_MESSAGE;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ConsultantRequestError('unauthenticated', 'Sua sessão expirou. Faça login novamente.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ConsultantRequestError('forbidden', 'Você não tem permissão para esta operação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new ConsultantRequestError('not_found', 'Conversa não encontrada.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 409 || code === 'CONFLICT') {
    return new ConsultantRequestError('conflict', message, {
      httpStatus: response.status,
      code,
      requestId,
      details,
    });
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new ConsultantRequestError(
      kind,
      kind === 'bad_request' ? 'Não foi possível processar a solicitação.' : 'Verifique os dados informados.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new ConsultantRequestError('bad_request', 'Não foi possível processar a solicitação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
    httpStatus: response.status,
    code,
    requestId,
  });
}

async function consultantFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, { cause });
  }
}

function parseSendResult(body: unknown): SendConsultantMessageResult {
  if (isConversationDetail(body)) {
    const userMessage = [...body.messages].reverse().find((message) => message.senderType === 'USER');
    const consultantMessage = [...body.messages]
      .reverse()
      .find((message) => message.senderType === 'CONSULTANT');
    if (userMessage && consultantMessage) {
      return { userMessage, consultantMessage, conversation: body };
    }
  }

  if (isRecord(body) && isMessage(body.userMessage) && isMessage(body.consultantMessage)) {
    return {
      userMessage: body.userMessage,
      consultantMessage: body.consultantMessage,
      conversation: isConversationDetail(body.conversation) ? body.conversation : undefined,
    };
  }

  throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE);
}

export async function getConsultantStatus(): Promise<ConsultantUserStatus> {
  const response = await consultantFetch(consultantStatusPath(), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConsultantUserStatus(body)) {
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
      httpStatus: response.status,
    });
  }

  return body;
}

export async function listConsultantConversations(): Promise<readonly ConsultantConversation[]> {
  const response = await consultantFetch(consultantConversationsPath(), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConversationList(body)) {
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
      httpStatus: response.status,
    });
  }

  return toConversationList(body);
}

export async function getConsultantConversation(
  conversationId: string,
): Promise<ConsultantConversationDetail> {
  const response = await consultantFetch(consultantConversationPath(conversationId), {
    method: 'GET',
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConversationDetail(body)) {
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
      httpStatus: response.status,
    });
  }

  return body;
}

export async function createConsultantConversation(): Promise<ConsultantConversation> {
  const response = await consultantFetch(consultantConversationsPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConversation(body)) {
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
      httpStatus: response.status,
    });
  }

  return body;
}

export async function sendConsultantMessage(
  conversationId: string,
  input: SendConsultantMessageInput,
): Promise<SendConsultantMessageResult> {
  const payload: SendConsultantMessageInput = {
    content: input.content,
    ...(input.month ? { month: input.month } : {}),
  };

  const response = await consultantFetch(consultantConversationMessagesPath(conversationId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  try {
    return parseSendResult(body);
  } catch (error) {
    if (error instanceof ConsultantRequestError) {
      throw error;
    }
    throw new ConsultantRequestError('unavailable', UNAVAILABLE_MESSAGE, {
      httpStatus: response.status,
    });
  }
}
