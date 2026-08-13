import { ValidationError } from '../../../shared/errors/application-error.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../domain/password-policy.js';

export type LoginRequestBody = {
  email: string;
  password: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validação de entrada HTTP sem biblioteca adicional (stack ainda avalia validador).
 */
export function parseLoginRequestBody(body: unknown): LoginRequestBody {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Payload de login inválido.', {
      details: [{ field: 'body', issue: 'must_be_object' }],
      httpStatus: 400,
    });
  }

  const record = body as Record<string, unknown>;
  const details: Array<{ field: string; issue: string }> = [];

  if (typeof record.email !== 'string') {
    details.push({ field: 'email', issue: 'required_string' });
  } else if (record.email.trim().length === 0) {
    details.push({ field: 'email', issue: 'required' });
  } else if (!EMAIL_PATTERN.test(record.email.trim())) {
    details.push({ field: 'email', issue: 'invalid_format' });
  }

  if (typeof record.password !== 'string') {
    details.push({ field: 'password', issue: 'required_string' });
  } else if (record.password.length < PASSWORD_MIN_LENGTH) {
    details.push({ field: 'password', issue: 'min_length' });
  } else if (record.password.length > PASSWORD_MAX_LENGTH) {
    details.push({ field: 'password', issue: 'max_length' });
  }

  if (details.length > 0) {
    throw new ValidationError('Dados de login inválidos.', { details });
  }

  return {
    email: record.email as string,
    password: record.password as string,
  };
}
