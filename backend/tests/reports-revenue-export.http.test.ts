import { ValueType, Workbook } from 'exceljs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { PDF_CONTENT_TYPE, XLSX_CONTENT_TYPE } from '../src/modules/reports/exporters/export-content-types.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { decodedPdfStrings } from './helpers/readable-pdf.js';
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
    description: 'descricao-secreta-nao-vazar',
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

function exportUrl(query: string): string {
  return `/reports/revenue?${query}`;
}

describe('GET /reports/revenue export', () => {
  it('PDF e XLSX reutilizam o JSON oficial, isolam tenant e rejeitam tenantId', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const feb = civilMonthBoundsFromKey('2026-02');
    const a = await seedConnected('rr-export-a');
    const b = await seedConnected('rr-export-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'serv-a',
          name: 'Serviços',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'serv-b',
          name: 'Serviços',
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
          externalId: 'jan-a',
          status: 'OPEN',
          total: '8000',
          competenceDate: jan.from,
          categoryExternalIds: ['serv-a'],
        }),
        installment({
          externalId: 'jan-b',
          status: 'PAID',
          total: '7000',
          paid: '7000',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['serv-b'],
        }),
        installment({
          externalId: 'feb-a',
          status: 'PAID',
          total: '5000',
          paid: '5000',
          unpaid: '0',
          competenceDate: feb.from,
          categoryExternalIds: ['serv-a'],
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'other-tenant',
          status: 'PAID',
          total: '333',
          paid: '333',
          unpaid: '0',
          competenceDate: jan.from,
        }),
      ],
    );
    await createUser({ email: 'user-a@rr-export.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@rr-export.test', role: 'USER', tenantId: b.tenant.id });
    await createUser({ email: 'admin@rr-export.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@rr-export.test');
    const cookieB = await loginAs(app, 'user-b@rr-export.test');

    const json = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-02'),
      headers: { cookie: cookieA },
    });
    expect(json.statusCode).toBe(200);
    const body = json.json() as {
      receivables: { total: string; received: string | null; coverageRate: string | null; items: Array<{ name: string; amount: string }> };
    };
    expect(body.receivables.total).toBe('20000');
    expect(body.receivables.items.filter((item) => item.name === 'Serviços')).toHaveLength(2);

    const pdf = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-02&format=pdf'),
      headers: { cookie: cookieA },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain(PDF_CONTENT_TYPE);
    expect(pdf.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-receita-2026-01-a-2026-02.pdf"',
    );
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    const pdfBytes = Buffer.from(pdf.rawPayload);
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdfText = decodedPdfStrings(pdfBytes);
    expect(pdfText).toContain('20.000,00');
    expect(pdfText).toContain('8.000,00');
    expect(pdfText).toContain('7.000,00');
    expect(pdfText).not.toContain('333');
    expect(pdfText).not.toContain(a.tenant.id);
    expect(pdfText).not.toContain('descricao-secreta-nao-vazar');
    expect(pdfText).not.toContain('access-token-secret');

    const xlsx = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-02&format=xlsx'),
      headers: { cookie: cookieA },
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain(XLSX_CONTENT_TYPE);
    expect(xlsx.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-receita-2026-01-a-2026-02.xlsx"',
    );
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(xlsx.rawPayload));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumo', 'Mensal', 'Categorias']);
    expect(workbook.getWorksheet('Resumo')?.getCell('B8').value).toBe(20000);
    expect(typeof workbook.getWorksheet('Mensal')?.getCell('B2').value).toBe('number');
    const categorySheet = workbook.getWorksheet('Categorias');
    expect(categorySheet?.getCell('A2').value).toBe('Serviços');
    expect(categorySheet?.getCell('A3').value).toBe('Serviços');
    expect(categorySheet?.rowCount).toBeGreaterThanOrEqual(3);

    const otherPdf = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-02&format=pdf'),
      headers: { cookie: cookieB },
    });
    expect(otherPdf.statusCode).toBe(200);
    expect(decodedPdfStrings(Buffer.from(otherPdf.rawPayload))).not.toContain('20.000,00');

    const tenantQuery = await app.inject({
      method: 'GET',
      url: exportUrl(`from=2026-01&to=2026-02&format=pdf&tenantId=${b.tenant.id}`),
      headers: { cookie: cookieA },
    });
    expect(tenantQuery.statusCode).toBe(400);

    const empty = await app.inject({
      method: 'GET',
      url: exportUrl('from=2024-01&to=2024-01&format=pdf'),
      headers: { cookie: cookieA },
    });
    expect(empty.statusCode).toBe(200);
    const emptyText = decodedPdfStrings(Buffer.from(empty.rawPayload));
    expect(emptyText).toContain('intervalo selecionado');
    expect(emptyText).not.toContain('0%');

    const emptyXlsx = await app.inject({
      method: 'GET',
      url: exportUrl('from=2024-01&to=2024-01&format=xlsx'),
      headers: { cookie: cookieA },
    });
    const emptyBook = new Workbook();
    await emptyBook.xlsx.load(Buffer.from(emptyXlsx.rawPayload));
    expect(emptyBook.getWorksheet('Resumo')?.getCell('B13').value).toBeNull();

    const monthly = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?month=2026-01',
      headers: { cookie: cookieA },
    });
    const single = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01'),
      headers: { cookie: cookieA },
    });
    expect(single.json().receivables.total).toBe(monthly.json().receivables.total);

    const unauthenticated = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01&format=pdf'),
    });
    expect(unauthenticated.statusCode).toBe(401);

    const adminCookie = await loginAs(app, 'admin@rr-export.test');
    const forbidden = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01&format=xlsx'),
      headers: { cookie: adminCookie },
    });
    expect(forbidden.statusCode).toBe(403);

    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie: adminCookie, 'user-agent': 'rr-export-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    const supported = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-02&format=pdf'),
      headers: { cookie: adminCookie },
    });
    expect(supported.statusCode).toBe(200);
    const supportedText = decodedPdfStrings(Buffer.from(supported.rawPayload));
    expect(supportedText).toContain('20.000,00');
    expect(supportedText).not.toContain('333');
    await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie: adminCookie },
    });
    const afterExit = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01&format=pdf'),
      headers: { cookie: adminCookie },
    });
    expect(afterExit.statusCode).toBe(403);
  });

  it('rejeita as mesmas validações do JSON e aplica filtros AND', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const a = await seedConnected('rr-export-filters');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'formula',
          name: '=1+1',
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
          externalId: 'paid-formula',
          status: 'PAID',
          total: '100',
          paid: '100',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['formula'],
        }),
      ],
    );
    const category = await prisma.financialCategory.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'formula' },
    });
    await createUser({ email: 'user@rr-export-filters.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rr-export-filters.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/reports/revenue?format=pdf',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    const inverted = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-08&to=2026-01&format=xlsx'),
      headers: { cookie },
    });
    expect(inverted.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'GET',
      url: exportUrl('from=2025-01&to=2027-01&format=pdf'),
      headers: { cookie },
    });
    expect(tooLarge.statusCode).toBe(400);

    const invalidFormat = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01&format=csv'),
      headers: { cookie },
    });
    expect(invalidFormat.statusCode).toBe(400);

    const invalidSituation = await app.inject({
      method: 'GET',
      url: exportUrl('from=2026-01&to=2026-01&format=pdf&situation=PAID'),
      headers: { cookie },
    });
    expect(invalidSituation.statusCode).toBe(400);

    const missingCategory = await app.inject({
      method: 'GET',
      url: exportUrl(
        'from=2026-01&to=2026-01&format=xlsx&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403',
      ),
      headers: { cookie },
    });
    expect(missingCategory.statusCode).toBe(404);

    const filtered = await app.inject({
      method: 'GET',
      url: exportUrl(`from=2026-01&to=2026-01&format=xlsx&situation=settled&category=${category.id}`),
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(filtered.rawPayload));
    expect(workbook.getWorksheet('Resumo')?.getCell('B8').value).toBe(100);
    expect(workbook.getWorksheet('Categorias')?.getCell('A2').value).toBe("'=1+1");
    expect(workbook.getWorksheet('Categorias')?.getCell('A2').type).not.toBe(ValueType.Formula);
  });
});
