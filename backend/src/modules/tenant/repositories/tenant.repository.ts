import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  assertCanDisableTenant,
  assertCanReactivateTenant,
  assertTenantStatusDeactivatedAtConsistency,
  buildActiveTenantFields,
  buildDisabledTenantFields,
} from '../domain/tenant-invariants.js';
import {
  normalizeCreateTenantInput,
  normalizeTenantName,
  normalizeUpdateTenantInput,
} from '../domain/tenant-normalization.js';
import { TenantDomainError } from '../domain/tenant-domain-error.js';
import type {
  CreateTenantInput,
  ListTenantsFilter,
  ListTenantsResult,
  TenantRecord,
  UpdateTenantInput,
} from '../domain/types.js';
import { mapTenantRecord } from './mappers.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

function resolveListPagination(filter: ListTenantsFilter): { limit: number; offset: number } {
  const limit =
    filter.limit === undefined
      ? DEFAULT_LIST_LIMIT
      : Math.min(Math.max(filter.limit, 1), MAX_LIST_LIMIT);
  const offset = filter.offset === undefined ? 0 : Math.max(filter.offset, 0);

  return { limit, offset };
}

function isUniqueNameViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export type TenantRepository = {
  create(input: CreateTenantInput): Promise<TenantRecord>;
  findById(id: string): Promise<TenantRecord | null>;
  findByName(name: string): Promise<TenantRecord | null>;
  existsByName(name: string, excludeId?: string): Promise<boolean>;
  list(filter?: ListTenantsFilter): Promise<ListTenantsResult>;
  update(id: string, input: UpdateTenantInput): Promise<TenantRecord>;
  disable(id: string, at?: Date): Promise<TenantRecord>;
  reactivate(id: string): Promise<TenantRecord>;
  delete(id: string): Promise<void>;
};

export function createTenantRepository(prisma: PrismaClient): TenantRepository {
  return {
    async create(input) {
      const normalized = normalizeCreateTenantInput(input);
      const status = input.status ?? 'ACTIVE';
      const deactivatedAt = status === 'DISABLED' ? new Date() : null;
      assertTenantStatusDeactivatedAtConsistency(status, deactivatedAt);

      try {
        const row = await prisma.tenant.create({
          data: {
            name: normalized.name,
            displayName: normalized.displayName,
            status,
            deactivatedAt,
          },
        });

        return mapTenantRecord(row);
      } catch (error) {
        if (isUniqueNameViolation(error)) {
          throw new TenantDomainError(
            'TENANT_NAME_ALREADY_EXISTS',
            'Já existe empresa com este nome interno.',
          );
        }
        throw error;
      }
    },

    async findById(id) {
      const row = await prisma.tenant.findUnique({ where: { id } });
      return row ? mapTenantRecord(row) : null;
    },

    async findByName(name) {
      const normalized = normalizeTenantName(name);
      const row = await prisma.tenant.findUnique({ where: { name: normalized } });
      return row ? mapTenantRecord(row) : null;
    },

    async existsByName(name, excludeId) {
      const normalized = normalizeTenantName(name);
      const row = await prisma.tenant.findFirst({
        where: {
          name: normalized,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      return row !== null;
    },

    async list(filter = {}) {
      const { limit, offset } = resolveListPagination(filter);
      const where =
        filter.status === undefined
          ? {}
          : {
              status: filter.status,
            };

      const [rows, total] = await prisma.$transaction([
        prisma.tenant.findMany({
          where,
          orderBy: [{ displayName: 'asc' }, { name: 'asc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
        }),
        prisma.tenant.count({ where }),
      ]);

      return {
        items: rows.map(mapTenantRecord),
        total,
        limit,
        offset,
      };
    },

    async update(id, input) {
      const normalized = normalizeUpdateTenantInput(input);
      const existing = await prisma.tenant.findUnique({ where: { id } });
      if (!existing) {
        throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
      }

      try {
        const row = await prisma.tenant.update({
          where: { id },
          data: normalized,
        });
        return mapTenantRecord(row);
      } catch (error) {
        if (isUniqueNameViolation(error)) {
          throw new TenantDomainError(
            'TENANT_NAME_ALREADY_EXISTS',
            'Já existe empresa com este nome interno.',
          );
        }
        throw error;
      }
    },

    async disable(id, at = new Date()) {
      const existing = await prisma.tenant.findUnique({ where: { id } });
      if (!existing) {
        throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
      }

      const current = mapTenantRecord(existing);
      assertCanDisableTenant(current);

      const row = await prisma.tenant.update({
        where: { id },
        data: buildDisabledTenantFields(at),
      });

      return mapTenantRecord(row);
    },

    async reactivate(id) {
      const existing = await prisma.tenant.findUnique({ where: { id } });
      if (!existing) {
        throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
      }

      const current = mapTenantRecord(existing);
      assertCanReactivateTenant(current);

      const row = await prisma.tenant.update({
        where: { id },
        data: buildActiveTenantFields(),
      });

      return mapTenantRecord(row);
    },

    async delete(id) {
      const existing = await prisma.tenant.findUnique({ where: { id } });
      if (!existing) {
        throw new TenantDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
      }

      const dependentUsers = await prisma.user.count({
        where: { tenantId: id },
      });
      const dependentIntegrations = await prisma.integration.count({
        where: { tenantId: id },
      });

      if (dependentUsers > 0 || dependentIntegrations > 0) {
        throw new TenantDomainError(
          'TENANT_HAS_DEPENDENTS',
          'Esta empresa possui vínculos e não pode ser excluída permanentemente.',
        );
      }

      try {
        await prisma.tenant.delete({ where: { id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          throw new TenantDomainError(
            'TENANT_HAS_DEPENDENTS',
            'Esta empresa possui vínculos e não pode ser excluída permanentemente.',
          );
        }
        throw error;
      }
    },
  };
}
