import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
} from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
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

function iso(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

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
  readonly competenceDate?: Date | null;
  readonly categoryExternalIds?: readonly string[];
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate: input.dueDate,
    competenceDate: input.competenceDate === undefined ? input.dueDate : input.competenceDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
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
    tipo_evento_financeiro: 'DESPESA',
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

async function categoryId(tenantId: string, externalId: string): Promise<string> {
  const row = await prisma.financialCategory.findFirst({ where: { tenantId, externalId } });
  expect(row).not.toBeNull();
  return row!.id;
}

function expensesUrl(query: string): string {
  return `/reports/expenses?${query}`;
}

function cashKpis(body: {
  payables: {
    total: string | null;
    paid: string | null;
    outstanding: string | null;
  };
}) {
  return {
    total: body.payables.total,
    paid: body.payables.paid,
    outstanding: body.payables.outstanding,
  };
}

describe('GET /reports/expenses', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
    });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@re.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@re.test');
    const response = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejeita intervalo inválido, invertido, teto e tenantId; aceita 24 meses', async () => {
    const a = await seedConnected('re-range');
    await createUser({ email: 'user@re-range.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@re-range.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/reports/expenses',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-1&to=2026-08'),
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const inverted = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-08&to=2026-01'),
      headers: { cookie },
    });
    expect(inverted.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2025-01&to=2027-01'),
      headers: { cookie },
    });
    expect(tooLarge.statusCode).toBe(400);

    const maxRange = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2025-01&to=2026-12'),
      headers: { cookie },
    });
    expect(maxRange.statusCode).toBe(200);
    expect(maxRange.json().months).toHaveLength(24);

    const tenantQuery = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&tenantId=${a.tenant.id}`),
      headers: { cookie },
    });
    expect(tenantQuery.statusCode).toBe(400);
  });

  it('agrega vários meses, isola tenant e bate com monthly-cash-flow no mesmo mês', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const current = civilMonthBounds(today);
    const prevFrom = new Date(Date.UTC(current.from.getUTCFullYear(), current.from.getUTCMonth() - 1, 1));
    const prev = civilMonthBounds(prevFrom);
    const a = await seedConnected('re-a');
    const b = await seedConnected('re-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };

    await financial.upsertCategories(scopeA, [
      {
        externalId: 'alug',
        name: 'Aluguel',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
      {
        externalId: 'serv',
        name: 'Serviços',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertPayables(scopeA, [
      installment({
        externalId: 'cur-open',
        dueDate: current.to,
        unpaid: '10000',
        categoryExternalIds: ['alug'],
      }),
      installment({
        externalId: 'prev-paid',
        dueDate: prev.from,
        unpaid: '0',
        paid: '4000',
        status: 'PAID',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'cur-paid',
        dueDate: current.from,
        unpaid: '0',
        paid: '5000',
        status: 'PAID',
        categoryExternalIds: ['alug'],
      }),
    ]);
    await financial.upsertPayables(scopeB, [
      installment({
        externalId: 'other-tenant',
        dueDate: current.from,
        unpaid: '0',
        paid: '333',
        status: 'PAID',
        categoryExternalIds: ['alug'],
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'PAYABLE', [
      baixa({
        id: 'prev-b',
        installmentId: 'prev-paid',
        data: iso(prev.from),
        bruto: '4000',
        liquido: '4000',
      }),
      baixa({
        id: 'cur-b',
        installmentId: 'cur-paid',
        data: iso(current.from),
        bruto: '5000',
        liquido: '5000',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'PAYABLE', [
      baixa({
        id: 'other-b',
        installmentId: 'other-tenant',
        data: iso(current.from),
        bruto: '333',
        liquido: '333',
      }),
    ]);

    await createUser({ email: 'user-a@re.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@re.test', role: 'USER', tenantId: b.tenant.id });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@re.test');
    const cookieB = await loginAs(app, 'user-b@re.test');

    const empty = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2024-01&to=2024-01'),
      headers: { cookie: cookieA },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().payables.total).toBe('0');
    expect(empty.json().payables.coverageRate).toBeNull();
    expect(empty.json().months).toEqual([expect.objectContaining({ monthKey: '2024-01' })]);

    const range = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${prev.monthKey}&to=${current.monthKey}`),
      headers: { cookie: cookieA },
    });
    expect(range.statusCode).toBe(200);
    expect(range.headers['cache-control']).toBe('private, no-store');
    const body = range.json() as {
      from: string;
      to: string;
      payables: {
        total: string;
        paid: string | null;
        outstanding: string | null;
        items: ReadonlyArray<{ name: string; amount: string; paid: string | null }>;
      };
      months: ReadonlyArray<{ monthKey: string; payables: { total: string; daily: unknown[] } }>;
    };
    expect(body.from).toBe(prev.monthKey);
    expect(body.to).toBe(current.monthKey);
    expect(body.payables.paid).toBe('9000');
    expect(body.payables.outstanding).toBe('10000');
    expect(body.payables.total).toBe('19000');
    expect(body.months.map((month) => month.monthKey)).toEqual([prev.monthKey, current.monthKey]);
    expect(body.months[0]?.payables.total).toBe('4000');
    expect(body.months[1]?.payables.total).toBe('15000');
    expect(Array.isArray(body.months[0]?.payables.daily)).toBe(true);
    expect(body.payables.items.find((item) => item.name === 'Aluguel')?.amount).toBe('5000');
    expect(body.payables.items.find((item) => item.name === 'Serviços')?.amount).toBe('4000');
    expect(JSON.stringify(body)).not.toContain('333');
    expect('daily' in body.payables).toBe(false);

    const cashFlow = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${current.monthKey}`,
      headers: { cookie: cookieA },
    });
    expect(cashFlow.statusCode).toBe(200);
    const single = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${current.monthKey}&to=${current.monthKey}`),
      headers: { cookie: cookieA },
    });
    expect(single.statusCode).toBe(200);
    const cash = cashFlow.json();
    const expectedTotal = new Prisma.Decimal(cash.realized.outflows)
      .plus(cash.expected.payables)
      .toString();
    expect(single.json().payables.paid).toBe(cash.realized.outflows);
    expect(single.json().payables.outstanding).toBe(cash.expected.payables);
    expect(single.json().payables.total).toBe(expectedTotal);
    expect(Array.isArray(single.json().months[0].payables.daily)).toBe(true);

    const other = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${prev.monthKey}&to=${current.monthKey}`),
      headers: { cookie: cookieB },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().payables.total).toBe('333');
    expect(JSON.stringify(other.json())).not.toContain('10000');
  });

  it('ignora situation e aplica category no motor de caixa', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to, monthKey } = civilMonthBounds(today);
    const a = await seedConnected('re-filters');
    const scope = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    await financial.upsertCategories(scope, [
      {
        externalId: 'alug',
        name: 'Aluguel',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
      {
        externalId: 'serv',
        name: 'Serviços',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
      {
        externalId: 'vendas',
        name: 'Vendas',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertPayables(scope, [
      installment({
        externalId: 'paid-alug',
        dueDate: from,
        unpaid: '0',
        paid: '100',
        status: 'PAID',
        categoryExternalIds: ['alug'],
      }),
      installment({
        externalId: 'open-alug',
        dueDate: to,
        unpaid: '40',
        categoryExternalIds: ['alug'],
      }),
      installment({
        externalId: 'paid-serv',
        dueDate: from,
        unpaid: '0',
        paid: '25',
        status: 'PAID',
        categoryExternalIds: ['serv'],
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'PAYABLE', [
      baixa({
        id: 'paid-alug-b',
        installmentId: 'paid-alug',
        data: iso(from),
        bruto: '100',
        liquido: '100',
      }),
      baixa({
        id: 'paid-serv-b',
        installmentId: 'paid-serv',
        data: iso(from),
        bruto: '25',
        liquido: '25',
      }),
    ]);
    const alugId = await categoryId(a.tenant.id, 'alug');
    const vendasId = await categoryId(a.tenant.id, 'vendas');
    await createUser({ email: 'user@re-filters.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@re-filters.test');

    const baseline = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}`),
      headers: { cookie },
    });
    expect(baseline.statusCode).toBe(200);
    const baseKpis = cashKpis(baseline.json());
    expect(baseKpis).toEqual({ total: '165', paid: '125', outstanding: '40' });

    for (const situation of ['settled', 'open', 'overdue'] as const) {
      const filtered = await app.inject({
        method: 'GET',
        url: expensesUrl(`from=${monthKey}&to=${monthKey}&situation=${situation}`),
        headers: { cookie },
      });
      expect(filtered.statusCode).toBe(200);
      expect(cashKpis(filtered.json())).toEqual(baseKpis);
    }

    const named = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}&category=${alugId}`),
      headers: { cookie },
    });
    expect(named.statusCode).toBe(200);
    expect(cashKpis(named.json())).toEqual({
      total: '140',
      paid: '100',
      outstanding: '40',
    });

    const combo = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}&situation=settled&category=${alugId}`),
      headers: { cookie },
    });
    expect(combo.statusCode).toBe(200);
    expect(cashKpis(combo.json())).toEqual(cashKpis(named.json()));

    const revenueOnAp = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}&category=${vendasId}`),
      headers: { cookie },
    });
    expect(revenueOnAp.statusCode).toBe(200);
    expect(cashKpis(revenueOnAp.json())).toEqual({
      total: '0',
      paid: '0',
      outstanding: '0',
    });

    const invalidSituation = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}&situation=PAID`),
      headers: { cookie },
    });
    expect(invalidSituation.statusCode).toBe(400);

    const missingCategory = await app.inject({
      method: 'GET',
      url: expensesUrl(
        `from=${monthKey}&to=${monthKey}&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403`,
      ),
      headers: { cookie },
    });
    expect(missingCategory.statusCode).toBe(404);
  });

  it('respeita costCenter (CC1) e Support Mode', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { to, monthKey } = civilMonthBounds(today);
    const a = await seedConnected('re-cc');
    const b = await seedConnected('re-cc-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };
    await financial.upsertCategories(scopeA, [
      {
        externalId: 'alug',
        name: 'Aluguel',
        type: 'EXPENSE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertPayables(scopeA, [
      installment({
        externalId: 'p1',
        dueDate: to,
        unpaid: '10000',
        categoryExternalIds: ['alug'],
      }),
    ]);
    await financial.upsertPayables(scopeB, [
      installment({
        externalId: 'b1',
        dueDate: to,
        unpaid: '0',
        paid: '777',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'PAYABLE', [
      baixa({
        id: 'b1-b',
        installmentId: 'b1',
        data: iso(civilMonthBoundsFromKey(monthKey).from),
        bruto: '777',
        liquido: '777',
      }),
    ]);
    const payable = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'p1' },
    });
    const centerA = await prisma.costCenter.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        externalId: 'cc-a',
        code: 'A',
        name: 'Centro A',
        active: true,
        syncedAt: scopeA.syncedAt,
      },
    });
    await prisma.installmentCostCenterAllocation.create({
      data: {
        tenantId: a.tenant.id,
        costCenterId: centerA.id,
        receivableId: null,
        payableId: payable.id,
        amount: new Prisma.Decimal('3000'),
        syncedAt: scopeA.syncedAt,
      },
    });

    await createUser({ email: 'user@re-cc.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'admin@re-cc.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const userCookie = await loginAs(app, 'user@re-cc.test');
    const filtered = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}&costCenter=${centerA.id}`),
      headers: { cookie: userCookie },
    });
    expect(filtered.statusCode).toBe(200);
    const cashFlow = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${monthKey}&costCenter=${centerA.id}`,
      headers: { cookie: userCookie },
    });
    expect(cashFlow.statusCode).toBe(200);
    const cash = cashFlow.json();
    const expectedTotal = new Prisma.Decimal(cash.realized.outflows ?? 0)
      .plus(cash.expected.payables ?? 0)
      .toString();
    expect(filtered.json().payables.total).toBe('3000');
    expect(filtered.json().payables.outstanding).toBe('3000');
    expect(filtered.json().payables.paid).toBe(cash.realized.outflows);
    expect(filtered.json().payables.outstanding).toBe(cash.expected.payables);
    expect(filtered.json().payables.total).toBe(expectedTotal);
    // Relatório omite o campo quando o split está disponível (true).
    expect(filtered.json().costCenterCashSplit ?? true).toBe(cash.costCenterCashSplit);

    const otherCenter = await app.inject({
      method: 'GET',
      url: expensesUrl(
        `from=${monthKey}&to=${monthKey}&costCenter=8cf7b841-7d8c-4166-b24b-5f350e0d5403`,
      ),
      headers: { cookie: userCookie },
    });
    expect(otherCenter.statusCode).toBe(404);

    const adminCookie = await loginAs(app, 'admin@re-cc.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie: adminCookie, 'user-agent': 're-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    const supported = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}`),
      headers: { cookie: adminCookie },
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.json().payables.total).toBe('10000');
    expect(JSON.stringify(supported.json())).not.toContain('777');

    await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie: adminCookie },
    });
    const afterExit = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=${monthKey}&to=${monthKey}`),
      headers: { cookie: adminCookie },
    });
    expect(afterExit.statusCode).toBe(403);
  });
});
