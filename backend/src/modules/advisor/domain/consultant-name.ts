import { AdvisorDomainError } from './advisor-domain-error.js';
import { DEFAULT_CONSULTANT_NAME } from './types.js';

export const CONSULTANT_NAME_MAX_LENGTH = 40;

const CONSULTANT_NAME_PATTERN = /^[\p{L}\p{N} .'-]+$/u;

export function resolveConsultantDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? DEFAULT_CONSULTANT_NAME : trimmed;
}

export function normalizeConsultantName(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function assertConsultantName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AdvisorDomainError('CONSULTANT_NAME_REQUIRED', 'Nome do Consultor é obrigatório.');
  }
  if (trimmed.length > CONSULTANT_NAME_MAX_LENGTH) {
    throw new AdvisorDomainError(
      'CONSULTANT_NAME_TOO_LONG',
      `Nome do Consultor deve ter no máximo ${CONSULTANT_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  if (!CONSULTANT_NAME_PATTERN.test(trimmed) || /[<>]/.test(trimmed)) {
    throw new AdvisorDomainError(
      'CONSULTANT_NAME_INVALID',
      'Nome do Consultor deve conter apenas letras, números, espaços, ponto, hífen ou apóstrofo.',
    );
  }
  return trimmed;
}
