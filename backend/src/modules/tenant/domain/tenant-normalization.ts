import { TenantDomainError } from './tenant-domain-error.js';

/**
 * Identificação interna slug-like (docs/13 §6.1).
 * Trim, lowercase, espaços/colapsos viram hífen, caracteres inválidos removidos.
 */
export function normalizeTenantName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new TenantDomainError('TENANT_NAME_REQUIRED', 'Nome interno da empresa é obrigatório.');
  }

  const slug = trimmed
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (slug.length === 0) {
    throw new TenantDomainError(
      'TENANT_NAME_INVALID',
      'Nome interno da empresa deve conter caracteres válidos após normalização.',
    );
  }

  return slug;
}

/** Nome de exibição — trim e colapso de espaços internos (PRD TENANT-001). */
export function normalizeDisplayName(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new TenantDomainError(
      'TENANT_DISPLAY_NAME_REQUIRED',
      'Nome de exibição da empresa é obrigatório.',
    );
  }

  return normalized;
}

export function normalizeCreateTenantInput(input: { name: string; displayName: string }): {
  name: string;
  displayName: string;
} {
  return {
    name: normalizeTenantName(input.name),
    displayName: normalizeDisplayName(input.displayName),
  };
}

export function normalizeUpdateTenantInput(input: { name?: string; displayName?: string }): {
  name?: string;
  displayName?: string;
} {
  const normalized: { name?: string; displayName?: string } = {};

  if (input.name !== undefined) {
    normalized.name = normalizeTenantName(input.name);
  }

  if (input.displayName !== undefined) {
    normalized.displayName = normalizeDisplayName(input.displayName);
  }

  if (normalized.name === undefined && normalized.displayName === undefined) {
    throw new TenantDomainError(
      'TENANT_UPDATE_EMPTY',
      'Informe ao menos um campo para atualização da empresa.',
    );
  }

  return normalized;
}
