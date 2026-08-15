import { NotFoundError } from '../../../shared/errors/application-error.js';
import type { PasswordHasher } from '../crypto/password-hasher.js';
import type { ListUsersResult, UpdateUserInput, UserRecord } from '../domain/types.js';
import type { UserCredentialRepository } from '../repositories/user-credential.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { withAuthDomainError } from './map-auth-domain-error.js';

export type CreateAdministratorInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type ListAdministratorsFilter = {
  readonly status?: UserRecord['status'];
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Gestão de Administradores da Plataforma (somente role ADMIN).
 * SUPER_ADMIN nunca aparece nesta superfície (docs/16, ADR-047).
 *
 * Atomicidade do último ADMIN: `UserRepository.block/disable` travam linhas
 * `ADMIN`+`ACTIVE` com `SELECT … FOR UPDATE` ordenado antes de mutar.
 */
export function createAdminAdministratorsService(deps: {
  readonly users: UserRepository;
  readonly credentials: UserCredentialRepository;
  readonly passwordHasher: PasswordHasher;
}) {
  async function requireAdministrator(userId: string): Promise<UserRecord> {
    const user = await deps.users.findById(userId);
    if (!user || user.role !== 'ADMIN') {
      throw new NotFoundError('Administrador não encontrado.');
    }
    return user;
  }

  return {
    async list(filter: ListAdministratorsFilter = {}): Promise<ListUsersResult> {
      return deps.users.list({
        role: 'ADMIN',
        status: filter.status,
        limit: filter.limit,
        offset: filter.offset,
      });
    },

    async getById(userId: string): Promise<UserRecord> {
      return withAuthDomainError(() => requireAdministrator(userId));
    },

    async create(input: CreateAdministratorInput): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        const user = await deps.users.create({
          name: input.name,
          email: input.email,
          role: 'ADMIN',
          tenantId: null,
          status: 'ACTIVE',
        });
        const passwordHash = await deps.passwordHasher.hash(input.password);
        await deps.credentials.create({ userId: user.id, passwordHash });
        return deps.users.setPasswordConfiguredAt(user.id);
      });
    },

    async update(userId: string, input: UpdateUserInput): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireAdministrator(userId);
        return deps.users.update(userId, input);
      });
    },

    async block(userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireAdministrator(userId);
        return deps.users.block(userId);
      });
    },

    async unblock(userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireAdministrator(userId);
        return deps.users.unblock(userId);
      });
    },

    async disable(userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireAdministrator(userId);
        return deps.users.disable(userId);
      });
    },

    async enable(userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireAdministrator(userId);
        return deps.users.enable(userId);
      });
    },
  };
}

export type AdminAdministratorsService = ReturnType<typeof createAdminAdministratorsService>;
