import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  AuthDomainError,
  USER_STATUS_DOMAIN_NOTES,
  assertCanBlockUser,
  assertCanDisableUser,
  assertUserStatusDeactivatedAtConsistency,
  assertUserTenantRoleConsistency,
  createTenantRepository,
  createUserRepository,
  isOperationalActiveAdmin,
  normalizePersonName,
  USER_STATUSES,
} from '../src/modules/auth/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

describe('domínio user — normalização e status (1.4B)', () => {
  it('documenta os quatro status existentes sem criar novos', () => {
    expect([...USER_STATUSES]).toEqual(['PENDING', 'ACTIVE', 'BLOCKED', 'DISABLED']);
    expect(USER_STATUS_DOMAIN_NOTES.ACTIVE).toMatch(/utilizável/i);
    expect(USER_STATUS_DOMAIN_NOTES.DISABLED).toMatch(/desativado/i);
  });

  it('normaliza nome com trim e colapso de espaços', () => {
    expect(normalizePersonName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(() => normalizePersonName('   ')).toThrow(AuthDomainError);
  });

  it('isOperationalActiveAdmin conta só ADMIN ACTIVE', () => {
    expect(isOperationalActiveAdmin({ role: 'ADMIN', status: 'ACTIVE' })).toBe(true);
    expect(isOperationalActiveAdmin({ role: 'ADMIN', status: 'BLOCKED' })).toBe(false);
    expect(isOperationalActiveAdmin({ role: 'SUPER_ADMIN', status: 'ACTIVE' })).toBe(false);
    expect(isOperationalActiveAdmin({ role: 'USER', status: 'ACTIVE' })).toBe(false);
  });

  it('invariantes de status ↔ deactivatedAt', () => {
    expect(() => assertUserStatusDeactivatedAtConsistency('DISABLED', null)).toThrow(
      AuthDomainError,
    );
    expect(() => assertUserStatusDeactivatedAtConsistency('ACTIVE', new Date())).toThrow(
      AuthDomainError,
    );
    expect(() => assertUserStatusDeactivatedAtConsistency('DISABLED', new Date())).not.toThrow();
    expect(() => assertUserStatusDeactivatedAtConsistency('PENDING', null)).not.toThrow();
  });

  it('preserva invariantes de tenant por role', () => {
    expect(() => assertUserTenantRoleConsistency('USER', null)).toThrow(AuthDomainError);
    expect(() => assertUserTenantRoleConsistency('ADMIN', 't')).toThrow(AuthDomainError);
    expect(() => assertUserTenantRoleConsistency('SUPER_ADMIN', 't')).toThrow(AuthDomainError);
  });
});

describe('persistência user — repository administrativo (1.4B)', () => {
  const prisma = getPrismaClient();
  const tenants = createTenantRepository(prisma);
  const users = createUserRepository(prisma);

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

  async function createTenantUser(email: string, name = 'User Tenant') {
    const tenant = await tenants.create({
      name: `t-${email.split('@')[0]}`,
      displayName: 'Empresa',
    });
    const user = await users.create({
      name,
      email,
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });
    return { tenant, user };
  }

  it('cria ADMIN e SUPER_ADMIN sem tenant; USER com tenant', async () => {
    const admin = await users.create({
      name: '  Admin  Ops ',
      email: '  Admin@Ops.TEST ',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(admin.tenantId).toBeNull();
    expect(admin.name).toBe('Admin Ops');
    expect(admin.email).toBe('admin@ops.test');

    const superAdmin = await users.create({
      name: 'Super',
      email: 'super@ops.test',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
    expect(superAdmin.tenantId).toBeNull();

    const { user } = await createTenantUser('user@acme.test');
    expect(user.role).toBe('USER');
    expect(user.tenantId).not.toBeNull();
  });

  it('rejeita USER sem tenant e ADMIN/SUPER_ADMIN com tenant', async () => {
    await expect(
      users.create({ name: 'X', email: 'x@t.test', role: 'USER' }),
    ).rejects.toMatchObject({ code: 'USER_REQUIRES_TENANT' });

    const tenant = await tenants.create({ name: 'tx', displayName: 'TX' });
    await expect(
      users.create({
        name: 'A',
        email: 'a@t.test',
        role: 'ADMIN',
        tenantId: tenant.id,
      }),
    ).rejects.toMatchObject({ code: 'PLATFORM_ROLE_MUST_NOT_HAVE_TENANT' });
  });

  it('unicidade de e-mail case-insensitive (constraint + existsByEmail)', async () => {
    await users.create({
      name: 'Um',
      email: 'dup@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(await users.existsByEmail('DUP@example.test')).toBe(true);
    await expect(
      users.create({
        name: 'Dois',
        email: 'DUP@example.test',
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    ).rejects.toBeTruthy();
  });

  it('existsByEmail e existsByTenantId', async () => {
    const { tenant, user } = await createTenantUser('exists@acme.test');
    expect(await users.existsByEmail('EXISTS@acme.test')).toBe(true);
    expect(await users.existsByEmail('exists@acme.test', user.id)).toBe(false);
    expect(await users.existsByTenantId(tenant.id)).toBe(true);
    expect(await users.existsByTenantId('00000000-0000-4000-8000-000000000099')).toBe(false);
  });

  it('list filtra por role, status e tenantId', async () => {
    const tenantA = await tenants.create({ name: 'la', displayName: 'LA' });
    const tenantB = await tenants.create({ name: 'lb', displayName: 'LB' });
    await users.create({
      name: 'Admin',
      email: 'list-admin@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await users.create({
      name: 'Super',
      email: 'list-super@t.test',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
    await users.create({
      name: 'Ua',
      email: 'ua@t.test',
      role: 'USER',
      tenantId: tenantA.id,
      status: 'ACTIVE',
    });
    await users.create({
      name: 'Ub',
      email: 'ub@t.test',
      role: 'USER',
      tenantId: tenantB.id,
      status: 'PENDING',
    });

    const admins = await users.list({ role: 'ADMIN' });
    expect(admins.total).toBe(1);
    expect(admins.items.every((u) => u.role === 'ADMIN')).toBe(true);

    const companyA = await users.list({ tenantId: tenantA.id, role: 'USER' });
    expect(companyA.total).toBe(1);
    expect(companyA.items[0]?.email).toBe('ua@t.test');

    const platformOnly = await users.list({ tenantId: null, roles: ['ADMIN', 'SUPER_ADMIN'] });
    expect(platformOnly.total).toBe(2);

    const pending = await users.list({ status: 'PENDING' });
    expect(pending.total).toBe(1);
  });

  it('update cadastral normaliza nome/e-mail e rejeita e-mail duplicado', async () => {
    const a = await users.create({
      name: 'A',
      email: 'a@upd.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await users.create({
      name: 'B',
      email: 'b@upd.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const updated = await users.update(a.id, { name: '  Novo   Nome ', email: '  Novo@UPD.TEST ' });
    expect(updated.name).toBe('Novo Nome');
    expect(updated.email).toBe('novo@upd.test');

    await expect(users.update(a.id, { email: 'b@upd.test' })).rejects.toBeTruthy();
  });

  it('block / unblock administrativos', async () => {
    await users.create({
      name: 'Keeper',
      email: 'keeper-blk@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const user = await users.create({
      name: 'Blk',
      email: 'blk@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const blocked = await users.block(user.id);
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.lockedUntil).toBeNull();
    expect(blocked.failedLoginAttempts).toBe(0);

    await expect(users.block(user.id)).rejects.toMatchObject({ code: 'USER_ALREADY_BLOCKED' });

    const unblocked = await users.unblock(user.id);
    expect(unblocked.status).toBe('ACTIVE');
  });

  it('disable / enable com deactivatedAt coerente', async () => {
    await users.create({
      name: 'Keeper',
      email: 'keeper-dis@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const user = await users.create({
      name: 'Dis',
      email: 'dis@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const disabled = await users.disable(user.id);
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.deactivatedAt).toBeInstanceOf(Date);

    await expect(users.disable(user.id)).rejects.toMatchObject({ code: 'USER_ALREADY_DISABLED' });
    expect(() => assertCanDisableUser(disabled)).toThrow(AuthDomainError);
    expect(() => assertCanBlockUser(disabled)).toThrow(AuthDomainError);

    const enabled = await users.enable(user.id);
    expect(enabled.status).toBe('ACTIVE');
    expect(enabled.deactivatedAt).toBeNull();
  });

  it('protege o último ADMIN ACTIVE em block/disable no repository', async () => {
    const only = await users.create({
      name: 'Only',
      email: 'only-admin@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await users.create({
      name: 'Super',
      email: 'super-only@t.test',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    await expect(users.block(only.id)).rejects.toMatchObject({
      code: 'LAST_ACTIVE_ADMIN_PROTECTED',
    });
    await expect(users.disable(only.id)).rejects.toMatchObject({
      code: 'LAST_ACTIVE_ADMIN_PROTECTED',
    });
    expect(await users.countActiveAdmins()).toBe(1);
  });

  it('countActiveAdmins ignora SUPER_ADMIN e ADMINs não ACTIVE', async () => {
    await users.create({
      name: 'A1',
      email: 'a1@cnt.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await users.create({
      name: 'A2',
      email: 'a2@cnt.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const blocked = await users.create({
      name: 'A3',
      email: 'a3@cnt.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await users.block(blocked.id);
    await users.create({
      name: 'S',
      email: 's@cnt.test',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    expect(await users.countActiveAdmins()).toBe(2);
  });

  it('não expõe passwordHash em UserRecord', async () => {
    const user = await users.create({
      name: 'Safe',
      email: 'safe@t.test',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(user)).not.toMatch(/passwordHash|argon2/i);
  });
});
