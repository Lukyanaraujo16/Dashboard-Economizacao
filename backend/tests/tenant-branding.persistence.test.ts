import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  BrandingDomainError,
  createTenantBrandingRepository,
  parseBrandColorOverrides,
} from '../src/modules/branding/index.js';
import { createTenantRepository } from '../src/modules/tenant/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

describe('domínio branding — validação de cores', () => {
  it('aceita tokens allowlisted com hex #RRGGBB', () => {
    expect(parseBrandColorOverrides({ primary: '#141452' }, 'lightColors')).toEqual({
      primary: '#141452',
    });
    expect(parseBrandColorOverrides({ onPrimary: '#ffffff' }, 'lightColors')).toEqual({
      onPrimary: '#FFFFFF',
    });
    expect(parseBrandColorOverrides({ secondary: '#2D2D74' }, 'lightColors')).toEqual({
      secondary: '#2D2D74',
    });
    expect(parseBrandColorOverrides({ accent: '#F2C200' }, 'lightColors')).toEqual({
      accent: '#F2C200',
    });
  });

  it('rejeita tokens protegidos e chaves desconhecidas', () => {
    for (const key of ['danger', 'success', 'warning', 'info', 'background', 'textPrimary']) {
      expect(() => parseBrandColorOverrides({ [key]: '#141452' }, 'lightColors')).toThrow(
        BrandingDomainError,
      );
    }
    expect(() => parseBrandColorOverrides({ unknown: '#141452' }, 'lightColors')).toThrow(
      BrandingDomainError,
    );
  });

  it('rejeita formatos inválidos de cor', () => {
    for (const value of ['rgb(0,0,0)', 'red', '#FFF', '#12345', 'var(--color-primary)']) {
      expect(() => parseBrandColorOverrides({ primary: value }, 'lightColors')).toThrow(
        BrandingDomainError,
      );
    }
  });

  it('objeto vazio resulta em null', () => {
    expect(parseBrandColorOverrides({}, 'lightColors')).toBeNull();
  });
});

describe('persistência branding — TenantBrandingRepository', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const branding = createTenantBrandingRepository(prisma);

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

  it('tenant pode existir sem branding', async () => {
    const tenant = await tenants.create({ name: 'no-brand', displayName: 'No Brand' });
    expect(await branding.findByTenantId(tenant.id)).toBeNull();
  });

  it('cria branding via upsert para tenant existente', async () => {
    const tenant = await tenants.create({ name: 'brand-co', displayName: 'Brand Co' });
    const record = await branding.upsert(tenant.id, {
      lightColors: { primary: '#1D4ED8' },
    });

    expect(record).not.toBeNull();
    expect(record?.tenantId).toBe(tenant.id);
    expect(record?.lightColors).toEqual({ primary: '#1D4ED8' });
    expect(record?.darkColors).toBeNull();
  });

  it('tenant possui no máximo um branding (unicidade de tenantId)', async () => {
    const tenant = await tenants.create({ name: 'unique-brand', displayName: 'Unique Brand' });
    await branding.upsert(tenant.id, { lightColors: { primary: '#111111' } });
    await branding.upsert(tenant.id, { darkColors: { primary: '#222222' } });

    const rows = await prisma.tenantBranding.findMany({ where: { tenantId: tenant.id } });
    expect(rows).toHaveLength(1);
  });

  it('findByTenantId retorna branding do tenant', async () => {
    const tenant = await tenants.create({ name: 'find-brand', displayName: 'Find Brand' });
    await branding.upsert(tenant.id, { darkColors: { accent: '#ABCDEF' } });

    const found = await branding.findByTenantId(tenant.id);
    expect(found?.lightColors).toBeNull();
    expect(found?.darkColors).toEqual({ accent: '#ABCDEF' });
  });

  it('upsert parcial preserva tokens existentes no mesmo scheme', async () => {
    const tenant = await tenants.create({ name: 'partial', displayName: 'Partial' });
    await branding.upsert(tenant.id, {
      lightColors: { primary: '#111111', secondary: '#222222' },
    });

    const updated = await branding.upsert(tenant.id, {
      lightColors: { accent: '#333333' },
    });

    expect(updated?.lightColors).toEqual({
      primary: '#111111',
      secondary: '#222222',
      accent: '#333333',
    });
  });

  it('light e dark permanecem independentes', async () => {
    const tenant = await tenants.create({ name: 'schemes', displayName: 'Schemes' });
    const record = await branding.upsert(tenant.id, {
      lightColors: { primary: '#111111' },
      darkColors: { primary: '#EEEEEE' },
    });

    expect(record?.lightColors).toEqual({ primary: '#111111' });
    expect(record?.darkColors).toEqual({ primary: '#EEEEEE' });
  });

  it('delete/reset remove branding sem remover tenant', async () => {
    const tenant = await tenants.create({ name: 'reset-brand', displayName: 'Reset Brand' });
    await branding.upsert(tenant.id, { lightColors: { primary: '#111111' } });

    await branding.deleteByTenantId(tenant.id);

    expect(await branding.findByTenantId(tenant.id)).toBeNull();
    expect(await tenants.findById(tenant.id)).not.toBeNull();
  });

  it('branding de tenant A não aparece em tenant B', async () => {
    const tenantA = await tenants.create({ name: 'tenant-a', displayName: 'Tenant A' });
    const tenantB = await tenants.create({ name: 'tenant-b', displayName: 'Tenant B' });

    await branding.upsert(tenantA.id, { lightColors: { primary: '#AAAAAA' } });

    expect(await branding.findByTenantId(tenantB.id)).toBeNull();
    const foundA = await branding.findByTenantId(tenantA.id);
    expect(foundA?.tenantId).toBe(tenantA.id);
  });

  it('exclusão de tenant sem dependências remove branding associado (cascade)', async () => {
    const tenant = await tenants.create({ name: 'delete-tenant', displayName: 'Delete Tenant' });
    await branding.upsert(tenant.id, { lightColors: { primary: '#111111' } });

    await tenants.delete(tenant.id);

    expect(await prisma.tenantBranding.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('tenant inexistente não produz branding órfão no upsert', async () => {
    await expect(
      branding.upsert('00000000-0000-4000-8000-000000000000', {
        lightColors: { primary: '#111111' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof BrandingDomainError && error.code === 'TENANT_NOT_FOUND';
    });
  });

  it('tenant inexistente no delete produz TENANT_NOT_FOUND', async () => {
    await expect(
      branding.deleteByTenantId('00000000-0000-4000-8000-000000000000'),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof BrandingDomainError && error.code === 'TENANT_NOT_FOUND';
    });
  });

  it('defaults da plataforma não são persistidos automaticamente', async () => {
    const tenant = await tenants.create({ name: 'no-defaults', displayName: 'No Defaults' });
    const record = await branding.upsert(tenant.id, {
      lightColors: { primary: '#123456' },
    });

    expect(record?.lightColors).toEqual({ primary: '#123456' });
    expect(record?.lightColors).not.toHaveProperty('secondary');
    expect(record?.lightColors).not.toHaveProperty('accent');
    expect(record?.darkColors).toBeNull();
  });

  it('upsert vazio remove registro existente em vez de persistir defaults', async () => {
    const tenant = await tenants.create({ name: 'clear-brand', displayName: 'Clear Brand' });
    await branding.upsert(tenant.id, { lightColors: { primary: '#111111' } });

    const cleared = await branding.upsert(tenant.id, {
      lightColors: null,
      darkColors: null,
    });

    expect(cleared).toBeNull();
    expect(await branding.findByTenantId(tenant.id)).toBeNull();
  });
});
