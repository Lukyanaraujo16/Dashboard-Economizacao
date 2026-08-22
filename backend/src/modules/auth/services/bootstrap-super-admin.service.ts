import { isValidEmail, normalizeEmail } from '../domain/email.js';
import { isPasswordLengthValid } from '../domain/password-policy.js';
import { AuthDomainError } from '../domain/user-invariants.js';
import { normalizePersonName } from '../domain/user-normalization.js';
import type { PasswordHasher } from '../crypto/password-hasher.js';
import type { UserRecord } from '../domain/types.js';
import type { UserCredentialRepository } from '../repositories/user-credential.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';

export type BootstrapSuperAdminInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type BootstrapSuperAdminResult =
  | { readonly status: 'created'; readonly user: UserRecord }
  | { readonly status: 'already_bootstrapped'; readonly user: UserRecord };

export class BootstrapSuperAdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BootstrapSuperAdminError';
    this.code = code;
  }
}

export function formatBootstrapSuperAdminMessage(result: BootstrapSuperAdminResult): string {
  if (result.status === 'already_bootstrapped') {
    return `A instalação já possui SUPER_ADMIN (${result.user.email}).`;
  }
  return `SUPER_ADMIN criado: ${result.user.email}`;
}

/**
 * Cria o primeiro SUPER_ADMIN da instalação (operador técnico da plataforma).
 * Idempotente apenas em relação a SUPER_ADMIN: a existência de ADMIN não bloqueia.
 */
export function createBootstrapSuperAdminService(deps: {
  readonly users: UserRepository;
  readonly credentials: UserCredentialRepository;
  readonly passwordHasher: PasswordHasher;
}) {
  return {
    async bootstrap(input: BootstrapSuperAdminInput): Promise<BootstrapSuperAdminResult> {
      let name: string;
      try {
        name = normalizePersonName(input.name);
      } catch (error) {
        if (error instanceof AuthDomainError) {
          throw new BootstrapSuperAdminError('BOOTSTRAP_NAME_REQUIRED', error.message);
        }
        throw error;
      }

      if (!isValidEmail(input.email)) {
        throw new BootstrapSuperAdminError('BOOTSTRAP_EMAIL_INVALID', 'E-mail inválido.');
      }
      const email = normalizeEmail(input.email);

      if (!isPasswordLengthValid(input.password)) {
        throw new BootstrapSuperAdminError(
          'BOOTSTRAP_PASSWORD_INVALID',
          'A senha deve ter entre 10 e 128 caracteres.',
        );
      }

      const existing = await deps.users.list({
        roles: ['SUPER_ADMIN'],
        limit: 1,
      });
      if (existing.total > 0 && existing.items[0]) {
        return { status: 'already_bootstrapped', user: existing.items[0] };
      }

      try {
        const user = await deps.users.create({
          name,
          email,
          role: 'SUPER_ADMIN',
          tenantId: null,
          status: 'ACTIVE',
        });
        const passwordHash = await deps.passwordHasher.hash(input.password);
        await deps.credentials.create({ userId: user.id, passwordHash });
        const configured = await deps.users.setPasswordConfiguredAt(user.id);
        return { status: 'created', user: configured };
      } catch (error) {
        if (error instanceof AuthDomainError) {
          throw new BootstrapSuperAdminError(error.code, error.message);
        }
        throw error;
      }
    },
  };
}
