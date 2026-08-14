import type { CompanyStatus } from '../../services/admin/companies.types';

export type CompanyStatusFilter = 'ALL' | CompanyStatus;

export const COMPANY_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  readonly value: CompanyStatusFilter;
  readonly label: string;
}> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ACTIVE', label: 'Ativas' },
  { value: 'DISABLED', label: 'Desativadas' },
];

export function companyStatusLabel(status: CompanyStatus): string {
  return status === 'ACTIVE' ? 'Ativa' : 'Desativada';
}

export function formatCompanyDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Pré-visualização amigável do identificador — backend permanece autoridade. */
export function previewCompanyIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function paginationRangeLabel(offset: number, count: number, total: number): string {
  if (total === 0) {
    return '0 de 0';
  }
  const start = offset + 1;
  const end = offset + count;
  return `${start}–${end} de ${total}`;
}

export type CompanyFieldErrors = {
  readonly displayName?: string;
  readonly name?: string;
  readonly form?: string;
};

export function validateCompanyFields(input: {
  readonly displayName: string;
  readonly name: string;
}): CompanyFieldErrors {
  const errors: Record<string, string> = {};
  if (!input.displayName.trim()) {
    errors.displayName = 'Informe o nome da empresa.';
  }
  if (!input.name.trim()) {
    errors.name = 'Informe o identificador.';
  }
  return errors;
}

export function mapCompanyValidationDetails(
  details: ReadonlyArray<{ field: string; issue: string }> | undefined,
): CompanyFieldErrors {
  const errors: Record<string, string> = {};
  for (const detail of details ?? []) {
    if (detail.field === 'displayName') {
      errors.displayName = 'Verifique o nome da empresa.';
    }
    if (detail.field === 'name') {
      errors.name =
        detail.issue === 'already_exists'
          ? 'Este identificador já está em uso.'
          : 'Verifique o identificador.';
    }
  }
  return errors;
}
