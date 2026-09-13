import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createContaAzulBalanceSnapshotRepository } from '../src/modules/integrations/conta-azul/repositories/balance-snapshot.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const snapshots = createContaAzulBalanceSnapshotRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all(
    [...apps].map(async (app) => {
      try {
        const prefix = buildSessionKeyPrefix('test');
        const keys = await app.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          await app.redis.del(...keys);
        }
      } catch {
        // ignore
      }
      try {
        await app.close();
      } catch {
        // ignore
      }
    }),
  );
  apps.clear();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

function readSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const values = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const withValue = values.filter((value) => /^dashboard\.sid=[^;]+/.test(value));
  return withValue.at(-1);
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0] ?? setCookie;
}

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function createUser(options: {
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN' | 'USER';
  tenantId?: string | null;
}) {
  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId: options.role === 'USER' ? (options.tenantId ?? null) : null,
    status: 'ACTIVE',
  });
  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });
  return user;
}

async function loginAs(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: VALID_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const cookie = readSessionCookie(response.headers['set-cookie']);
  expect(cookie).toBeTruthy();
  return cookieValue(cookie!);
}

async function seedConnected(name: string) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret(
      'access-token-secret',
      environment.integrationEncryptionKey!,
    ),
    encryptedRefreshToken: encryptSecret(
      'refresh-token-secret',
      environment.integrationEncryptionKey!,
    ),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  return { tenant, integration };
}

async function upsertAccount(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly active?: boolean;
}) {
  await financial.upsertAccounts(
    {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      syncedAt: new Date(),
    },
    [
      {
        externalId: input.externalId,
        name: input.externalId,
        type: 'CONTA_CORRENTE',
        active: input.active ?? true,
      },
    ],
  );
  const row = await prisma.financialAccount.findFirstOrThrow({
    where: { tenantId: input.tenantId, externalId: input.externalId },
  });
  return row;
}

async function putSnapshot(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly accountId: string;
  readonly externalId: string;
  readonly balance: string;
  readonly balanceDate: Date;
  readonly capturedAt?: Date;
  readonly activeAtCapture?: boolean;
}) {
  await snapshots.upsertDailyBalanceSnapshot({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    financialAccountId: input.accountId,
    financialAccountExternalId: input.externalId,
    balance: new Prisma.Decimal(input.balance),
    balanceDate: input.balanceDate,
    capturedAt: input.capturedAt ?? new Date(),
    accountActiveAtCapture: input.activeAtCapture ?? true,
  });
}

describe('GET /dashboard/cash-balance-history', () => {
  it('rejeita tenantId, category e costCenter; isola tenant', async () => {
    const seeded = await seedConnected('cbh-iso');
    const other = await seedConnected('cbh-other');
    await createUser({ email: 'cbh-user@example.com', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-user@example.com');

    const rejectedTenant = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-balance-history?tenantId=${seeded.tenant.id}`,
      headers: { cookie },
    });
    expect(rejectedTenant.statusCode).toBe(400);

    const rejectedCategory = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?category=x',
      headers: { cookie },
    });
    expect(rejectedCategory.statusCode).toBe(400);

    const rejectedCc = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?costCenter=x',
      headers: { cookie },
    });
    expect(rejectedCc.statusCode).toBe(400);

    const account = await upsertAccount({
      tenantId: other.tenant.id,
      integrationId: other.integration.id,
      externalId: 'other-acc',
    });
    await putSnapshot({
      tenantId: other.tenant.id,
      integrationId: other.integration.id,
      accountId: account.id,
      externalId: 'other-acc',
      balance: '999.99',
      balanceDate: civilTodayInSaoPaulo(new Date()),
    });

    const empty = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history',
      headers: { cookie },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.headers['cache-control']).toBe('private, no-store');
    const body = empty.json();
    expect(body.coverage).toBe('none');
    expect(body.daily).toEqual([]);
    expect(body.monthly).toEqual([]);
    expect(body.availableFrom).toBeNull();
    expect(body.pointCount).toBe(0);
  });

  it('daily com carry-forward após primeiro snapshot e sem backfill anterior', async () => {
    const seeded = await seedConnected('cbh-daily');
    await createUser({ email: 'cbh-daily@example.com', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-daily@example.com');
    const account = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'acc-1',
    });

    const d10 = new Date(Date.UTC(2026, 7, 10));
    const d12 = new Date(Date.UTC(2026, 7, 12));
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '100.00',
      balanceDate: d10,
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '130.50',
      balanceDate: d12,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-08',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.availableFrom).toBe('2026-08-10');
    expect(body.daily.map((p: { date: string }) => p.date)).not.toContain('2026-08-09');
    expect(body.daily[0]).toEqual({ date: '2026-08-10', balance: '100' });
    expect(body.daily.find((p: { date: string }) => p.date === '2026-08-11')).toEqual({
      date: '2026-08-11',
      balance: '100',
    });
    expect(body.daily.find((p: { date: string }) => p.date === '2026-08-12')).toEqual({
      date: '2026-08-12',
      balance: '130.5',
    });
    expect(body.coverage).toBe('partial');
  });

  it('monthly usa último saldo disponível; mês atual até hoje', async () => {
    const seeded = await seedConnected('cbh-monthly');
    await createUser({ email: 'cbh-monthly@example.com', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-monthly@example.com');
    const account = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'acc-1',
    });

    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '10',
      balanceDate: new Date(Date.UTC(2026, 7, 5)),
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '20',
      balanceDate: new Date(Date.UTC(2026, 7, 20)),
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '35.25',
      balanceDate: new Date(Date.UTC(2026, 8, 1)),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-09',
      headers: { cookie },
    });
    const body = response.json();
    expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2026-08')).toEqual({
      monthKey: '2026-08',
      balance: '20',
    });
    expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2026-09')).toEqual({
      monthKey: '2026-09',
      balance: '35.25',
    });
    expect(body.monthly.some((m: { monthKey: string }) => m.monthKey === '2026-07')).toBe(false);
  });

  it('múltiplas contas: conta sem firstSnapshot não participa; dia completa só com participantes', async () => {
    const seeded = await seedConnected('cbh-multi');
    await createUser({ email: 'cbh-multi@example.com', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-multi@example.com');
    const a1 = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'a1',
    });
    const a2 = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'a2',
    });

    const d10 = new Date(Date.UTC(2026, 7, 10));
    const d11 = new Date(Date.UTC(2026, 7, 11));
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: a1.id,
      externalId: 'a1',
      balance: '100',
      balanceDate: d10,
    });
    // a2 ainda sem snapshot → a1 sozinha publica o dia (não invalida)
    let response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-08',
      headers: { cookie },
    });
    let body = response.json();
    expect(body.coverage).not.toBe('none');
    expect(body.availableFrom).toBe('2026-08-10');
    expect(body.accountsIncluded).toBe(1);
    expect(body.daily.find((p: { date: string }) => p.date === '2026-08-10')).toEqual({
      date: '2026-08-10',
      balance: '100',
    });

    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: a2.id,
      externalId: 'a2',
      balance: '40',
      balanceDate: d11,
    });

    response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-08',
      headers: { cookie },
    });
    body = response.json();
    expect(body.availableFrom).toBe('2026-08-10');
    expect(body.accountsIncluded).toBe(2);
    expect(body.daily.find((p: { date: string }) => p.date === '2026-08-10')).toEqual({
      date: '2026-08-10',
      balance: '100',
    });
    expect(body.daily.find((p: { date: string }) => p.date === '2026-08-11')).toEqual({
      date: '2026-08-11',
      balance: '140',
    });
  });

  it('conta inativa preserva contribuição histórica até o último snapshot; não carrega depois', async () => {
    const seeded = await seedConnected('cbh-inactive');
    await createUser({
      email: 'cbh-inactive@example.com',
      role: 'USER',
      tenantId: seeded.tenant.id,
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-inactive@example.com');
    const live = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'live',
    });
    const dead = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'dead',
    });
    const dayAug = new Date(Date.UTC(2026, 7, 15));
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: live.id,
      externalId: 'live',
      balance: '10',
      balanceDate: dayAug,
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: dead.id,
      externalId: 'dead',
      balance: '90',
      balanceDate: dayAug,
    });

    await prisma.financialAccount.update({
      where: { id: dead.id },
      data: { active: false },
    });

    const aug = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-08',
      headers: { cookie },
    });
    const augBody = aug.json();
    expect(augBody.accountsIncluded).toBe(2);
    expect(augBody.daily.find((p: { date: string }) => p.date === '2026-08-15')).toEqual({
      date: '2026-08-15',
      balance: '100',
    });
    const stored = await prisma.financialAccountBalanceSnapshot.count({
      where: { tenantId: seeded.tenant.id },
    });
    expect(stored).toBe(2);

    // Após último snapshot de dead (15/08), setembro não carrega 90 indefinidamente.
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: live.id,
      externalId: 'live',
      balance: '12',
      balanceDate: new Date(Date.UTC(2026, 8, 2)),
    });
    const sep = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-09',
      headers: { cookie },
    });
    const sepBody = sep.json();
    expect(sepBody.daily.find((p: { date: string }) => p.date === '2026-09-02')).toEqual({
      date: '2026-09-02',
      balance: '12',
    });
    expect(sepBody.accountsIncluded).toBe(1);
  });

  it('serializa decimal como string e cobre virada de mês/ano', async () => {
    const seeded = await seedConnected('cbh-year');
    await createUser({ email: 'cbh-year@example.com', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'cbh-year@example.com');
    const account = await upsertAccount({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      externalId: 'acc-1',
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '12.3400',
      balanceDate: new Date(Date.UTC(2025, 11, 31)),
    });
    await putSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      accountId: account.id,
      externalId: 'acc-1',
      balance: '15.6700',
      balanceDate: new Date(Date.UTC(2026, 0, 1)),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-balance-history?month=2026-01',
      headers: { cookie },
    });
    const body = response.json();
    expect(typeof body.daily[0]?.balance).toBe('string');
    expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2025-12')).toEqual({
      monthKey: '2025-12',
      balance: '12.34',
    });
    expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2026-01')).toEqual({
      monthKey: '2026-01',
      balance: '15.67',
    });
    expect(civilMonthKey(civilTodayInSaoPaulo(new Date())).length).toBe(7);
  });

  describe('11-B blockers — availableFrom / early-return', () => {
    it('A) ativa com first após o mês não invalida histórico de inactive em agosto', async () => {
      const seeded = await seedConnected('cbh-11b-a');
      await createUser({ email: 'cbh-11b-a@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-a@example.com');

      const a = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'a-old',
        active: false,
      });
      const b = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'b-new',
        active: true,
      });

      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: a.id,
        externalId: 'a-old',
        balance: '50',
        balanceDate: new Date(Date.UTC(2026, 7, 1)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: a.id,
        externalId: 'a-old',
        balance: '55',
        balanceDate: new Date(Date.UTC(2026, 7, 31)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: b.id,
        externalId: 'b-new',
        balance: '200',
        balanceDate: new Date(Date.UTC(2026, 8, 10)),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/dashboard/cash-balance-history?month=2026-08',
        headers: { cookie },
      });
      const body = response.json();
      expect(body.coverage).not.toBe('none');
      expect(body.availableFrom).toBe('2026-08-01');
      expect(body.accountsIncluded).toBe(1);
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-01')).toEqual({
        date: '2026-08-01',
        balance: '50',
      });
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-31')).toEqual({
        date: '2026-08-31',
        balance: '55',
      });
      expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2026-08')).toEqual({
        monthKey: '2026-08',
        balance: '55',
      });
    });

    it('B) somente inativas: histórico de agosto permanece', async () => {
      const seeded = await seedConnected('cbh-11b-b');
      await createUser({ email: 'cbh-11b-b@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-b@example.com');

      const a = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'ia',
        active: false,
      });
      const b = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'ib',
        active: false,
      });
      const day = new Date(Date.UTC(2026, 7, 20));
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: a.id,
        externalId: 'ia',
        balance: '10',
        balanceDate: day,
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: b.id,
        externalId: 'ib',
        balance: '30',
        balanceDate: day,
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-08',
          headers: { cookie },
        })
      ).json();
      expect(body.coverage).not.toBe('none');
      expect(body.accountsIncluded).toBe(2);
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-20')).toEqual({
        date: '2026-08-20',
        balance: '40',
      });
    });

    it('C) conta nova no meio do mês: dias anteriores só com A', async () => {
      const seeded = await seedConnected('cbh-11b-c');
      await createUser({ email: 'cbh-11b-c@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-c@example.com');

      const a = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'a',
        active: false,
      });
      const b = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'b',
        active: true,
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: a.id,
        externalId: 'a',
        balance: '100',
        balanceDate: new Date(Date.UTC(2026, 7, 1)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: a.id,
        externalId: 'a',
        balance: '110',
        balanceDate: new Date(Date.UTC(2026, 7, 31)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: b.id,
        externalId: 'b',
        balance: '40',
        balanceDate: new Date(Date.UTC(2026, 7, 15)),
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-08',
          headers: { cookie },
        })
      ).json();
      expect(body.availableFrom).toBe('2026-08-01');
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-01')).toEqual({
        date: '2026-08-01',
        balance: '100',
      });
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-14')).toEqual({
        date: '2026-08-14',
        balance: '100',
      });
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-15')).toEqual({
        date: '2026-08-15',
        balance: '140',
      });
      expect(body.accountsIncluded).toBe(2);
    });

    it('D) active futura após a janela não invalida o mês', async () => {
      const seeded = await seedConnected('cbh-11b-d');
      await createUser({ email: 'cbh-11b-d@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-d@example.com');

      const hist = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'hist',
        active: false,
      });
      await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'future',
        active: true,
      });
      // Sem snapshot da future no range de agosto (first depois da janela).
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: hist.id,
        externalId: 'hist',
        balance: '7',
        balanceDate: new Date(Date.UTC(2026, 7, 5)),
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-08',
          headers: { cookie },
        })
      ).json();
      expect(body.coverage).not.toBe('none');
      expect(body.daily.find((p: { date: string }) => p.date === '2026-08-05')).toEqual({
        date: '2026-08-05',
        balance: '7',
      });
      expect(body.accountsIncluded).toBe(1);
    });

    it('E) período anterior a qualquer firstSnapshot → coverage none', async () => {
      const seeded = await seedConnected('cbh-11b-e');
      await createUser({ email: 'cbh-11b-e@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-e@example.com');

      const account = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'late',
        active: true,
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: account.id,
        externalId: 'late',
        balance: '9',
        balanceDate: new Date(Date.UTC(2026, 8, 1)),
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-07',
          headers: { cookie },
        })
      ).json();
      expect(body.coverage).toBe('none');
      expect(body.availableFrom).toBeNull();
      expect(body.daily).toEqual([]);
      expect(body.pointCount).toBe(0);
    });

    it('F) inativa encerra em lastSnapshot inclusive; não carrega depois', async () => {
      const seeded = await seedConnected('cbh-11b-f');
      await createUser({ email: 'cbh-11b-f@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-f@example.com');

      const live = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'live',
        active: true,
      });
      const dead = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'dead',
        active: false,
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: live.id,
        externalId: 'live',
        balance: '10',
        balanceDate: new Date(Date.UTC(2026, 8, 1)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: dead.id,
        externalId: 'dead',
        balance: '90',
        balanceDate: new Date(Date.UTC(2026, 8, 10)),
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: live.id,
        externalId: 'live',
        balance: '11',
        balanceDate: new Date(Date.UTC(2026, 8, 11)),
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-09',
          headers: { cookie },
        })
      ).json();
      expect(body.daily.find((p: { date: string }) => p.date === '2026-09-10')).toEqual({
        date: '2026-09-10',
        balance: '100',
      });
      expect(body.daily.find((p: { date: string }) => p.date === '2026-09-11')).toEqual({
        date: '2026-09-11',
        balance: '11',
      });
    });

    it('G) reativação abre participação; sem duplicar snapshot', async () => {
      const seeded = await seedConnected('cbh-11b-g');
      await createUser({ email: 'cbh-11b-g@example.com', role: 'USER', tenantId: seeded.tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'cbh-11b-g@example.com');

      const account = await upsertAccount({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'rev',
        active: false,
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: account.id,
        externalId: 'rev',
        balance: '5',
        balanceDate: new Date(Date.UTC(2026, 7, 10)),
      });

      await prisma.financialAccount.update({
        where: { id: account.id },
        data: { active: true },
      });
      await putSnapshot({
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        accountId: account.id,
        externalId: 'rev',
        balance: '8',
        balanceDate: new Date(Date.UTC(2026, 8, 5)),
      });

      const body = (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-balance-history?month=2026-09',
          headers: { cookie },
        })
      ).json();
      expect(body.monthly.find((m: { monthKey: string }) => m.monthKey === '2026-08')).toEqual({
        monthKey: '2026-08',
        balance: '5',
      });
      expect(body.daily.find((p: { date: string }) => p.date === '2026-09-05')).toEqual({
        date: '2026-09-05',
        balance: '8',
      });
      expect(
        await prisma.financialAccountBalanceSnapshot.count({
          where: { tenantId: seeded.tenant.id, financialAccountId: account.id },
        }),
      ).toBe(2);
    });
  });
});
