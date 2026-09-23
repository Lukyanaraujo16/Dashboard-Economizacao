import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import {
  addCivilDays,
  civilMonthBounds,
  civilMonthBoundsFromKey,
  civilMonthKey,
  shiftCivilMonthKey,
} from '../src/modules/analytics/domain/civil-calendar.js';
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

function installment(input: {
  readonly externalId: string;
  readonly dueDate: Date;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly status?: FinancialInstallmentStatus;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: 'Titulo',
    dueDate: input.dueDate,
    competenceDate: input.dueDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [] as string[],
  };
}

describe('GET /dashboard/cash-expected-horizon', () => {
  it('rejeita sem sessão, tenantId e horizon inválido', async () => {
    const app = await buildTestApp();
    expect(
      (await app.inject({ method: 'GET', url: '/dashboard/cash-expected-horizon?horizon=3' }))
        .statusCode,
    ).toBe(401);

    const seeded = await seedConnected('ceh-auth');
    await createUser({ email: 'user-ceh@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const cookie = await loginAs(app, 'user-ceh@mcf.test');

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/dashboard/cash-expected-horizon?horizon=3&tenantId=${seeded.tenant.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-expected-horizon?horizon=1',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/dashboard/cash-expected-horizon',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('horizon=3 com AR/AP, isola tenant e reconcilia totais', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const nextMonthKey = shiftCivilMonthKey(monthKey, 1);
    const nextBounds = civilMonthBoundsFromKey(nextMonthKey);

    const seeded = await seedConnected('ceh-main');
    const other = await seedConnected('ceh-other');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    const scopeOther = {
      tenantId: other.tenant.id,
      integrationId: other.integration.id,
      syncedAt: new Date(),
    };

    const dueThisMonth =
      today.getTime() <= to.getTime() ? (today.getTime() >= from.getTime() ? today : from) : to;
    // garantir dueDate >= today no mês corrente
    const dueInMonth = dueThisMonth.getTime() < today.getTime() ? today : dueThisMonth;
    const dueNext = nextBounds.from.getTime() >= today.getTime() ? nextBounds.from : addCivilDays(today, 40);

    await financial.upsertReceivables(scope, [
      installment({ externalId: 'ar-1', dueDate: dueInMonth, unpaid: '100' }),
      installment({
        externalId: 'ar-next',
        dueDate: dueNext,
        unpaid: '50',
      }),
      installment({
        externalId: 'ar-overdue',
        dueDate: addCivilDays(today, -5),
        unpaid: '999',
        status: 'OVERDUE',
      }),
    ]);
    await financial.upsertPayables(scope, [
      installment({ externalId: 'ap-1', dueDate: dueInMonth, unpaid: '30' }),
    ]);
    await financial.upsertReceivables(scopeOther, [
      installment({ externalId: 'secret', dueDate: dueInMonth, unpaid: '99999' }),
    ]);

    await createUser({ email: 'user-ceh-main@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-ceh-main@mcf.test');

    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-expected-horizon?month=${monthKey}&horizon=3`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = response.json();
    expect(body.horizon).toBe(3);
    expect(body.startMonth).toBe(monthKey);
    expect(body.endMonth).toBe(shiftCivilMonthKey(monthKey, 2));
    expect(body.months).toHaveLength(3);
    expect(body.costCenterCashSplit).toBe(true);

    const sumRecv = body.months.reduce(
      (acc: Prisma.Decimal, m: { expected: { receivables: string } }) =>
        acc.plus(m.expected.receivables),
      new Prisma.Decimal(0),
    );
    const sumPay = body.months.reduce(
      (acc: Prisma.Decimal, m: { expected: { payables: string } }) =>
        acc.plus(m.expected.payables),
      new Prisma.Decimal(0),
    );
    expect(sumRecv.toString()).toBe(body.totals.receivables);
    expect(sumPay.toString()).toBe(body.totals.payables);
    expect(body.totals.result).toBe(
      new Prisma.Decimal(body.totals.receivables).minus(body.totals.payables).toString(),
    );
    expect(body.totals.receivables).not.toBe('99999');
    expect(new Prisma.Decimal(body.totals.receivables).greaterThanOrEqualTo(100)).toBe(true);
    expect(body.totals.payables).toBe('30');
    expect(body.totals.receivables).not.toContain('999');
    expect(body.projection.available).toBe(false);
    expect(body.projection.unavailableReason).toBe('NO_BASE');
    expect(body.projection.months).toEqual([]);
  });

  it('projeção usa saldo oficial + vencido só no ajuste; DELETED e outro tenant ficam fora', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const pastMonthKey = shiftCivilMonthKey(monthKey, -4);
    const futureMonthKey = shiftCivilMonthKey(monthKey, 2);

    const seeded = await seedConnected('ceh-proj');
    const other = await seedConnected('ceh-proj-other');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    const dueThisMonth =
      today.getTime() <= to.getTime() ? (today.getTime() >= from.getTime() ? today : from) : to;
    const dueInMonth = dueThisMonth.getTime() < today.getTime() ? today : dueThisMonth;

    await financial.upsertReceivables(scope, [
      installment({ externalId: 'ar-open', dueDate: dueInMonth, unpaid: '20' }),
      installment({
        externalId: 'ar-overdue',
        dueDate: addCivilDays(today, -4),
        unpaid: '15',
        status: 'OVERDUE',
      }),
      installment({
        externalId: 'ar-deleted',
        dueDate: dueInMonth,
        unpaid: '777',
      }),
    ]);
    await financial.upsertPayables(scope, [
      installment({ externalId: 'ap-open', dueDate: dueInMonth, unpaid: '5' }),
    ]);
    await prisma.receivable.updateMany({
      where: { tenantId: seeded.tenant.id, externalId: 'ar-deleted' },
      data: { lifecycleStatus: 'DELETED' },
    });

    await financial.upsertAccounts(scope, [
      {
        externalId: 'acc-main',
        name: 'Conta principal',
        type: 'CONTA_CORRENTE',
        active: true,
      },
    ]);
    const account = await prisma.financialAccount.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'acc-main' },
    });
    await snapshots.upsertDailyBalanceSnapshot({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      financialAccountId: account.id,
      financialAccountExternalId: 'acc-main',
      balance: new Prisma.Decimal('100'),
      balanceDate: today,
      capturedAt: new Date(),
      accountActiveAtCapture: true,
    });
    await financial.upsertAccounts(
      {
        tenantId: other.tenant.id,
        integrationId: other.integration.id,
        syncedAt: new Date(),
      },
      [
        {
          externalId: 'acc-other',
          name: 'Outra',
          type: 'CONTA_CORRENTE',
          active: true,
        },
      ],
    );
    const otherAccount = await prisma.financialAccount.findFirstOrThrow({
      where: { tenantId: other.tenant.id, externalId: 'acc-other' },
    });
    await snapshots.upsertDailyBalanceSnapshot({
      tenantId: other.tenant.id,
      integrationId: other.integration.id,
      financialAccountId: otherAccount.id,
      financialAccountExternalId: 'acc-other',
      balance: new Prisma.Decimal('88888'),
      balanceDate: today,
      capturedAt: new Date(),
      accountActiveAtCapture: true,
    });

    await createUser({ email: 'user-ceh-proj@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-ceh-proj@mcf.test');

    const current = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-expected-horizon?month=${monthKey}&horizon=3`,
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    const body = current.json();
    expect(body.totals.receivables).toBe('20');
    expect(body.totals.payables).toBe('5');
    expect(body.totals.result).toBe('15');
    expect(body.projection.available).toBe(true);
    expect(body.projection.base.balance).toBe('100');
    expect(body.projection.base.coverage).not.toBe('none');
    expect(body.projection.months).toHaveLength(3);
    expect(body.projection.months[0].overdueAdjustment).toBe('15');
    expect(body.projection.months[0].expectedReceivables).toBe('20');
    expect(body.projection.months[0].expectedPayables).toBe('5');
    expect(body.projection.months[0].projectedBalance).toBe('130');
    expect(body.projection.months[1].overdueAdjustment).toBe('0');
    expect(body.projection.months[1].projectedBalance).toBe('130');

    const past = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-expected-horizon?month=${pastMonthKey}&horizon=3`,
      headers: { cookie },
    });
    expect(past.json().projection.available).toBe(false);
    expect(past.json().projection.unavailableReason).toBe('NOT_CURRENT_MONTH');
    expect(past.json().totals.receivables).toBe('0');

    const future = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-expected-horizon?month=${futureMonthKey}&horizon=6`,
      headers: { cookie },
    });
    expect(future.json().horizon).toBe(6);
    expect(future.json().months).toHaveLength(6);
    expect(future.json().projection.available).toBe(false);
    expect(future.json().projection.unavailableReason).toBe('NOT_CURRENT_MONTH');
  });
});
