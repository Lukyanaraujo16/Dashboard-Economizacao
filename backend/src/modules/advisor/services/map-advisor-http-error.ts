import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';

export function mapAdvisorDomainError(error: AdvisorDomainError): never {
  switch (error.code) {
    case 'KNOWLEDGE_NOT_FOUND':
    case 'KNOWLEDGE_AUTHOR_NOT_FOUND':
    case 'CONVERSATION_NOT_FOUND':
    case 'RUN_NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'USER_NOT_IN_TENANT':
      throw new ConflictError(error.message);
    case 'AI_CONSULTANT_STATUS_INVALID':
    case 'AI_PROVIDER_INVALID':
    case 'AI_MODEL_NOT_ALLOWED':
    case 'AI_EMOJI_PREFERENCE_INVALID':
    case 'AI_KNOWLEDGE_STATUS_INVALID':
    case 'KNOWLEDGE_TITLE_REQUIRED':
    case 'KNOWLEDGE_CONTENT_REQUIRED':
    case 'TENANT_ID_REQUIRED':
    case 'USER_ID_REQUIRED':
    case 'CONSULTANT_DISABLED':
    case 'AI_RUN_STATUS_INVALID':
    case 'AI_RUN_ERROR_CODE_INVALID':
      throw new ValidationError(error.message);
    default:
      throw error;
  }
}

export async function withAdvisorDomainError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdvisorDomainError) {
      mapAdvisorDomainError(error);
    }
    throw error;
  }
}
