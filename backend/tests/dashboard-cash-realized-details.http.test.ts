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
  readonly categoryExternalIds?: readonly string[];
  readonly description?: string;
  readonly externalPartyId?: string | null;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.description ?? 'descricao',
    dueDate: input.dueDate,
    competenceDate: input.dueDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'PAID',
    upstreamStatus: input.status ?? 'PAID',
    total,
    paid,
    unpaid,
    externalPartyId: input.externalPartyId ?? null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

function baixa(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly data: string;
  readonly liquido: string;
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: 'RECEITA',
    valor_composicao: {
      valor_bruto: input.liquido,
      valor_liquido: input.liquido,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
  });
}

describe('GET /dashboard/cash-realized/details (12-B)', () => {
  it('exige direction e categoryKey; rejeita tenantId', async () => {
    const seeded = await seedConnected('crd-query');
    await createUser({ email: 'user@crd-query.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@crd-query.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-realized/details',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    const hijack = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-realized/details?direction=inflows&categoryKey=x&tenantId=abc',
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('reconcilia com monthly-cash-flow; key; paginação; isolamento', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const day = iso(from);

    const a = await seedConnected('crd-a');
    const b = await seedConnected('crd-b');
    await createUser({ email: 'user-a@crd.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@crd.test', role: 'USER', tenantId: b.tenant.id });

    for (const seeded of [a, b]) {
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
      await financial.upsertParties(scope, [
        {
          externalId: 'party-1',
          name: seeded === a ? 'Cliente A' : 'Cliente B',
          document: null,
          active: true,
          profiles: ['CUSTOMER'],
        },
      ]);
      await financial.upsertReceivables(scope, [
        installment({
          externalId: 'ar-1',
          dueDate: from,
          paid: '60',
          unpaid: '0',
          categoryExternalIds: ['serv'],
          description: 'Baixa A',
          externalPartyId: 'party-1',
        }),
      ]);
      await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
        baixa({ id: 's1', installmentId: 'ar-1', data: day, liquido: '30' }),
        baixa({ id: 's2', installmentId: 'ar-1', data: day, liquido: '20' }),
        baixa({ id: 's3', installmentId: 'ar-1', data: day, liquido: '10' }),
      ]);
    }

    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@crd.test');
    const cookieB = await loginAs(app, 'user-b@crd.test');

    const cashFlow = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
      headers: { cookie: cookieA },
    });
    expect(cashFlow.statusCode).toBe(200);
    const composition = cashFlow.json().realizedByCategory.inflows;
    expect(composition.items[0].key).toBe('serv');
    expect(composition.items[0].amount).toBe('60');

    const details = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-realized/details?month=${monthKey}&direction=inflows&categoryKey=serv&limit=2&offset=0`,
      headers: { cookie: cookieA },
    });
    expect(details.statusCode).toBe(200);
    expect(details.headers['cache-control']).toBe('private, no-store');
    const body = details.json();
    expect(body.total).toBe(composition.items[0].amount);
    expect(body.itemCount).toBe(3);
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item: { partyName: string | null }) => item.partyName === 'Cliente A')).toBe(
      true,
    );

    const page2 = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-realized/details?month=${monthKey}&direction=inflows&categoryKey=serv&limit=2&offset=2`,
      headers: { cookie: cookieA },
    });
    expect(page2.json().total).toBe('60');
    expect(page2.json().items).toHaveLength(1);

    const isolated = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-realized/details?month=${monthKey}&direction=inflows&categoryKey=serv`,
      headers: { cookie: cookieB },
    });
    expect(isolated.json().total).toBe('60');
    expect(
      isolated.json().items.every((item: { partyName: string | null }) => item.partyName === 'Cliente B'),
    ).toBe(true);
  });
});
