import type { ManagedUserStatus } from '../../services/admin/managed-user.types';

export type ManagedUserStatusFilter = 'ALL' | 'ACTIVE' | 'BLOCKED' | 'DISABLED';

export const MANAGED_USER_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  readonly value: ManagedUserStatusFilter;
  readonly label: string;
}> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'BLOCKED', label: 'Bloqueados' },
  { value: 'DISABLED', label: 'Desativados' },
];

export function managedUserStatusLabel(status: ManagedUserStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pendente';
    case 'ACTIVE':
      return 'Ativo';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'DISABLED':
      return 'Desativado';
  }
}

export function formatManagedUserDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function paginationRangeLabel(offset: number, count: number, total: number): string {
  if (total === 0) {
    return '0 de 0';
  }
  const start = offset + 1;
  const end = offset + count;
  return `${start}–${end} de ${total}`;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type ManagedUserFieldErrors = {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
};

export function validateManagedUserCreateFields(input: {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}): ManagedUserFieldErrors {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) {
    errors.name = 'Informe o nome.';
  }
  if (!input.email.trim()) {
    errors.email = 'Informe o e-mail.';
  } else if (!input.email.includes('@')) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

export function validateManagedUserUpdateFields(input: {
  readonly name: string;
  readonly email: string;
}): ManagedUserFieldErrors {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) {
    errors.name = 'Informe o nome.';
  }
  if (!input.email.trim()) {
    errors.email = 'Informe o e-mail.';
  } else if (!input.email.includes('@')) {
    errors.email = 'Informe um e-mail válido.';
  }
  return errors;
}

export function mapManagedUserValidationDetails(
  details: ReadonlyArray<{ field: string; issue: string }> | undefined,
): ManagedUserFieldErrors {
  const errors: Record<string, string> = {};
  for (const detail of details ?? []) {
    if (detail.field === 'name') {
      errors.name = 'Verifique o nome.';
    }
    if (detail.field === 'email') {
      errors.email =
        detail.issue === 'already_exists' ? 'Este e-mail já está em uso.' : 'Verifique o e-mail.';
    }
    if (detail.field === 'password') {
      errors.password = `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`;
    }
    if (detail.field === 'passwordConfirmation') {
      errors.password =
        detail.issue === 'mismatch'
          ? 'A confirmação não coincide com a senha.'
          : 'Confirme a senha.';
    }
  }
  return errors;
}

export type ResetPasswordFieldErrors = {
  readonly password?: string;
  readonly passwordConfirmation?: string;
};

export function validateResetPasswordFields(input: {
  readonly password: string;
  readonly passwordConfirmation: string;
}): ResetPasswordFieldErrors {
  const errors: Record<string, string> = {};
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  if (!input.passwordConfirmation) {
    errors.passwordConfirmation = 'Confirme a senha.';
  } else if (input.passwordConfirmation !== input.password) {
    errors.passwordConfirmation = 'A confirmação não coincide com a senha.';
  }
  return errors;
}
