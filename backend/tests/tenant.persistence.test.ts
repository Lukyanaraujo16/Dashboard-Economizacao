import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  assertCanDisableTenant,
  assertCanReactivateTenant,
  assertTenantStatusDeactivatedAtConsistency,
  canRoleUseTenantOperationalContext,
  createTenantRepository,
  normalizeTenantName,
  TenantDomainError,
} from '../src/modules/tenant/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

describe('domínio tenant — normalização e invariantes', () => {
  it('normaliza name slug-like e displayName com trim', () => {
    expect(normalizeTenantName('  Acme Corp  ')).toBe('acme-corp');
    expect(normalizeTenantName('Empresa_A')).toBe('empresa-a');
  });

  it('rejeita name e displayName vazios', () => {
    expect(() => normalizeTenantName('   ')).toThrow(TenantDomainError);
    expect(() => normalizeTenantName('!!!')).toThrow(TenantDomainError);
  });

  it('enforce ACTIVE/DISABLED ↔ deactivatedAt', () => {
    expect(() => assertTenantStatusDeactivatedAtConsistency('ACTIVE', new Date())).toThrow(
      TenantDomainError,
    );
    expect(() => assertTenantStatusDeactivatedAtConsistency('DISABLED', null)).toThrow(
      TenantDomainError,
    );
    expect(() => assertTenantStatusDeactivatedAtConsistency('ACTIVE', null)).not.toThrow();
    expect(() => assertTenantStatusDeactivatedAtConsistency('DISABLED', new Date())).not.toThrow();
  });

  it('TENANT-003 — USER exige tenant ACTIVE; ADMIN/SUPER_ADMIN não', () => {
    const activeTenant = {
      id: 'id',
      name: 'acme',
      displayName: 'Acme',
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      deactivatedAt: null,
      contaAzul: null,
    };
    const disabledTenant = {
      ...activeTenant,
      status: 'DISABLED' as const,
      deactivatedAt: new Date(),
    };

    expect(canRoleUseTenantOperationalContext('USER', activeTenant)).toBe(true);
    expect(canRoleUseTenantOperationalContext('USER', disabledTenant)).toBe(false);
    expect(canRoleUseTenantOperationalContext('USER', null)).toBe(false);
    expect(canRoleUseTenantOperationalContext('ADMIN', null)).toBe(true);
    expect(canRoleUseTenantOperationalContext('SUPER_ADMIN', null)).toBe(true);
  });
});

describe('persistência tenant — TenantRepository', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória para testes de persistência.');
    }
  });

  afterEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('create persiste tenant ACTIVE com deactivatedAt null', async () => {
    const tenant = await tenants.create({
      name: 'Acme Corp',
      displayName: '  Acme Ltda  ',
    });

    expect(tenant.name).toBe('acme-corp');
    expect(tenant.displayName).toBe('Acme Ltda');
    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.deactivatedAt).toBeNull();
  });

  it('findById retorna tenant existente', async () => {
    const created = await tenants.create({ name: 'find-me', displayName: 'Find Me' });
    const found = await tenants.findById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.contaAzul).toBeNull();
  });

  it('list inclui resumo Conta Azul quando a integração existe', async () => {
    const tenant = await tenants.create({ name: 'with-ca', displayName: 'With CA' });
    const syncedAt = new Date('2026-08-25T12:15:00.000Z');
    await prisma.integration.create({
      data: {
        tenantId: tenant.id,
        provider: 'CONTA_AZUL',
        status: 'CONNECTED',
        lastSuccessfulSyncAt: syncedAt,
      },
    });

    const listed = await tenants.list();
    expect(listed.items[0]?.contaAzul).toEqual({
      status: 'CONNECTED',
      lastSuccessfulSyncAt: syncedAt,
    });
    expect((await tenants.create({ name: 'plain', displayName: 'Plain' })).contaAzul).toBeNull();
  });

  it('list ordena deterministicamente e filtra por status com paginação', async () => {
    const alpha = await tenants.create({ name: 'alpha', displayName: 'Alpha' });
    const beta = await tenants.create({ name: 'beta', displayName: 'Beta' });
    await tenants.disable(beta.id);

    const all = await tenants.list();
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.id)).toEqual([alpha.id, beta.id]);

    const activeOnly = await tenants.list({ status: 'ACTIVE' });
    expect(activeOnly.total).toBe(1);
    expect(activeOnly.items[0]?.id).toBe(alpha.id);

    const paged = await tenants.list({ limit: 1, offset: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.limit).toBe(1);
    expect(paged.offset).toBe(1);
  });

  it('update altera name/displayName normalizados', async () => {
    const tenant = await tenants.create({ name: 'old-name', displayName: 'Old' });
    const updated = await tenants.update(tenant.id, {
      name: ' New Name ',
      displayName: '  New Display  ',
    });

    expect(updated.name).toBe('new-name');
    expect(updated.displayName).toBe('New Display');
  });

  it('disable e reactivate aplicam transições determinísticas', async () => {
    const tenant = await tenants.create({ name: 'toggle', displayName: 'Toggle' });
    const disabled = await tenants.disable(tenant.id);
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.deactivatedAt).toBeInstanceOf(Date);

    expect(() => assertCanDisableTenant(disabled)).toThrow(TenantDomainError);

    const reactivated = await tenants.reactivate(tenant.id);
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.deactivatedAt).toBeNull();
    expect(() => assertCanReactivateTenant(reactivated)).toThrow(TenantDomainError);
  });

  it('enforce unicidade de name', async () => {
    await tenants.create({ name: 'unique-co', displayName: 'Unique' });

    await expect(tenants.create({ name: 'Unique Co', displayName: 'Outra' })).rejects.toSatisfy(
      (error: unknown) => {
        if (error instanceof TenantDomainError) {
          return error.code === 'TENANT_NAME_ALREADY_EXISTS';
        }
        return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      },
    );
  });

  it('existsByName e findByName respeitam normalização', async () => {
    const tenant = await tenants.create({ name: 'exists-co', displayName: 'Exists' });
    expect(await tenants.existsByName('Exists Co')).toBe(true);
    expect(await tenants.existsByName('exists-co', tenant.id)).toBe(false);
    expect((await tenants.findByName('EXISTS CO'))?.id).toBe(tenant.id);
  });
});
