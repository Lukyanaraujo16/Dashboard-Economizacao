import type { AiRunErrorCode } from '../../modules/advisor/domain/types.js';
import { IaProviderError } from './types.js';

export const IA_ERROR_MESSAGES: Record<AiRunErrorCode, string> = {
  AUTH: 'Falha de autenticação com o provedor de IA.',
  RATE_LIMIT: 'O provedor de IA limitou temporariamente as solicitações.',
  TIMEOUT: 'O provedor de IA não respondeu a tempo.',
  MODEL_UNAVAILABLE: 'O modelo de IA solicitado não está disponível.',
  BAD_REQUEST: 'A solicitação ao provedor de IA foi rejeitada.',
  CONTENT_REJECTED: 'O provedor de IA recusou o conteúdo da solicitação.',
  PROVIDER_ERROR: 'O provedor de IA está temporariamente indisponível.',
  UNKNOWN: 'Não foi possível concluir a geração com o provedor de IA.',
};

export function iaProviderError(code: AiRunErrorCode, message?: string): IaProviderError {
  return new IaProviderError(code, message ?? IA_ERROR_MESSAGES[code]);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isContentRejectedPayload(json: unknown): boolean {
  const payload = asRecord(json);
  if (!payload) {
    return false;
  }
  if (payload.finish_reason === 'content_filter' || payload.stop_reason === 'refusal') {
    return true;
  }
  const error = asRecord(payload.error);
  if (!error) {
    return false;
  }
  return (
    error.code === 'content_filter' ||
    error.type === 'content_filter' ||
    error.type === 'refusal'
  );
}

export function mapHttpStatusToErrorCode(status: number): AiRunErrorCode {
  if (status === 401 || status === 403) {
    return 'AUTH';
  }
  if (status === 429) {
    return 'RATE_LIMIT';
  }
  if (status === 404) {
    return 'MODEL_UNAVAILABLE';
  }
  if (status === 400) {
    return 'BAD_REQUEST';
  }
  if (status >= 500 && status <= 599) {
    return 'PROVIDER_ERROR';
  }
  return 'UNKNOWN';
}

export function mapHttpError(status: number, json: unknown): IaProviderError {
  if (isContentRejectedPayload(json)) {
    return iaProviderError('CONTENT_REJECTED');
  }
  return iaProviderError(mapHttpStatusToErrorCode(status));
}
