import { NotFoundError, ValidationError } from '../../../shared/errors/application-error.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';

export function mapBrandingDomainError(error: BrandingDomainError): never {
  switch (error.code) {
    case 'TENANT_NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'BRANDING_INVALID_COLOR_TOKEN':
    case 'BRANDING_INVALID_COLOR_FORMAT':
    case 'BRANDING_INVALID_COLOR_OVERRIDES':
      throw new ValidationError(error.message);
    case 'BRANDING_FILE_NOT_FOUND':
      throw new NotFoundError(error.message);
    default:
      throw error;
  }
}

export async function withBrandingDomainError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BrandingDomainError) {
      mapBrandingDomainError(error);
    }
    throw error;
  }
}
