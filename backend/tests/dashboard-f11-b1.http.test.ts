import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { addCivilDays, civilMonthBounds } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
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
  readonly status: FinancialInstallmentStatus;
  readonly total: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly competenceDate?: Date | null;
  readonly dueDate?: Date;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total);
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? total.minus(paid).toString());
  const today = civilTodayInSaoPaulo(new Date());
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate: input.dueDate ?? today,
    competenceDate: input.competenceDate === undefined ? today : input.competenceDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

async function categoryId(tenantId: string, externalId: string): Promise<string> {
  const row = await prisma.financialCategory.findFirst({ where: { tenantId, externalId } });
  expect(row).not.toBeNull();
  return row!.id;
}

describe('GET /dashboard/categories', () => {
  it('lista só o tenant, ordena de forma estável e não vaza externalId/active', async () => {
    const a = await seedConnected('cat-a');
    const b = await seedConnected('cat-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        { externalId: 'z', name: 'Zebra', type: 'EXPENSE', parentExternalId: null, upstreamVersion: 1 },
        { externalId: 'a', name: 'Alpha', type: 'REVENUE', parentExternalId: null, upstreamVersion: 1 },
        { externalId: 'b', name: 'Beta', type: 'REVENUE', parentExternalId: null, upstreamVersion: 1 },
        { externalId: 'u', name: 'Misc', type: 'UNKNOWN', parentExternalId: null, upstreamVersion: 1 },
      ],
    );
    await financial.upsertCategories(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        {
          externalId: 'other',
          name: 'Outro Tenant',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await createUser({ email: 'user@cat.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@cat.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/categories',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { items: Array<{ id: string; name: string; type: string }> };
    expect(body.items.map((item) => item.name)).toEqual(['Alpha', 'Beta', 'Zebra', 'Misc']);
    expect(body.items.map((item) => item.type)).toEqual(['REVENUE', 'REVENUE', 'EXPENSE', 'UNKNOWN']);
    expect(JSON.stringify(body)).not.toContain('externalId');
    expect(JSON.stringify(body)).not.toContain('"active"');
    expect(JSON.stringify(body)).not.toContain('Outro Tenant');
    expect(body.items[0]).toEqual({
      id: expect.any(String),
      name: 'Alpha',
      type: 'REVENUE',
    });

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/categories?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('catálogo vazio retorna items []', async () => {
    const seeded = await seedConnected('cat-empty');
    await createUser({ email: 'empty@cat.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'empty@cat.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/categories',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ items: [] });
  });

  it('11-C: mês atual/futuro active_only; passado historical; reports always historical', async () => {
    const seeded = await seedConnected('cat-11c');
    await createUser({ email: 'user@cat-11c.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@cat-11c.test');
    const syncedAt = new Date();

    const active = await prisma.financialCategory.create({
      data: {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'live',
        name: 'Ativa',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
        active: true,
        syncedAt,
      },
    });
    const hist = await prisma.financialCategory.create({
      data: {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'old',
        name: 'Historica',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
        active: false,
        syncedAt,
      },
    });
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        {
          externalId: 'r-aug',
          description: 'r',
          dueDate: new Date(Date.UTC(2026, 7, 10)),
          competenceDate: new Date(Date.UTC(2026, 7, 10)),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          upstreamStatus: 'OPEN',
          total: new Prisma.Decimal('100'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('100'),
          externalPartyId: null,
          categoryExternalIds: ['old'],
        },
      ],
    );

    const current = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?month=2026-09',
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    expect((current.json() as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual([
      active.id,
    ]);

    const future = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?month=2026-10',
      headers: { cookie },
    });
    expect(future.statusCode).toBe(200);
    expect((future.json() as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual([
      active.id,
    ]);

    const past = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?month=2026-08',
      headers: { cookie },
    });
    expect(past.statusCode).toBe(200);
    expect(
      (past.json() as { items: Array<{ id: string }> }).items.map((i) => i.id).sort(),
    ).toEqual([active.id, hist.id].sort());

    const reportsCurrent = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?from=2026-09&to=2026-09',
      headers: { cookie },
    });
    expect(reportsCurrent.statusCode).toBe(200);
    // Reports = historical mesmo no mês atual; inactive sem uso em set → só active.
    expect(
      (reportsCurrent.json() as { items: Array<{ id: string }> }).items.map((i) => i.id),
    ).toEqual([active.id]);

    const reportsAug = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?from=2026-08&to=2026-08',
      headers: { cookie },
    });
    expect(
      (reportsAug.json() as { items: Array<{ id: string }> }).items.map((i) => i.id).sort(),
    ).toEqual([active.id, hist.id].sort());

    const invalid = await app.inject({
      method: 'GET',
      url: '/dashboard/categories?month=2026-13',
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe('F11-B1 situation/category contract', () => {
  it('aplica situation, category, D1, D8, tenant 404 e AND com centro', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const yesterday = addCivilDays(today, -1);
    const tomorrow = addCivilDays(today, 1);
    const a = await seedConnected('f11-a');
    const b = await seedConnected('f11-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        { externalId: 'serv', name: 'Serviços', type: 'REVENUE', parentExternalId: null, upstreamVersion: 1 },
        { externalId: 'filho', name: 'Filho', type: 'REVENUE', parentExternalId: 'serv', upstreamVersion: 1 },
        { externalId: 'sal', name: 'Salário', type: 'EXPENSE', parentExternalId: null, upstreamVersion: 1 },
        { externalId: 'unk', name: 'Outros', type: 'UNKNOWN', parentExternalId: null, upstreamVersion: 1 },
      ],
    );
    await financial.upsertCategories(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        {
          externalId: 'serv-b',
          name: 'Serviços B',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'paid',
          status: 'PAID',
          total: '100',
          paid: '100',
          unpaid: '0',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'partial',
          status: 'PARTIALLY_PAID',
          total: '80',
          paid: '30',
          unpaid: '50',
          competenceDate: from,
          dueDate: yesterday,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'open-today',
          status: 'OPEN',
          total: '40',
          competenceDate: from,
          dueDate: today,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'open-past',
          status: 'OPEN',
          total: '25',
          competenceDate: from,
          dueDate: yesterday,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'overdue-future',
          status: 'OVERDUE',
          total: '15',
          competenceDate: from,
          dueDate: tomorrow,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'multi',
          status: 'OPEN',
          total: '9',
          competenceDate: from,
          categoryExternalIds: ['serv', 'filho'],
        }),
        installment({
          externalId: 'none',
          status: 'OPEN',
          total: '8',
          competenceDate: from,
        }),
        installment({
          externalId: 'child',
          status: 'OPEN',
          total: '7',
          competenceDate: from,
          categoryExternalIds: ['filho'],
        }),
        installment({
          externalId: 'unk-ar',
          status: 'OPEN',
          total: '6',
          competenceDate: from,
          categoryExternalIds: ['unk'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-open',
          status: 'OPEN',
          total: '200',
          competenceDate: from,
          dueDate: yesterday,
          categoryExternalIds: ['sal'],
        }),
        installment({
          externalId: 'ap-paid',
          status: 'PAID',
          total: '50',
          paid: '50',
          unpaid: '0',
          competenceDate: from,
          categoryExternalIds: ['sal'],
        }),
      ],
    );

    const servId = await categoryId(a.tenant.id, 'serv');
    const salId = await categoryId(a.tenant.id, 'sal');
    const unkId = await categoryId(a.tenant.id, 'unk');
    const otherId = await categoryId(b.tenant.id, 'serv-b');
    await createUser({ email: 'user@f11.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@f11.test');

    const all = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().receivables.total).toBe('290');

    const invalidSit = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?situation=PAID',
      headers: { cookie },
    });
    expect(invalidSit.statusCode).toBe(400);

    const settled = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?situation=settled',
      headers: { cookie },
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().receivables.total).toBe('100');
    expect(settled.json().receivables.received).toBe('100');

    const open = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?situation=open',
      headers: { cookie },
    });
    expect(open.statusCode).toBe(200);
    expect(open.json().receivables.total).toBe('190');

    const overdue = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?situation=overdue',
      headers: { cookie },
    });
    expect(overdue.statusCode).toBe(200);
    expect(overdue.json().receivables.total).toBe('105');

    const invalidCat = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?category=not-uuid',
      headers: { cookie },
    });
    expect(invalidCat.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?category=8cf7b841-7d8c-4166-b24b-5f350e0d5403',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);

    const otherTenant = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?category=${otherId}`,
      headers: { cookie },
    });
    expect(otherTenant.statusCode).toBe(404);

    const named = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?category=${servId}`,
      headers: { cookie },
    });
    expect(named.statusCode).toBe(200);
    expect(named.json().receivables.total).toBe('260');
    expect(named.json().receivables.items.every((item: { name: string }) => item.name === 'Serviços')).toBe(
      true,
    );

    const revenueOnAp = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-expenses?category=${servId}`,
      headers: { cookie },
    });
    expect(revenueOnAp.statusCode).toBe(200);
    expect(revenueOnAp.json().payables.total).toBe('0');

    const expenseOnAr = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?category=${salId}`,
      headers: { cookie },
    });
    expect(expenseOnAr.statusCode).toBe(200);
    expect(expenseOnAr.json().receivables.total).toBe('0');

    const unknown = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?category=${unkId}`,
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().receivables.total).toBe('0');

    const parent = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?category=${servId}`,
      headers: { cookie },
    });
    expect(parent.json().receivables.total).not.toContain('7');
    expect(JSON.stringify(parent.json())).not.toContain('"7"');

    const expensesOpen = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-expenses?situation=open',
      headers: { cookie },
    });
    expect(expensesOpen.json().payables.total).toBe('200');

    const center = await prisma.costCenter.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        externalId: 'cc-a',
        code: 'A',
        name: 'Centro A',
        active: true,
        syncedAt,
      },
    });
    const receivables = await prisma.receivable.findMany({
      where: { tenantId: a.tenant.id, externalId: 'paid' },
    });
    await prisma.installmentCostCenterAllocation.create({
      data: {
        tenantId: a.tenant.id,
        costCenterId: center.id,
        receivableId: receivables[0]!.id,
        payableId: null,
        amount: new Prisma.Decimal('100'),
        syncedAt,
      },
    });
    await prisma.receivable.update({
      where: { id: receivables[0]!.id },
      data: {
        costCenterDetailStatus: 'FETCHED',
        costCenterDetailSyncedAt: syncedAt,
        costCenterDetailRuleVersion: 1,
      },
    });

    const combo = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?costCenter=${center.id}&situation=settled&category=${servId}`,
      headers: { cookie },
    });
    expect(combo.statusCode).toBe(200);
    expect(combo.json().receivables.total).toBe('100');

    const noAlloc = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?costCenter=${center.id}&situation=open`,
      headers: { cookie },
    });
    expect(noAlloc.statusCode).toBe(200);
    expect(noAlloc.json().receivables.total).toBe('0');

    const previousMonthKey =
      from.getUTCMonth() === 0
        ? `${from.getUTCFullYear() - 1}-12`
        : `${from.getUTCFullYear()}-${String(from.getUTCMonth()).padStart(2, '0')}`;
    const previous = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=${previousMonthKey}&situation=settled&category=${servId}`,
      headers: { cookie },
    });
    expect(previous.statusCode).toBe(200);
    expect(previous.json().receivables.total).toBe('0');

    const insightsAll = await app.inject({
      method: 'GET',
      url: '/dashboard/executive-insights',
      headers: { cookie },
    });
    const insightsSettled = await app.inject({
      method: 'GET',
      url: '/dashboard/executive-insights?situation=settled',
      headers: { cookie },
    });
    expect(insightsAll.statusCode).toBe(200);
    expect(insightsSettled.statusCode).toBe(200);
    expect(JSON.stringify(insightsSettled.json())).not.toBe(JSON.stringify(insightsAll.json()));

    const forecast = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast',
      headers: { cookie },
    });
    const forecastSettled = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast?situation=settled',
      headers: { cookie },
    });
    const forecastCat = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-flow-forecast?category=${salId}`,
      headers: { cookie },
    });
    expect(forecast.statusCode).toBe(200);
    expect(forecastSettled.statusCode).toBe(200);
    expect(forecastSettled.json()).toEqual(forecast.json());
    expect(forecastCat.statusCode).toBe(200);
    expect(forecastCat.json()).not.toEqual(forecast.json());

    const invalidForecastSit = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast?situation=PAID',
      headers: { cookie },
    });
    expect(invalidForecastSit.statusCode).toBe(400);

    const pressure = await app.inject({
      method: 'GET',
      url: '/dashboard/month-end-cash-pressure',
      headers: { cookie },
    });
    const pressureSettled = await app.inject({
      method: 'GET',
      url: '/dashboard/month-end-cash-pressure?situation=settled',
      headers: { cookie },
    });
    const pressureCat = await app.inject({
      method: 'GET',
      url: `/dashboard/month-end-cash-pressure?category=${salId}`,
      headers: { cookie },
    });
    expect(pressure.statusCode).toBe(200);
    expect(pressureSettled.json()).toEqual(pressure.json());
    expect(pressureCat.json()).not.toEqual(pressure.json());

    const goal = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
    });
    const goalFiltered = await app.inject({
      method: 'GET',
      url: `/dashboard/revenue-goal?situation=settled&category=${servId}&costCenter=${center.id}`,
      headers: { cookie },
    });
    expect(goal.statusCode).toBe(200);
    expect(goalFiltered.statusCode).toBe(200);
    expect(goalFiltered.json().actual).toBe(goal.json().actual);
  });
});
