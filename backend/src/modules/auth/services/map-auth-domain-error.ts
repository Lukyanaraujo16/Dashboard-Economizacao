import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import { AuthDomainError } from '../domain/user-invariants.js';
import { Prisma } from '../../../generated/prisma/client.js';

export function mapAuthDomainError(error: AuthDomainError): never {
  switch (error.code) {
    case 'USER_NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'USER_EMAIL_ALREADY_EXISTS':
      throw new ConflictError(error.message, {
        details: [{ field: 'email', issue: 'already_exists' }],
      });
    case 'LAST_ACTIVE_ADMIN_PROTECTED':
    case 'USER_ALREADY_BLOCKED':
    case 'USER_ALREADY_DISABLED':
    case 'USER_NOT_BLOCKED':
    case 'USER_NOT_DISABLED':
    case 'USER_DISABLED_CANNOT_BLOCK':
      throw new ConflictError(error.message);
    case 'USER_NAME_REQUIRED':
      throw new ValidationError(error.message, {
        details: [{ field: 'name', issue: 'required' }],
      });
    case 'USER_UPDATE_EMPTY':
    case 'USER_REQUIRES_TENANT':
    case 'PLATFORM_ROLE_MUST_NOT_HAVE_TENANT':
    case 'USER_DISABLED_REQUIRES_DEACTIVATED_AT':
    case 'USER_ACTIVE_LIKE_REQUIRES_NULL_DEACTIVATED_AT':
      throw new ValidationError(error.message);
    default:
      throw error;
  }
}

export function isUniqueEmailViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function withAuthDomainError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthDomainError) {
      mapAuthDomainError(error);
    }
    if (isUniqueEmailViolation(error)) {
      throw new ConflictError('Já existe usuário com este e-mail.', {
        details: [{ field: 'email', issue: 'already_exists' }],
      });
    }
    throw error;
  }
}
