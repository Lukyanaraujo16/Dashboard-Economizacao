import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import {
  createBootstrapSuperAdminService,
  formatBootstrapSuperAdminMessage,
} from '../src/modules/auth/services/bootstrap-super-admin.service.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const VALID_PASSWORD = 'Password#12345';
const prisma = getPrismaClient();
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();
const bootstrap = createBootstrapSuperAdminService({ users, credentials, passwordHasher });

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('bootstrap SUPER_ADMIN', () => {
  it('cria o primeiro SUPER_ADMIN ACTIVE sem tenant com hash Argon2id', async () => {
    const created = await bootstrap.bootstrap({
      name: '  Operador Técnico  ',
      email: 'ops@plataforma.test',
      password: VALID_PASSWORD,
    });

    expect(created.status).toBe('created');
    expect(created.user.role).toBe('SUPER_ADMIN');
    expect(created.user.status).toBe('ACTIVE');
    expect(created.user.tenantId).toBeNull();
    expect(created.user.email).toBe('ops@plataforma.test');
    expect(created.user.name).toBe('Operador Técnico');
    expect(created.user.passwordConfiguredAt).not.toBeNull();

    const stored = await credentials.findByUserId(created.user.id);
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await passwordHasher.verify(stored!.passwordHash, VALID_PASSWORD)).toBe(true);
  });

  it('não inclui o segredo no resultado nem na mensagem operacional', async () => {
    const created = await bootstrap.bootstrap({
      name: 'Operador Técnico',
      email: 'ops@plataforma.test',
      password: VALID_PASSWORD,
    });

    expect(JSON.stringify(created)).not.toContain(VALID_PASSWORD);
    expect(formatBootstrapSuperAdminMessage(created)).not.toContain(VALID_PASSWORD);
    expect(formatBootstrapSuperAdminMessage(created)).toContain('SUPER_ADMIN criado');
    expect(created).not.toHaveProperty('password');
    expect(created.user).not.toHaveProperty('passwordHash');
  });

  it('recusa segundo SUPER_ADMIN quando a instalação já possui um', async () => {
    const first = await bootstrap.bootstrap({
      name: 'Operador Técnico',
      email: 'ops@plataforma.test',
      password: VALID_PASSWORD,
    });
    expect(first.status).toBe('created');

    const second = await bootstrap.bootstrap({
      name: 'Outro',
      email: 'outro@plataforma.test',
      password: 'OutraSenha#123',
    });

    expect(second.status).toBe('already_bootstrapped');
    expect(second.user.email).toBe('ops@plataforma.test');
    expect(formatBootstrapSuperAdminMessage(second)).toContain('já possui SUPER_ADMIN');
    expect(JSON.stringify(second)).not.toContain('OutraSenha#123');

    const listed = await users.list({ roles: ['SUPER_ADMIN'] });
    expect(listed.total).toBe(1);
  });

  it('permite bootstrap quando existe ADMIN e nenhum SUPER_ADMIN', async () => {
    const admin = await users.create({
      name: 'Administrador operacional',
      email: 'admin@plataforma.test',
      role: 'ADMIN',
      tenantId: null,
      status: 'ACTIVE',
    });
    expect(admin.role).toBe('ADMIN');

    const created = await bootstrap.bootstrap({
      name: 'Operador Técnico',
      email: 'ops@plataforma.test',
      password: VALID_PASSWORD,
    });

    expect(created.status).toBe('created');
    expect(created.user.role).toBe('SUPER_ADMIN');
    expect(created.user.email).toBe('ops@plataforma.test');
    expect(created.user.tenantId).toBeNull();

    const admins = await users.list({ roles: ['ADMIN'] });
    const supers = await users.list({ roles: ['SUPER_ADMIN'] });
    expect(admins.total).toBe(1);
    expect(supers.total).toBe(1);
  });

  it('rejeita senha inválida', async () => {
    await expect(
      bootstrap.bootstrap({
        name: 'Operador Técnico',
        email: 'ops@plataforma.test',
        password: 'short',
      }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_PASSWORD_INVALID' });

    const listed = await users.list({ roles: ['SUPER_ADMIN'] });
    expect(listed.total).toBe(0);
  });

  it('rejeita e-mail inválido', async () => {
    await expect(
      bootstrap.bootstrap({
        name: 'Operador Técnico',
        email: 'nao-e-email',
        password: VALID_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_EMAIL_INVALID' });
  });
});
