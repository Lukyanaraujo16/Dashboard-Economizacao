import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBounds } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { shiftRevenueGoalMonthKey } from '../src/modules/dashboard/domain/revenue-goal-math.js';
import { createRevenueGoalRepository } from '../src/modules/dashboard/repositories/revenue-goal.repository.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
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
const ledgerWrite = createContaAzulLedgerRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const goals = createRevenueGoalRepository(prisma);
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

function iso(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function installment(input: {
  readonly externalId: string;
  readonly status: FinancialInstallmentStatus;
  readonly total: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly competenceDate: Date | null;
  readonly dueDate?: Date;
}) {
  const total = new Prisma.Decimal(input.total);
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? total.minus(paid).toString());
  const dueDate = input.dueDate ?? civilTodayInSaoPaulo(new Date());
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate,
    competenceDate: input.competenceDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [] as string[],
  };
}

function baixa(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly data: string;
  readonly bruto: string;
  readonly liquido: string;
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.liquido,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
  });
}

async function seedReceipt(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly installmentExternalId: string;
  readonly amount: string;
  readonly occurredOn: Date;
  readonly settlementId?: string;
}) {
  const scope = {
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    syncedAt: new Date(),
  };
  await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
    baixa({
      id: input.settlementId ?? `s-${input.installmentExternalId}`,
      installmentId: input.installmentExternalId,
      data: iso(input.occurredOn),
      bruto: input.amount,
      liquido: input.amount,
    }),
  ]);
}

const today = () => civilTodayInSaoPaulo(new Date());
const currentBounds = () => civilMonthBounds(today());

describe('GET /dashboard/revenue-goal', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/revenue-goal' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@goal.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@goal.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('sem meta cadastrada retorna NO_TARGET com realizado de caixa (billing)', async () => {
    const { from, monthKey } = currentBounds();
    const seeded = await seedConnected('goal-no-target');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'r1',
          status: 'PAID',
          total: '1500',
          paid: '1500',
          unpaid: '0',
          competenceDate: from,
        }),
      ],
    );
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 'r1',
      amount: '1500',
      occurredOn: from,
    });
    await createUser({ email: 'user@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@goal.test');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = response.json();
    expect(body.monthKey).toBe(monthKey);
    expect(body.status).toBe('NO_TARGET');
    expect(body.target).toBeNull();
    expect(body.actual).toBe('1500');
    expect(body.achievementRate).toBeNull();
    expect(body.remaining).toBeNull();
    expect(body.exceeded).toBeNull();
    expect(body.history).toHaveLength(6);
    expect(body.history.at(-1).monthKey).toBe(monthKey);
    expect(JSON.stringify(body)).not.toContain('tenantId');
    expect(JSON.stringify(body)).not.toContain('descricao-secreta-nao-vazar');
  });

  it('recusa tenantId na query', async () => {
    const seeded = await seedConnected('goal-guard');
    await createUser({ email: 'guard@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'guard@goal.test');

    const read = await app.inject({
      method: 'GET',
      url: `/dashboard/revenue-goal?tenantId=${seeded.tenant.id}`,
      headers: { cookie },
    });
    expect(read.statusCode).toBe(400);

    const write = await app.inject({
      method: 'PUT',
      url: `/dashboard/revenue-goal?tenantId=${seeded.tenant.id}`,
      headers: { cookie },
      payload: { month: '2026-08', target: '100' },
    });
    expect(write.statusCode).toBe(400);
  });

  it('month inválido retorna 400', async () => {
    const seeded = await seedConnected('goal-month');
    await createUser({ email: 'month@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'month@goal.test');

    const invalid = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal?month=2026-13',
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('histórico traz metas anteriores com actual de caixa', async () => {
    const { from, monthKey } = currentBounds();
    const previousKey = shiftRevenueGoalMonthKey(monthKey, -1);
    const previousDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 10));
    const seeded = await seedConnected('goal-history');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'curr',
          status: 'PAID',
          total: '400',
          paid: '400',
          unpaid: '0',
          competenceDate: from,
        }),
        installment({
          externalId: 'prev',
          status: 'PAID',
          total: '250',
          paid: '250',
          unpaid: '0',
          competenceDate: previousDate,
        }),
      ],
    );
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 'curr',
      amount: '400',
      occurredOn: from,
    });
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 'prev',
      amount: '250',
      occurredOn: previousDate,
      settlementId: 's-prev',
    });
    await goals.upsert(seeded.tenant.id, previousKey, new Prisma.Decimal('200'));
    await createUser({ email: 'hist@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'hist@goal.test');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const previous = body.history.find(
      (point: { monthKey: string }) => point.monthKey === previousKey,
    );
    expect(previous.target).toBe('200');
    expect(previous.actual).toBe('250');
    expect(previous.status).toBe('EXCEEDED');
    expect(previous.achievementRate).toBe('125');

    const current = body.history.at(-1);
    expect(current.monthKey).toBe(monthKey);
    expect(current.status).toBe('NO_TARGET');
    expect(current.target).toBeNull();
  });

  it('mês passado abaixo da meta → NOT_ACHIEVED (não IN_PROGRESS)', async () => {
    const { from, monthKey } = currentBounds();
    const previousKey = shiftRevenueGoalMonthKey(monthKey, -1);
    const previousDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 10));
    const seeded = await seedConnected('goal-past-missed');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'past-miss',
          status: 'PAID',
          total: '76',
          paid: '76',
          unpaid: '0',
          competenceDate: previousDate,
        }),
      ],
    );
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 'past-miss',
      amount: '76',
      occurredOn: previousDate,
    });
    await goals.upsert(seeded.tenant.id, previousKey, new Prisma.Decimal('100'));
    await createUser({ email: 'past-miss@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'past-miss@goal.test');

    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/revenue-goal?month=${previousKey}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.monthKey).toBe(previousKey);
    expect(body.status).toBe('NOT_ACHIEVED');
    expect(body.remaining).toBe('24');
    expect(body.history.at(-1).status).toBe('NOT_ACHIEVED');
  });

  it('mês futuro com títulos acima da meta → PLANNED (não EXCEEDED)', async () => {
    const { from, monthKey } = currentBounds();
    const futureKey = shiftRevenueGoalMonthKey(monthKey, 1);
    const futureDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 10));
    const seeded = await seedConnected('goal-future-planned');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'future-ahead',
          status: 'OPEN',
          total: '200',
          paid: '0',
          unpaid: '200',
          competenceDate: futureDate,
          dueDate: futureDate,
        }),
      ],
    );
    await goals.upsert(seeded.tenant.id, futureKey, new Prisma.Decimal('100'));
    await createUser({ email: 'future@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'future@goal.test');

    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/revenue-goal?month=${futureKey}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.monthKey).toBe(futureKey);
    expect(body.status).toBe('PLANNED');
    expect(body.actual).toBe('200');
    expect(body.exceeded).toBe('100');
    expect(body.history.at(-1).status).toBe('PLANNED');
  });
});

describe('PUT /dashboard/revenue-goal', () => {
  it('cria e depois atualiza a meta com actual de caixa (billing)', async () => {
    const { from, monthKey } = currentBounds();
    const seeded = await seedConnected('goal-write');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'w1',
          status: 'PAID',
          total: '76000',
          paid: '76000',
          unpaid: '0',
          competenceDate: from,
        }),
      ],
    );
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 'w1',
      amount: '76000',
      occurredOn: from,
    });
    await createUser({ email: 'write@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'write@goal.test');

    const created = await app.inject({
      method: 'PUT',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
      payload: { month: monthKey, target: '100000.00' },
    });
    expect(created.statusCode).toBe(200);
    expect(created.headers['cache-control']).toBe('private, no-store');
    const createdBody = created.json();
    expect(createdBody.monthKey).toBe(monthKey);
    expect(createdBody.target).toBe('100000');
    expect(createdBody.actual).toBe('76000');
    expect(createdBody.achievementRate).toBe('76');
    expect(createdBody.remaining).toBe('24000');
    expect(createdBody.exceeded).toBe('0');
    expect(createdBody.status).toBe('IN_PROGRESS');
    expect(createdBody.history).toHaveLength(6);

    const updated = await app.inject({
      method: 'PUT',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
      payload: { month: monthKey, target: '50000' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().target).toBe('50000');
    expect(updated.json().status).toBe('EXCEEDED');
    expect(updated.json().exceeded).toBe('26000');

    const read = await app.inject({
      method: 'GET',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
    });
    expect(read.json().target).toBe('50000');

    const rows = await prisma.revenueGoal.findMany({ where: { tenantId: seeded.tenant.id } });
    expect(rows).toHaveLength(1);
  });

  it('recusa target inválido sem persistir', async () => {
    const { monthKey } = currentBounds();
    const seeded = await seedConnected('goal-invalid');
    await createUser({ email: 'invalid@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'invalid@goal.test');

    for (const target of ['0', '-10', 'NaN', '', 'abc', 100 as unknown as string, null]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/dashboard/revenue-goal',
        headers: { cookie },
        payload: { month: monthKey, target },
      });
      expect(response.statusCode).toBe(400);
    }

    const rows = await prisma.revenueGoal.findMany({ where: { tenantId: seeded.tenant.id } });
    expect(rows).toHaveLength(0);
  });

  it('exige month explícito e válido', async () => {
    const seeded = await seedConnected('goal-month-required');
    await createUser({ email: 'required@goal.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'required@goal.test');

    for (const payload of [
      { target: '100' },
      { month: null, target: '100' },
      { month: '', target: '100' },
      { month: '2026-13', target: '100' },
      { month: '2026-8', target: '100' },
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/dashboard/revenue-goal',
        headers: { cookie },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('ADMIN sem Support Mode não grava', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin-write@goal.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin-write@goal.test');
    const response = await app.inject({
      method: 'PUT',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
      payload: { month: '2026-08', target: '100' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('SUPER_ADMIN em Support Mode grava no tenant operacional', async () => {
    const { from, monthKey } = currentBounds();
    const seeded = await seedConnected('goal-support');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 's1',
          status: 'PAID',
          total: '300',
          paid: '300',
          unpaid: '0',
          competenceDate: from,
        }),
      ],
    );
    await seedReceipt({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      installmentExternalId: 's1',
      amount: '300',
      occurredOn: from,
    });
    await createUser({ email: 'super@goal.test', role: 'SUPER_ADMIN' });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'super@goal.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'revenue-goal-support' },
      payload: { tenantId: seeded.tenant.id },
    });
    expect(enter.statusCode).toBe(200);

    const response = await app.inject({
      method: 'PUT',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
      payload: { month: monthKey, target: '300' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ACHIEVED');

    const stored = await goals.findByTenantMonth(seeded.tenant.id, monthKey);
    expect(stored!.targetAmount.equals(300)).toBe(true);
  });

  it('não aceita tenantId no corpo', async () => {
    const { monthKey } = currentBounds();
    const a = await seedConnected('goal-body-a');
    const b = await seedConnected('goal-body-b');
    await createUser({ email: 'body@goal.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'body@goal.test');

    const response = await app.inject({
      method: 'PUT',
      url: '/dashboard/revenue-goal',
      headers: { cookie },
      payload: { month: monthKey, target: '100', tenantId: b.tenant.id },
    });
    expect(response.statusCode).toBe(400);
    expect(await goals.findByTenantMonth(b.tenant.id, monthKey)).toBeNull();
  });
});
