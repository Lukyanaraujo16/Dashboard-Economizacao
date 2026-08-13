import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  AUTH_LOCKOUT_DURATION_MINUTES,
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
  AuthDomainError,
  assertUserTenantRoleConsistency,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../src/modules/auth/index.js';

const PLACEHOLDER_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$cGxhY2Vob2xkZXJzYWx0$cGxhY2Vob2xkZXJoYXNo';

describe('domínio auth — invariantes e normalização', () => {
  it('normaliza e-mail com trim e lowercase', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('exige tenant para USER e proíbe tenant para ADMIN/SUPER_ADMIN', () => {
    expect(() => assertUserTenantRoleConsistency('USER', null)).toThrow(AuthDomainError);
    expect(() => assertUserTenantRoleConsistency('ADMIN', 'tenant-id')).toThrow(AuthDomainError);
    expect(() => assertUserTenantRoleConsistency('SUPER_ADMIN', 'tenant-id')).toThrow(
      AuthDomainError,
    );
    expect(() => assertUserTenantRoleConsistency('USER', 'tenant-id')).not.toThrow();
    expect(() => assertUserTenantRoleConsistency('ADMIN', null)).not.toThrow();
    expect(() => assertUserTenantRoleConsistency('SUPER_ADMIN', null)).not.toThrow();
  });

  it('expõe constantes estruturais de senha e lockout sem implementar login', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(AUTH_MAX_FAILED_LOGIN_ATTEMPTS).toBe(5);
    expect(AUTH_LOCKOUT_DURATION_MINUTES).toBe(15);
  });
});

describe('persistência auth — User / Tenant / UserCredential', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);
  const credentials = createUserCredentialRepository(prisma);

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória para testes de persistência.');
    }
  });

  afterEach(async () => {
    await prisma.userCredential.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('cria tenant mínimo e USER associado', async () => {
    const tenant = await tenants.create({
      name: 'acme',
      displayName: 'Acme Ltda',
    });

    const user = await users.create({
      name: 'Usuário Acme',
      email: 'user@acme.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'PENDING',
    });

    expect(user.tenantId).toBe(tenant.id);
    expect(user.role).toBe('USER');
    expect(user.status).toBe('PENDING');
    expect(user.email).toBe('user@acme.test');
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.passwordConfiguredAt).toBeNull();
    expect(user.firstAccessCompletedAt).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('impede USER sem tenant na camada de domínio', async () => {
    await expect(
      users.create({
        name: 'Sem Tenant',
        email: 'sem-tenant@example.test',
        role: 'USER',
      }),
    ).rejects.toBeInstanceOf(AuthDomainError);
  });

  it('impede USER sem tenant no banco (CHECK)', async () => {
    await expect(
      prisma.user.create({
        data: {
          name: 'Bypass',
          email: 'bypass-user@example.test',
          role: 'USER',
          status: 'PENDING',
          tenantId: null,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('normaliza e-mail na persistência e rejeita duplicidade case-insensitive', async () => {
    const tenant = await tenants.create({ name: 't1', displayName: 'T1' });

    await users.create({
      name: 'Um',
      email: '  Dup@Example.TEST ',
      role: 'USER',
      tenantId: tenant.id,
    });

    const found = await users.findByEmail('DUP@example.test');
    expect(found?.email).toBe('dup@example.test');

    await expect(
      users.create({
        name: 'Dois',
        email: 'dup@EXAMPLE.test',
        role: 'USER',
        tenantId: tenant.id,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
    );
  });

  it('PENDING pode existir sem credencial', async () => {
    const tenant = await tenants.create({ name: 't2', displayName: 'T2' });
    const user = await users.create({
      name: 'Pendente',
      email: 'pending@example.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'PENDING',
    });

    const credential = await credentials.findByUserId(user.id);
    expect(credential).toBeNull();
  });

  it('credencial é 1:1 e passwordHash não aparece na leitura comum de User', async () => {
    const tenant = await tenants.create({ name: 't3', displayName: 'T3' });
    const user = await users.create({
      name: 'Com Senha',
      email: 'cred@example.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });

    const createdCredential = await credentials.create({
      userId: user.id,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
    });

    expect(createdCredential.userId).toBe(user.id);
    expect(createdCredential.passwordHash).toBe(PLACEHOLDER_PASSWORD_HASH);

    await expect(
      credentials.create({
        userId: user.id,
        passwordHash: PLACEHOLDER_PASSWORD_HASH,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
    );

    const byId = await users.findById(user.id);
    const byEmail = await users.findByEmail(user.email);

    expect(byId).not.toBeNull();
    expect(byEmail).not.toBeNull();
    expect(Object.keys(byId!)).not.toContain('passwordHash');
    expect(Object.keys(byEmail!)).not.toContain('passwordHash');
    expect(JSON.stringify(byId)).not.toContain(PLACEHOLDER_PASSWORD_HASH);
    expect(JSON.stringify(byEmail)).not.toContain('passwordHash');
  });

  it('persiste status e role corretamente', async () => {
    const tenant = await tenants.create({ name: 't4', displayName: 'T4' });

    const blocked = await users.create({
      name: 'Bloqueado',
      email: 'blocked@example.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'BLOCKED',
    });

    const disabled = await users.create({
      name: 'Desativado',
      email: 'disabled@example.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'DISABLED',
    });

    expect(blocked.status).toBe('BLOCKED');
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.role).toBe('USER');
  });

  it('SUPER_ADMIN e ADMIN funcionam sem tenant', async () => {
    const superAdmin = await users.create({
      name: 'Super',
      email: 'super@platform.test',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    const admin = await users.create({
      name: 'Admin',
      email: 'admin@platform.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    expect(superAdmin.tenantId).toBeNull();
    expect(admin.tenantId).toBeNull();

    await expect(
      users.create({
        name: 'Admin com tenant',
        email: 'admin-tenant@platform.test',
        role: 'ADMIN',
        tenantId: (await tenants.create({ name: 't5', displayName: 'T5' })).id,
      }),
    ).rejects.toBeInstanceOf(AuthDomainError);
  });

  it('impede SUPER_ADMIN com tenant no banco (CHECK)', async () => {
    const tenant = await tenants.create({ name: 't6', displayName: 'T6' });

    await expect(
      prisma.user.create({
        data: {
          name: 'Super Bypass',
          email: 'super-bypass@platform.test',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          tenantId: tenant.id,
        },
      }),
    ).rejects.toBeTruthy();
  });
});
