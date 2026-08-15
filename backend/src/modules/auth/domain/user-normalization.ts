import { AuthDomainError } from './user-invariants.js';
import { normalizeEmail } from './email.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';

/**
 * Nome de pessoa — trim e colapso de espaços internos.
 * Sem slug (não é identificador técnico).
 */
export function normalizePersonName(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new AuthDomainError('USER_NAME_REQUIRED', 'Nome do usuário é obrigatório.');
  }
  return normalized;
}

export function normalizeCreateUserInput(input: CreateUserInput): CreateUserInput {
  return {
    ...input,
    name: normalizePersonName(input.name),
    email: normalizeEmail(input.email),
    tenantId: input.tenantId === undefined ? undefined : input.tenantId,
  };
}

export function normalizeUpdateUserInput(input: UpdateUserInput): UpdateUserInput {
  let name: string | undefined;
  let email: string | undefined;

  if (input.name !== undefined) {
    name = normalizePersonName(input.name);
  }

  if (input.email !== undefined) {
    email = normalizeEmail(input.email);
  }

  if (name === undefined && email === undefined) {
    throw new AuthDomainError(
      'USER_UPDATE_EMPTY',
      'Informe ao menos um campo para atualização do usuário.',
    );
  }

  return {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
  };
}
