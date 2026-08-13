import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import type { PasswordHasher } from '../crypto/password-hasher.js';
import { verifyWithTimingProtection } from '../crypto/timing-dummy-hash.js';
import { isTemporaryLockoutActive, isTemporaryLockoutExpired } from '../domain/auth-lockout.js';
import type { AuthenticatedPrincipal } from '../domain/authentication-context.js';
import { normalizeEmail } from '../domain/email.js';
import type { UserCredentialRepository } from '../repositories/user-credential.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';

export type LoginInput = {
  readonly email: string;
  readonly password: string;
};

export type LoginService = {
  authenticate(input: LoginInput): Promise<AuthenticatedPrincipal>;
};

export type LoginServiceDependencies = {
  readonly users: UserRepository;
  readonly credentials: UserCredentialRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock?: () => Date;
};

/**
 * Caso de uso de login: credencial, status, lockout.
 * Criação de sessão Redis permanece na camada HTTP.
 */
export function createLoginService(deps: LoginServiceDependencies): LoginService {
  const now = deps.clock ?? (() => new Date());

  async function rejectGeneric(password: string, passwordHash: string | null): Promise<never> {
    await verifyWithTimingProtection(deps.passwordHasher, passwordHash, password);
    throw new UnauthenticatedError();
  }

  return {
    async authenticate(input) {
      const email = normalizeEmail(input.email);
      const { password } = input;
      const at = now();

      const user = await deps.users.findByEmail(email);
      if (!user) {
        return rejectGeneric(password, null);
      }

      const credential = await deps.credentials.findByUserId(user.id);
      const passwordHash = credential?.passwordHash ?? null;

      if (user.status === 'PENDING' || user.status === 'DISABLED') {
        return rejectGeneric(password, passwordHash);
      }

      let current = user;

      if (current.status === 'BLOCKED') {
        if (isTemporaryLockoutActive(current.lockedUntil, at)) {
          return rejectGeneric(password, passwordHash);
        }

        if (current.lockedUntil === null) {
          // Bloqueio administrativo: não desbloqueia automaticamente.
          return rejectGeneric(password, passwordHash);
        }

        if (isTemporaryLockoutExpired(current.lockedUntil, at)) {
          current = await deps.users.recoverExpiredTemporaryLockout(current.id, at);
        }
      }

      if (current.status !== 'ACTIVE') {
        return rejectGeneric(password, passwordHash);
      }

      if (!passwordHash) {
        return rejectGeneric(password, null);
      }

      const matches = await deps.passwordHasher.verify(passwordHash, password);
      if (!matches) {
        await deps.users.registerFailedPasswordAttempt(current.id, at);
        throw new UnauthenticatedError();
      }

      return {
        userId: current.id,
        tenantId: current.tenantId,
        role: current.role,
      };
    },
  };
}
