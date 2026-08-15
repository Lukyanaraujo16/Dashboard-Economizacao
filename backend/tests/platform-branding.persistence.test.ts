import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  BrandingDomainError,
  createPlatformBrandingRepository,
  createStoredFileRepository,
  createTenantBrandingRepository,
  normalizePlatformBrandName,
  PLATFORM_BRANDING_SINGLETON_KEY,
  parseBrandColorOverrides,
} from '../src/modules/branding/index.js';
import { createTenantRepository } from '../src/modules/tenant/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

describe('domínio platform branding — name', () => {
  it('normaliza trim e colapso de espaços', () => {
    expect(normalizePlatformBrandName('  Economização  ')).toBe('Economização');
    expect(normalizePlatformBrandName('Dash   Board')).toBe('Dash Board');
  });

  it('rejeita nome vazio', () => {
    expect(() => normalizePlatformBrandName('')).toThrow(BrandingDomainError);
    expect(() => normalizePlatformBrandName('   ')).toThrow(BrandingDomainError);
  });
});

describe('persistência branding — PlatformBrandingRepository (1.5B)', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const tenantBranding = createTenantBrandingRepository(prisma);
  const platformBranding = createPlatformBrandingRepository(prisma);
  const files = createStoredFileRepository(prisma);

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

  it('sem registro → get() retorna null (fallback Theme Default)', async () => {
    expect(await platformBranding.get()).toBeNull();
    expect(await prisma.platformBranding.count()).toBe(0);
  });

  it('cria branding da plataforma via upsert', async () => {
    const record = await platformBranding.upsert({
      name: 'Economização',
      lightColors: { primary: '#141452' },
    });

    expect(record.name).toBe('Economização');
    expect(record.lightColors).toEqual({ primary: '#141452' });
    expect(record.darkColors).toBeNull();
    expect(record.logoFileId).toBeNull();
    expect(record.faviconFileId).toBeNull();
  });

  it('preserva singleton (unique singleton_key)', async () => {
    await platformBranding.upsert({ name: 'Economização' });
    await platformBranding.upsert({ name: 'Economização Plataforma' });

    const rows = await prisma.platformBranding.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.singletonKey).toBe(PLATFORM_BRANDING_SINGLETON_KEY);
    expect((await platformBranding.get())?.name).toBe('Economização Plataforma');
  });

  it('atualiza name independentemente', async () => {
    await platformBranding.upsert({
      name: 'Economização',
      lightColors: { primary: '#111111' },
    });

    const updated = await platformBranding.upsert({ name: '  Nova   Marca  ' });
    expect(updated.name).toBe('Nova Marca');
    expect(updated.lightColors).toEqual({ primary: '#111111' });
  });

  it('light parcial faz merge; dark permanece independente', async () => {
    await platformBranding.upsert({
      name: 'Economização',
      lightColors: { primary: '#111111', secondary: '#222222' },
      darkColors: { primary: '#EEEEEE' },
    });

    const updated = await platformBranding.upsert({
      lightColors: { accent: '#333333' },
    });

    expect(updated.lightColors).toEqual({
      primary: '#111111',
      secondary: '#222222',
      accent: '#333333',
    });
    expect(updated.darkColors).toEqual({ primary: '#EEEEEE' });
  });

  it('aceita primary, onPrimary, secondary e accent', async () => {
    const record = await platformBranding.upsert({
      name: 'Economização',
      lightColors: {
        primary: '#141452',
        onPrimary: '#ffffff',
        secondary: '#2D2D74',
        accent: '#F2C200',
      },
    });

    expect(record.lightColors).toEqual({
      primary: '#141452',
      onPrimary: '#FFFFFF',
      secondary: '#2D2D74',
      accent: '#F2C200',
    });
  });

  it('rejeita token protegido, chave desconhecida e hex inválido', async () => {
    await platformBranding.upsert({ name: 'Economização' });

    await expect(
      platformBranding.upsert({ lightColors: { danger: '#FF0000' } as never }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BrandingDomainError && error.code === 'BRANDING_INVALID_COLOR_TOKEN',
    );

    await expect(
      platformBranding.upsert({ lightColors: { unknown: '#141452' } as never }),
    ).rejects.toBeInstanceOf(BrandingDomainError);

    await expect(
      platformBranding.upsert({ lightColors: { primary: 'rgb(0,0,0)' } }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BrandingDomainError && error.code === 'BRANDING_INVALID_COLOR_FORMAT',
    );

    expect(parseBrandColorOverrides({ primary: '#141452' }, 'lightColors')).toEqual({
      primary: '#141452',
    });
  });

  it('primeira criação sem name falha; defaults não são materializados', async () => {
    await expect(
      platformBranding.upsert({ lightColors: { primary: '#123456' } }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BrandingDomainError && error.code === 'PLATFORM_BRANDING_INVALID_NAME',
    );

    const record = await platformBranding.upsert({
      name: 'Economização',
      lightColors: { primary: '#123456' },
    });
    expect(record.lightColors).toEqual({ primary: '#123456' });
    expect(record.lightColors).not.toHaveProperty('secondary');
    expect(record.darkColors).toBeNull();
  });

  it('reset remove PlatformBranding e não afeta TenantBranding', async () => {
    const tenant = await tenants.create({ name: 'keep-tenant', displayName: 'Keep Tenant' });
    await tenantBranding.upsert(tenant.id, { lightColors: { primary: '#AAAAAA' } });
    await platformBranding.upsert({ name: 'Economização', lightColors: { primary: '#111111' } });

    await platformBranding.reset();

    expect(await platformBranding.get()).toBeNull();
    expect(await tenantBranding.findByTenantId(tenant.id)).not.toBeNull();
    expect(await tenants.findById(tenant.id)).not.toBeNull();
  });

  it('upsert de cores não altera logo/favicon anexados', async () => {
    await platformBranding.upsert({ name: 'Economização' });
    const logo = await files.create({
      fileType: 'PLATFORM_LOGO',
      storageKey: 'platform/branding/logo-a.png',
      mimeType: 'image/png',
      size: 12,
      checksum: 'abc',
    });
    await platformBranding.attachLogo(logo.id);

    const updated = await platformBranding.upsert({
      lightColors: { primary: '#ABCDEF' },
    });

    expect(updated.logoFileId).toBe(logo.id);
    expect(updated.lightColors).toEqual({ primary: '#ABCDEF' });
  });

  it('aceita attach de PLATFORM_LOGO/FAVICON globais e rejeita arquivo de tenant', async () => {
    await platformBranding.upsert({ name: 'Economização' });
    const tenant = await tenants.create({ name: 'file-owner', displayName: 'File Owner' });
    const tenantLogo = await files.create({
      tenantId: tenant.id,
      fileType: 'TENANT_LOGO',
      storageKey: `tenants/${tenant.id}/branding/logo.png`,
      mimeType: 'image/png',
      size: 10,
      checksum: 'tenant',
    });

    await expect(platformBranding.attachLogo(tenantLogo.id)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BrandingDomainError && error.code === 'BRANDING_FILE_OWNERSHIP_INVALID',
    );

    const platformLogo = await files.create({
      fileType: 'PLATFORM_LOGO',
      storageKey: 'platform/branding/logo.png',
      mimeType: 'image/png',
      size: 10,
      checksum: 'platform',
    });
    const favicon = await files.create({
      fileType: 'PLATFORM_FAVICON',
      storageKey: 'platform/branding/favicon.png',
      mimeType: 'image/png',
      size: 8,
      checksum: 'fav',
    });

    const withLogo = await platformBranding.attachLogo(platformLogo.id);
    const withFavicon = await platformBranding.attachFavicon(favicon.id);

    expect(withLogo.logoFileId).toBe(platformLogo.id);
    expect(withFavicon.faviconFileId).toBe(favicon.id);
    expect(withLogo.logoFile?.tenantId).toBeNull();
    expect(withFavicon.faviconFile?.fileType).toBe('PLATFORM_FAVICON');
  });

  it('tenant branding rejeita arquivo PLATFORM_* como logo', async () => {
    const tenant = await tenants.create({ name: 'iso-tenant', displayName: 'Iso Tenant' });
    await platformBranding.upsert({ name: 'Economização' });
    const platformLogo = await files.create({
      fileType: 'PLATFORM_LOGO',
      storageKey: 'platform/branding/iso-logo.png',
      mimeType: 'image/png',
      size: 10,
      checksum: 'iso',
    });

    await expect(tenantBranding.setLogo(tenant.id, platformLogo.id)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BrandingDomainError && error.code === 'BRANDING_FILE_NOT_FOUND',
    );
  });

  it('StoredFile: TENANT_LOGO exige tenantId; PLATFORM_* exige null', async () => {
    await expect(
      files.create({
        tenantId: null as never,
        fileType: 'TENANT_LOGO',
        storageKey: 'bad/tenant.png',
        mimeType: 'image/png',
        size: 1,
        checksum: 'x',
      }),
    ).rejects.toBeInstanceOf(BrandingDomainError);

    const platformFile = await files.create({
      fileType: 'PLATFORM_LOGO',
      storageKey: 'platform/ok.png',
      mimeType: 'image/png',
      size: 1,
      checksum: 'y',
    });
    expect(platformFile.tenantId).toBeNull();
    expect(platformFile.fileType).toBe('PLATFORM_LOGO');
  });
});
