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
  readonly status?: FinancialInstallmentStatus;
  readonly categoryExternalIds?: readonly string[];
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = unpaid.plus(paid);
  return {
    externalId: input.externalId,
    description: 'Conta teste',
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

function detailsUrl(query: string): string {
  return `/reports/expenses/details?${query}`;
}

describe('GET /reports/expenses/details', () => {
  it('totalAmount fecha com o consolidado e não mistura receita', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const current = civilMonthBounds(today);
    const yesterday = addCivilDays(today, -1);
    const a = await seedConnected('red-a');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
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
        externalId: 'paid',
        dueDate: current.from,
        unpaid: '0',
        paid: '800',
        status: 'PAID',
        categoryExternalIds: ['alug'],
      }),
      installment({
        externalId: 'open',
        dueDate: current.to,
        unpaid: '120',
        categoryExternalIds: ['alug'],
      }),
      ...(yesterday.getTime() >= current.from.getTime()
        ? [
            installment({
              externalId: 'od',
              dueDate: yesterday,
              unpaid: '40',
              categoryExternalIds: ['alug'],
            }),
          ]
        : []),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'PAYABLE', [
      baixa({
        id: 'paid-b',
        installmentId: 'paid',
        data: iso(current.from),
        bruto: '800',
        liquido: '800',
      }),
    ]);
    await createUser({ email: 'user@red.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@red.test');
    const monthKey = current.monthKey;

    const report = await app.inject({
      method: 'GET',
      url: `/reports/expenses?from=${monthKey}&to=${monthKey}`,
      headers: { cookie },
    });
    expect(report.statusCode).toBe(200);

    const realized = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=REALIZED`),
      headers: { cookie },
    });
    expect(realized.statusCode).toBe(200);
    expect(realized.json().totalAmount).toBe(report.json().payables.paid);
    expect(realized.json().items.every((item: { installmentKind: string }) => item.installmentKind === 'PAYABLE')).toBe(
      true,
    );

    const expected = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=EXPECTED`),
      headers: { cookie },
    });
    expect(expected.json().totalAmount).toBe(report.json().payables.outstanding);

    const overdue = await app.inject({
      method: 'GET',
      url: detailsUrl(`from=${monthKey}&to=${monthKey}&situation=OVERDUE`),
      headers: { cookie },
    });
    expect(overdue.json().totalAmount).toBe(report.json().payables.overdue);
  });

  it('rejeita situation inválida', async () => {
    const a = await seedConnected('red-val');
    await createUser({ email: 'user@red-val.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@red-val.test');
    const invalid = await app.inject({
      method: 'GET',
      url: detailsUrl('from=2026-01&to=2026-01&situation=settled'),
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
