import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBounds, civilMonthKey } from '../src/modules/analytics/domain/civil-calendar.js';
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
  readonly juros?: string;
  readonly multa?: string;
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.liquido,
      juros: input.juros ?? '0',
      multa: input.multa ?? '0',
      desconto: '0',
      taxa: '0',
    },
  });
}

describe('GET /dashboard/monthly-cash-flow', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/monthly-cash-flow' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@mcf.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@mcf.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-cash-flow',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('month inválido 400; ausente = mês corrente; tenantId rejeitado', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const monthKey = civilMonthKey(today);
    const a = await seedConnected('mcf-month');
    await createUser({ email: 'user-month@mcf.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-month@mcf.test');

    const current = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-cash-flow',
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().monthKey).toBe(monthKey);
    expect(current.headers['cache-control']).toBe('private, no-store');

    const explicit = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
      headers: { cookie },
    });
    expect(explicit.statusCode).toBe(200);
    expect(explicit.json().monthKey).toBe(monthKey);

    const invalid = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-cash-flow?month=2026-13',
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?tenantId=${a.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('billing A/B/C, isolation, net, occurredOn, dueDate==today, daily separado', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const prevLast = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
    const a = await seedConnected('mcf-a');
    const b = await seedConnected('mcf-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };

    await financial.upsertReceivables(scopeA, [
      installment({ externalId: 'open', dueDate: to, unpaid: '15000' }),
      installment({
        externalId: 'today-due',
        dueDate: today,
        unpaid: '5000',
      }),
      installment({
        externalId: 'late',
        dueDate: prevLast,
        unpaid: '5000',
      }),
      installment({
        externalId: 'paid-net',
        dueDate: from,
        unpaid: '0',
        paid: '294',
        status: 'PAID',
        competenceDate: prevLast,
      }),
    ]);
    await financial.upsertReceivables(scopeB, [
      installment({ externalId: 'other-tenant', dueDate: to, unpaid: '333' }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'RECEIVABLE', [
      baixa({
        id: 'net-b',
        installmentId: 'paid-net',
        data: iso(from),
        bruto: '294.00',
        liquido: '301.05',
        juros: '1.17',
        multa: '5.88',
      }),
      baixa({
        id: 'multi-1',
        installmentId: 'paid-net',
        data: iso(from),
        bruto: '10000',
        liquido: '10000',
      }),
      baixa({
        id: 'multi-2',
        installmentId: 'paid-net',
        data: iso(from),
        bruto: '1550',
        liquido: '1550',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'RECEIVABLE', [
      baixa({
        id: 'other-b',
        installmentId: 'other-tenant',
        data: iso(from),
        bruto: '999',
        liquido: '999',
      }),
    ]);

    await createUser({ email: 'user-a@mcf.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@mcf.test');
    const ok = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${monthKey}&situation=overdue`,
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(typeof body.realized.inflows).toBe('string');
    expect(body.realized.inflows).toBe('11851.05');
    expect(body.expected.receivables).toBe('20000');
    expect(body.overdue.receivables).toBe('5000');
    expect(body.billing).toBe('31851.05');
    expect(Array.isArray(body.daily.realized)).toBe(true);
    expect(Array.isArray(body.daily.expected)).toBe(true);
    expect(body.daily.realized[0]).toHaveProperty('inflows');
    expect(body.daily.expected[0]).toHaveProperty('receivables');
    expect(body.daily.realized[0]).not.toHaveProperty('receivables');
    expect(body.daily.expected[0]).not.toHaveProperty('inflows');
    const json = JSON.stringify(body);
    expect(json).not.toContain('333');
    expect(json).not.toContain('999');
    expect(json).not.toContain('descricao-secreta-nao-vazar');
    expect(json).not.toContain('tenantId');

    const revenue = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(revenue.statusCode).toBe(200);
  });

  it('C — overdue 20000 fora do billing; D — vencido dueDate < today', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const prevLast = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
    const seeded = await seedConnected('mcf-c');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({ externalId: 'over', dueDate: prevLast, unpaid: '20000' }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'r',
        installmentId: 'ghost',
        data: iso(from),
        bruto: '80000',
        liquido: '80000',
      }),
    ]);
    await createUser({ email: 'user-c@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-c@mcf.test');
    const body = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();
    expect(body.realized.inflows).toBe('80000');
    expect(body.expected.receivables).toBe('0');
    expect(body.overdue.receivables).toBe('20000');
    expect(body.billing).toBe('80000');
  });

  it('E/F — pagamento tardio mesmo mês (se possível) e mês seguinte', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const prevFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
    const prevKey = civilMonthKey(prevFrom);
    const prevLast = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
    const seeded = await seedConnected('mcf-late');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'next-month',
        dueDate: prevLast,
        unpaid: '0',
        paid: '5000',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'oct-like',
        installmentId: 'next-month',
        data: iso(from),
        bruto: '5000',
        liquido: '5000',
      }),
    ]);
    await createUser({ email: 'user-late@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-late@mcf.test');

    const previous = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${prevKey}`,
        headers: { cookie },
      })
    ).json();
    expect(previous.realized.inflows).toBe('0');
    expect(previous.billing).toBe('0');

    const current = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();
    expect(current.realized.inflows).toBe('5000');
    expect(current.billing).toBe('5000');

    if (today.getUTCDate() > 1) {
      await financial.upsertReceivables(scope, [
        installment({
          externalId: 'same-month',
          dueDate: from,
          unpaid: '7000',
        }),
      ]);
      const before = (
        await app.inject({
          method: 'GET',
          url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
          headers: { cookie },
        })
      ).json();
      expect(before.overdue.receivables).toBe('7000');
      expect(before.billing).toBe('5000');

      await financial.upsertReceivables(scope, [
        installment({
          externalId: 'same-month',
          dueDate: from,
          unpaid: '0',
          paid: '7000',
          status: 'PAID',
        }),
      ]);
      await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
        baixa({
          id: 'same-b',
          installmentId: 'same-month',
          data: iso(to.getUTCDate() >= today.getUTCDate() ? today : to),
          bruto: '7000',
          liquido: '7000',
        }),
      ]);
      const after = (
        await app.inject({
          method: 'GET',
          url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
          headers: { cookie },
        })
      ).json();
      expect(after.realized.inflows).toBe('12000');
      expect(after.overdue.receivables).toBe('0');
      expect(after.expected.receivables).toBe('0');
      expect(after.billing).toBe('12000');
    }
  });

  it('filtra categoria D8 e preserva null em CC multi parcial', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const seeded = await seedConnected('mcf-filters');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertCategories(scope, [
      {
        externalId: 'serv',
        name: 'Serviços',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'precise',
        dueDate: to,
        unpaid: '20',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'imprecise',
        dueDate: to,
        unpaid: '20',
        categoryExternalIds: ['serv', 'outro'],
      }),
      installment({
        externalId: 'partial',
        dueDate: to,
        unpaid: '600',
        paid: '400',
        total: '1000',
        status: 'PARTIALLY_PAID',
      }),
    ]);
    const category = await prisma.financialCategory.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'serv' },
    });
    const centerA = await prisma.costCenter.create({
      data: {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'cc-a',
        code: 'A',
        name: 'Centro A',
        active: true,
        syncedAt: scope.syncedAt,
      },
    });
    const centerB = await prisma.costCenter.create({
      data: {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'cc-b',
        code: 'B',
        name: 'Centro B',
        active: true,
        syncedAt: scope.syncedAt,
      },
    });
    const partial = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'partial' },
    });
    await prisma.installmentCostCenterAllocation.createMany({
      data: [
        {
          tenantId: seeded.tenant.id,
          receivableId: partial.id,
          costCenterId: centerA.id,
          amount: new Prisma.Decimal('600'),
          syncedAt: scope.syncedAt,
        },
        {
          tenantId: seeded.tenant.id,
          receivableId: partial.id,
          costCenterId: centerB.id,
          amount: new Prisma.Decimal('400'),
          syncedAt: scope.syncedAt,
        },
      ],
    });
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'part-b',
        installmentId: 'partial',
        data: iso(from),
        bruto: '400',
        liquido: '400',
      }),
    ]);

    await createUser({ email: 'user-f@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-f@mcf.test');

    const byCategory = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}&category=${category.id}`,
        headers: { cookie },
      })
    ).json();
    expect(byCategory.expected.receivables).toBe('20');

    const byCenter = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}&costCenter=${centerA.id}`,
        headers: { cookie },
      })
    ).json();
    expect(byCenter.costCenterCashSplit).toBe(false);
    expect(byCenter.realized.inflows).toBeNull();
    expect(byCenter.billing).toBeNull();
  });
});
