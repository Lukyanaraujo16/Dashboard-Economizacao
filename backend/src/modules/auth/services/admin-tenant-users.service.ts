import { NotFoundError } from '../../../shared/errors/application-error.js';
import type { PasswordHasher } from '../crypto/password-hasher.js';
import type { ListUsersResult, UpdateUserInput, UserRecord } from '../domain/types.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { UserCredentialRepository } from '../repositories/user-credential.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { withAuthDomainError } from './map-auth-domain-error.js';

export type CreateTenantUserInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type ListTenantUsersFilter = {
  readonly status?: UserRecord['status'];
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Gestão de Usuários da Empresa (somente role USER no tenant da rota).
 * Tenant DISABLED permanece administrável (cadastral); login segue TENANT-003.
 */
export function createAdminTenantUsersService(deps: {
  readonly users: UserRepository;
  readonly credentials: UserCredentialRepository;
  readonly tenants: TenantRepository;
  readonly passwordHasher: PasswordHasher;
}) {
  async function requireTenant(tenantId: string) {
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Empresa não encontrada.');
    }
    return tenant;
  }

  async function requireTenantUser(tenantId: string, userId: string): Promise<UserRecord> {
    const user = await deps.users.findById(userId);
    if (!user || user.role !== 'USER' || user.tenantId !== tenantId) {
      throw new NotFoundError('Usuário não encontrado.');
    }
    return user;
  }

  return {
    async list(tenantId: string, filter: ListTenantUsersFilter = {}): Promise<ListUsersResult> {
      await requireTenant(tenantId);
      return deps.users.list({
        role: 'USER',
        tenantId,
        status: filter.status,
        limit: filter.limit,
        offset: filter.offset,
      });
    },

    async getById(tenantId: string, userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        return requireTenantUser(tenantId, userId);
      });
    },

    async create(tenantId: string, input: CreateTenantUserInput): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        const user = await deps.users.create({
          name: input.name,
          email: input.email,
          role: 'USER',
          tenantId,
          status: 'ACTIVE',
        });
        const passwordHash = await deps.passwordHasher.hash(input.password);
        await deps.credentials.create({ userId: user.id, passwordHash });
        return deps.users.setPasswordConfiguredAt(user.id);
      });
    },

    async update(tenantId: string, userId: string, input: UpdateUserInput): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        await requireTenantUser(tenantId, userId);
        return deps.users.update(userId, input);
      });
    },

    async block(tenantId: string, userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        await requireTenantUser(tenantId, userId);
        return deps.users.block(userId);
      });
    },

    async unblock(tenantId: string, userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        await requireTenantUser(tenantId, userId);
        return deps.users.unblock(userId);
      });
    },

    async disable(tenantId: string, userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        await requireTenantUser(tenantId, userId);
        return deps.users.disable(userId);
      });
    },

    async enable(tenantId: string, userId: string): Promise<UserRecord> {
      return withAuthDomainError(async () => {
        await requireTenant(tenantId);
        await requireTenantUser(tenantId, userId);
        return deps.users.enable(userId);
      });
    },
  };
}

export type AdminTenantUsersService = ReturnType<typeof createAdminTenantUsersService>;
