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
  civilMonthKey,
  listInclusiveMonthKeysFromKeys,
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
import {
  CASH_MOVEMENT_HISTORY_MONTHS,
  listRevenueGoalHistoryMonthKeys,
  shiftRevenueGoalMonthKey,
} from '../src/modules/dashboard/index.js';
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
  readonly tipo?: 'RECEITA' | 'DESPESA';
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
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

describe('GET /dashboard/cash-movement-history', () => {
  it('rejeita sem sessão e tenantId arbitrário', async () => {
    const seeded = await seedConnected('cmh-auth');
    await createUser({ email: 'user-auth@cmh.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();

    const anonymous = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-movement-history',
    });
    expect(anonymous.statusCode).toBe(401);

    const cookie = await loginAs(app, 'user-auth@cmh.test');
    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-movement-history?tenantId=${seeded.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('retorna exatamente 12 buckets cronológicos com endMonth/startMonth corretos e virada de ano', async () => {
    const endMonth = '2026-09';
    const expectedKeys = listRevenueGoalHistoryMonthKeys(endMonth, CASH_MOVEMENT_HISTORY_MONTHS);
    expect(expectedKeys).toHaveLength(12);
    expect(expectedKeys[0]).toBe('2025-10');
    expect(expectedKeys[11]).toBe('2026-09');
    expect(listInclusiveMonthKeysFromKeys(expectedKeys[0]!, expectedKeys[11]!)).toEqual(
      expectedKeys,
    );

    const seeded = await seedConnected('cmh-window');
    await createUser({ email: 'user-window@cmh.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-window@cmh.test');
    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-movement-history?month=${endMonth}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = response.json();
    expect(body.endMonth).toBe(endMonth);
    expect(body.startMonth).toBe('2025-10');
    expect(body.months).toHaveLength(12);
    expect(body.months.map((m: { monthKey: string }) => m.monthKey)).toEqual(expectedKeys);
    for (const month of body.months) {
      expect(month.realized.inflows).toBe('0');
      expect(month.realized.outflows).toBe('0');
      expect(month.realized.result).toBe('0');
    }
  });

  it('reconcilia cada bucket com monthly-cash-flow e isola tenant', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const endMonth = civilMonthKey(today);
    const midKey = shiftRevenueGoalMonthKey(endMonth, -3);
    const midBounds = civilMonthBounds(
      new Date(Date.UTC(Number(midKey.slice(0, 4)), Number(midKey.slice(5, 7)) - 1, 15)),
    );
    const a = await seedConnected('cmh-a');
    const b = await seedConnected('cmh-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };

    await financial.upsertReceivables(scopeA, [
      installment({
        externalId: 'r-a',
        dueDate: midBounds.from,
        unpaid: '0',
        paid: '1500',
        status: 'PAID',
      }),
    ]);
    await financial.upsertPayables(scopeA, [
      installment({
        externalId: 'p-a',
        dueDate: midBounds.from,
        unpaid: '0',
        paid: '400',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'RECEIVABLE', [
      baixa({
        id: 'in-a',
        installmentId: 'r-a',
        data: iso(midBounds.from),
        bruto: '1500',
        liquido: '1500',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'PAYABLE', [
      baixa({
        id: 'out-a',
        installmentId: 'p-a',
        data: iso(midBounds.from),
        bruto: '400',
        liquido: '400',
        tipo: 'DESPESA',
      }),
    ]);
    await financial.upsertReceivables(scopeB, [
      installment({
        externalId: 'r-b',
        dueDate: midBounds.from,
        unpaid: '0',
        paid: '9999',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'RECEIVABLE', [
      baixa({
        id: 'in-b',
        installmentId: 'r-b',
        data: iso(midBounds.from),
        bruto: '9999',
        liquido: '9999',
      }),
    ]);

    await createUser({ email: 'user-a@cmh.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@cmh.test');

    const history = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/cash-movement-history?month=${endMonth}`,
        headers: { cookie },
      })
    ).json();

    expect(history.months).toHaveLength(12);
    const json = JSON.stringify(history);
    expect(json).not.toContain('9999');
    expect(json).not.toContain('tenantId');

    for (const bucket of history.months) {
      const monthly = (
        await app.inject({
          method: 'GET',
          url: `/dashboard/monthly-cash-flow?month=${bucket.monthKey}`,
          headers: { cookie },
        })
      ).json();
      expect(bucket.realized.inflows).toBe(monthly.realized.inflows);
      expect(bucket.realized.outflows).toBe(monthly.realized.outflows);
      expect(bucket.realized.result).toBe(monthly.realized.result);
    }

    const mid = history.months.find((m: { monthKey: string }) => m.monthKey === midKey);
    expect(mid.realized.inflows).toBe('1500');
    expect(mid.realized.outflows).toBe('400');
    expect(mid.realized.result).toBe('1100');
  });

  it('filtra categoria e preserva null de CC unavailable', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const seeded = await seedConnected('cmh-filters');
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
        unpaid: '0',
        paid: '250',
        status: 'PAID',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'other-cat',
        dueDate: to,
        unpaid: '0',
        paid: '80',
        status: 'PAID',
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
        id: 'b-precise',
        installmentId: 'precise',
        data: iso(from),
        bruto: '250',
        liquido: '250',
      }),
      baixa({
        id: 'b-other',
        installmentId: 'other-cat',
        data: iso(from),
        bruto: '80',
        liquido: '80',
      }),
      baixa({
        id: 'b-partial',
        installmentId: 'partial',
        data: iso(from),
        bruto: '400',
        liquido: '400',
      }),
    ]);

    await createUser({ email: 'user-f@cmh.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-f@cmh.test');

    const byCategory = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/cash-movement-history?month=${monthKey}&category=${category.id}`,
        headers: { cookie },
      })
    ).json();
    const catBucket = byCategory.months.find((m: { monthKey: string }) => m.monthKey === monthKey);
    const monthlyCat = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}&category=${category.id}`,
        headers: { cookie },
      })
    ).json();
    expect(catBucket.realized).toEqual(monthlyCat.realized);
    expect(catBucket.realized.inflows).toBe('250');

    const byCenter = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/cash-movement-history?month=${monthKey}&costCenter=${centerA.id}`,
        headers: { cookie },
      })
    ).json();
    expect(byCenter.costCenterCashSplit).toBe(false);
    const ccBucket = byCenter.months.find((m: { monthKey: string }) => m.monthKey === monthKey);
    const monthlyCc = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}&costCenter=${centerA.id}`,
        headers: { cookie },
      })
    ).json();
    expect(ccBucket.realized.inflows).toBeNull();
    expect(ccBucket.realized.outflows).toBeNull();
    expect(ccBucket.realized.result).toBeNull();
    expect(ccBucket.realized).toEqual(monthlyCc.realized);
  });

  it('exclui settlement DELETED do histórico (paridade com monthly-cash-flow)', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const seeded = await seedConnected('cmh-life');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'alive',
        dueDate: from,
        unpaid: '0',
        paid: '100',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'keep',
        installmentId: 'alive',
        data: iso(from),
        bruto: '100',
        liquido: '100',
      }),
      baixa({
        id: 'gone',
        installmentId: 'alive',
        data: iso(from),
        bruto: '50',
        liquido: '50',
      }),
    ]);
    await prisma.financialTransaction.updateMany({
      where: { tenantId: seeded.tenant.id, externalId: 'gone' },
      data: { lifecycleStatus: 'DELETED' },
    });

    await createUser({ email: 'user-life@cmh.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-life@cmh.test');
    const history = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/cash-movement-history?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();
    const monthly = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();
    const bucket = history.months.find((m: { monthKey: string }) => m.monthKey === monthKey);
    expect(bucket.realized.inflows).toBe('100');
    expect(bucket.realized).toEqual(monthly.realized);
  });
});
