import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import { TenantDomainError } from '../domain/tenant-domain-error.js';

export function mapTenantDomainError(error: TenantDomainError): never {
  switch (error.code) {
    case 'TENANT_NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'TENANT_NAME_ALREADY_EXISTS':
      throw new ConflictError(error.message, {
        details: [{ field: 'name', issue: 'already_exists' }],
      });
    case 'TENANT_ALREADY_DISABLED':
    case 'TENANT_ALREADY_ACTIVE':
      throw new ConflictError(error.message);
    case 'TENANT_NAME_REQUIRED':
    case 'TENANT_NAME_INVALID':
      throw new ValidationError(error.message, {
        details: [{ field: 'name', issue: 'invalid' }],
      });
    case 'TENANT_DISPLAY_NAME_REQUIRED':
      throw new ValidationError(error.message, {
        details: [{ field: 'displayName', issue: 'required' }],
      });
    case 'TENANT_UPDATE_EMPTY':
      throw new ValidationError(error.message);
    default:
      throw error;
  }
}

export async function withTenantDomainError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TenantDomainError) {
      mapTenantDomainError(error);
    }
    throw error;
  }
}
