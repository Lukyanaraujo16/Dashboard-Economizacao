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
  readonly competenceDate: Date | null;
  readonly dueDate?: Date;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total);
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? total.minus(paid).toString());
  const today = civilTodayInSaoPaulo(new Date());
  return {
    externalId: input.externalId,
    description: 'parcela',
    dueDate: input.dueDate ?? today,
    competenceDate: input.competenceDate,
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

describe('GET /dashboard/cost-centers', () => {
  it('lista ativos primeiro e depois por nome; rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const unauth = await app.inject({ method: 'GET', url: '/dashboard/cost-centers' });
    expect(unauth.statusCode).toBe(401);

    const seeded = await seedConnected('cc-list');
    await createUser({
      email: 'user@cc-list.test',
      role: 'USER',
      tenantId: seeded.tenant.id,
    });
    const cookie = await loginAs(app, 'user@cc-list.test');
    const syncedAt = new Date();
    await prisma.costCenter.createMany({
      data: [
        {
          tenantId: seeded.tenant.id,
          integrationId: seeded.integration.id,
          externalId: 'cc-b',
          code: 'B',
          name: 'Bravo',
          active: true,
          syncedAt,
        },
        {
          tenantId: seeded.tenant.id,
          integrationId: seeded.integration.id,
          externalId: 'cc-a',
          code: null,
          name: 'Alpha',
          active: false,
          syncedAt,
        },
        {
          tenantId: seeded.tenant.id,
          integrationId: seeded.integration.id,
          externalId: 'cc-c',
          code: 'C',
          name: 'Charlie',
          active: true,
          syncedAt,
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cost-centers',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ id: string; name: string; code: string | null; active: boolean }>;
    };
    expect(body.items.map((item) => item.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(body.items[0]?.active).toBe(true);
    expect(body.items[2]?.active).toBe(false);
    expect(body.items[2]?.code).toBeNull();
  });
});

describe('GET /dashboard/monthly-revenue?costCenter=', () => {
  it('sem filtro mantém consolidado; com filtro usa Σ allocation e null no cash split', async () => {
    const app = await buildTestApp();
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const seeded = await seedConnected('cc-mr');
    await createUser({
      email: 'user@cc-mr.test',
      role: 'USER',
      tenantId: seeded.tenant.id,
    });
    const cookie = await loginAs(app, 'user@cc-mr.test');
    const syncedAt = new Date();

    await financial.upsertCategories(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
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
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'r1',
          status: 'OPEN',
          total: '10000',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'r2',
          status: 'OPEN',
          total: '4000',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );

    const receivables = await prisma.receivable.findMany({
      where: { tenantId: seeded.tenant.id },
      orderBy: { externalId: 'asc' },
    });
    expect(receivables).toHaveLength(2);

    const centerA = await prisma.costCenter.create({
      data: {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        externalId: 'cc-a',
        code: 'A',
        name: 'Centro A',
        active: true,
        syncedAt,
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
        syncedAt,
      },
    });

    await prisma.installmentCostCenterAllocation.createMany({
      data: [
        {
          tenantId: seeded.tenant.id,
          costCenterId: centerA.id,
          receivableId: receivables[0]!.id,
          payableId: null,
          amount: new Prisma.Decimal('3000'),
          syncedAt,
        },
        {
          tenantId: seeded.tenant.id,
          costCenterId: centerB.id,
          receivableId: receivables[0]!.id,
          payableId: null,
          amount: new Prisma.Decimal('7000'),
          syncedAt,
        },
        {
          tenantId: seeded.tenant.id,
          costCenterId: centerA.id,
          receivableId: receivables[1]!.id,
          payableId: null,
          amount: new Prisma.Decimal('1000'),
          syncedAt,
        },
      ],
    });

    const consolidated = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(consolidated.statusCode).toBe(200);
    const consolidatedBody = consolidated.json() as {
      costCenterCashSplit?: boolean;
      receivables: {
        total: string;
        received: string | null;
        outstanding: string | null;
        overdue: string | null;
      };
    };
    expect(consolidatedBody.costCenterCashSplit).toBeUndefined();
    expect(consolidatedBody.receivables.total).toBe('14000');
    expect(consolidatedBody.receivables.received).toBe('0');
    expect(consolidatedBody.receivables.outstanding).toBe('14000');

    const filtered = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?costCenter=${centerA.id}`,
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json() as {
      costCenterCashSplit?: boolean;
      receivables: {
        total: string;
        received: string | null;
        outstanding: string | null;
        overdue: string | null;
        items: Array<{ amount: string; received: string | null }>;
      };
    };
    expect(filteredBody.costCenterCashSplit).toBeUndefined();
    expect(filteredBody.receivables.total).toBe('4000');
    // Multi + paid≈0 → EXACT (outstanding = allocation); CC1.3 híbrido.
    expect(filteredBody.receivables.received).toBe('0');
    expect(filteredBody.receivables.outstanding).toBe('4000');
    expect(filteredBody.receivables.overdue).toBe('0');
    expect(filteredBody.receivables.items[0]?.amount).toBe('4000');
    expect(filteredBody.receivables.items[0]?.received).toBeNull();
    // CC1.3.2 — série diária com cash EXACT (não null).
    const filteredDaily = (
      filteredBody.receivables as {
        daily?: Array<{ received: string | null; outstanding: string | null; amount: string }>;
      }
    ).daily;
    expect(filteredDaily?.length).toBeGreaterThan(0);
    expect(filteredDaily?.every((point) => point.received !== null && point.outstanding !== null)).toBe(
      true,
    );
    const sumReceived = filteredDaily!.reduce((acc, point) => acc + Number(point.received), 0);
    const sumOutstanding = filteredDaily!.reduce((acc, point) => acc + Number(point.outstanding), 0);
    expect(sumReceived).toBe(0);
    expect(sumOutstanding).toBe(4000);

    const unknown = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?costCenter=8cf7b841-7d8c-4166-b24b-5f350e0d5403',
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);

    const invalid = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?costCenter=not-uuid',
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
