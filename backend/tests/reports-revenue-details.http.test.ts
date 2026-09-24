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
  return values.filter((value) => /^dashboard\.sid=[^;]+/.test(value)).at(-1);
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
    encryptedAccessToken: encryptSecret('access-token-secret', environment.integrationEncryptionKey!),
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
  readonly categoryExternalIds?: readonly string[];
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: 'Nota teste',
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

function detailsUrl(query: string): string {
  return `/reports/revenue/details?${query}`;
}

describe('GET /reports/revenue/details', () => {
  it('rejeita sem sessão, situation inválida, range inválido e tenantId', async () => {
    const a = await seedConnected('rrd-val');
    await createUser({ email: 'user@rrd-val.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rrd-val.test');

    const unauth = await app.inject({ method: 'GET', url: detailsUrl('from=2026-01&to=2026-01&situation=REALIZED') });
    expect(unauth.statusCode).toBe(401);

    const missingSit = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-01&to=2026-01'),
      headers: { cookie },
    });
    expect(missingSit.statusCode).toBe(400);

    const invalidSit = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-01&to=2026-01&situation=open'),
      headers: { cookie },
    });
    expect(invalidSit.statusCode).toBe(400);

    const inverted = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-08&to=2026-01&situation=REALIZED'),
      headers: { cookie },
    });
    expect(inverted.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2025-01&to=2027-01&situation=REALIZED'),
      headers: { cookie },
    });
    expect(tooLarge.statusCode).toBe(400);

    const tenantQuery = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=2026-01&to=2026-01&situation=REALIZED&tenantId=${a.tenant.id}`),
      headers: { cookie },
    });
    expect(tenantQuery.statusCode).toBe(400);

    const badPage = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-01&to=2026-01&situation=REALIZED&limit=-1'),
      headers: { cookie },
    });
    expect(badPage.statusCode).toBe(400);
  });

  it('totalAmount fecha com o consolidado; isola tenant; aceita centro inativo', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const current = civilMonthBounds(today);
    const yesterday = addCivilDays(today, -1);
    const a = await seedConnected('rrd-a');
    const b = await seedConnected('rrd-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };

    await financial.upsertCategories(scopeA, [
      {
        externalId: 'serv',
        name: 'Serviços',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertReceivables(scopeA, [
      installment({
        externalId: 'paid',
        dueDate: current.from,
        unpaid: '0',
        paid: '2500',
        status: 'PAID',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'open',
        dueDate: current.to,
        unpaid: '400',
        categoryExternalIds: ['serv'],
      }),
      ...(yesterday.getTime() >= current.from.getTime()
        ? [
            installment({
              externalId: 'od',
              dueDate: yesterday,
              unpaid: '150',
              categoryExternalIds: ['serv'],
            }),
          ]
        : []),
    ]);
    await financial.upsertReceivables(scopeB, [
      installment({
        externalId: 'other',
        dueDate: current.from,
        unpaid: '0',
        paid: '777',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'RECEIVABLE', [
      baixa({
        id: 'paid-b',
        installmentId: 'paid',
        data: iso(current.from),
        bruto: '2500',
        liquido: '2500',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'RECEIVABLE', [
      baixa({
        id: 'other-b',
        installmentId: 'other',
        data: iso(current.from),
        bruto: '777',
        liquido: '777',
      }),
    ]);

    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'paid' },
    });
    const inactive = await prisma.costCenter.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        externalId: 'cc-old',
        code: 'D',
        name: 'Desenvolvedor',
        active: false,
        syncedAt: scopeA.syncedAt,
      },
    });
    await prisma.installmentCostCenterAllocation.create({
      data: {
        tenantId: a.tenant.id,
        costCenterId: inactive.id,
        receivableId: receivable.id,
        payableId: null,
        amount: new Prisma.Decimal('2500'),
        syncedAt: scopeA.syncedAt,
      },
    });
    await prisma.receivable.update({
      where: { id: receivable.id },
      data: {
        costCenterDetailStatus: 'FETCHED',
        costCenterDetailSyncedAt: scopeA.syncedAt,
        costCenterDetailRuleVersion: 1,
      },
    });

    await createUser({ email: 'user-a@rrd.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@rrd.test', role: 'USER', tenantId: b.tenant.id });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@rrd.test');
    const cookieB = await loginAs(app, 'user-b@rrd.test');
    const monthKey = current.monthKey;

    const report = await app.inject({
      method: 'GET',
      url: `/reports/revenue?from=${monthKey}&to=${monthKey}`,
      headers: { cookie: cookieA },
    });
    expect(report.statusCode).toBe(200);

    const realized = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED`),
      headers: { cookie: cookieA },
    });
    expect(realized.statusCode).toBe(200);
    expect(realized.json().available).toBe(true);
    expect(realized.json().totalAmount).toBe(report.json().receivables.received);
    expect(realized.json().items.every((item: { installmentKind: string }) => item.installmentKind === 'RECEIVABLE')).toBe(
      true,
    );
    expect(JSON.stringify(realized.json())).not.toContain('777');

    const expected = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=EXPECTED`),
      headers: { cookie: cookieA },
    });
    expect(expected.json().totalAmount).toBe(report.json().receivables.outstanding);

    const overdue = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=OVERDUE`),
      headers: { cookie: cookieA },
    });
    expect(overdue.json().totalAmount).toBe(report.json().receivables.overdue);

    const otherTenant = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED`),
      headers: { cookie: cookieB },
    });
    expect(otherTenant.json().totalAmount).toBe('777');
    expect(JSON.stringify(otherTenant.json())).not.toContain('2500');

    const inactiveFilter = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED&costCenter=${inactive.id}`),
      headers: { cookie: cookieA },
    });
    expect(inactiveFilter.statusCode).toBe(200);
    expect(inactiveFilter.json().totalAmount).toBe('2500');

    const unknownCenter = await app.inject({
      method: 'GET',
      url: detailsUrl(
        `from=${monthKey}&to=${monthKey}&situation=REALIZED&costCenter=8cf7b841-7d8c-4166-b24b-5f350e0d5403`,
      ),
      headers: { cookie: cookieA },
    });
    expect(unknownCenter.statusCode).toBe(404);

    const empty = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2025-01&to=2025-01&situation=REALIZED'),
      headers: { cookie: cookieA },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().items).toEqual([]);
    expect(empty.json().totalAmount).toBe('0');
    expect(empty.json().itemCount).toBe(0);

    const page = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED&limit=1&offset=0`),
      headers: { cookie: cookieA },
    });
    expect(page.json().items.length).toBeLessThanOrEqual(1);
    expect(page.json().totalAmount).toBe(realized.json().totalAmount);
    expect(page.json().itemCount).toBe(realized.json().itemCount);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@rrd.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@rrd.test');
    const response = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-01&to=2026-01&situation=REALIZED'),
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('categoria de outro tenant é 404; paginação da última página é vazia', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { monthKey } = civilMonthBounds(today);
    const a = await seedConnected('rrd-cat');
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await createUser({ email: 'user@rrd-cat.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rrd-cat.test');
    const missingCat = await app.inject({
      method: 'GET',
      url: detailsUrl(
        `from=${monthKey}&to=${monthKey}&situation=REALIZED&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403`,
      ),
      headers: { cookie },
    });
    expect(missingCat.statusCode).toBe(404);

    const lastPage = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED&limit=10&offset=50`),
      headers: { cookie },
    });
    expect(lastPage.statusCode).toBe(200);
    expect(lastPage.json().items).toEqual([]);
    expect(lastPage.json().totalAmount).toBe('0');
  });

  it('range de 24 meses é aceito', async () => {
    const a = await seedConnected('rrd-max');
    await createUser({ email: 'user@rrd-max.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rrd-max.test');
    const from = civilMonthBoundsFromKey('2024-10');
    const to = civilMonthBoundsFromKey('2026-09');
    const ok = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${from.monthKey}&to=${to.monthKey}&situation=REALIZED`),
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
  });
});
