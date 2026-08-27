import { ValueType, Workbook } from 'exceljs';
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
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
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
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
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

function exportUrl(query: string): string {
  return `/reports/revenue?${query}`;
}

describe('GET /reports/revenue export', () => {
  it('PDF e XLSX reutilizam o JSON oficial, isolam tenant e rejeitam tenantId', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const current = civilMonthBounds(today);
    const prevFrom = new Date(Date.UTC(current.from.getUTCFullYear(), current.from.getUTCMonth() - 1, 1));
    const prev = civilMonthBounds(prevFrom);
    const a = await seedConnected('rr-export-a');
    const b = await seedConnected('rr-export-b');
    const scopeA = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    const scopeB = { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() };

    await financial.upsertCategories(scopeA, [
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
    ]);
    await financial.upsertReceivables(scopeA, [
      installment({
        externalId: 'cur-open',
        dueDate: current.to,
        unpaid: '8000',
        categoryExternalIds: ['serv-a'],
      }),
      installment({
        externalId: 'prev-paid',
        dueDate: prev.from,
        unpaid: '0',
        paid: '7000',
        status: 'PAID',
        categoryExternalIds: ['serv-b'],
      }),
      installment({
        externalId: 'cur-paid',
        dueDate: current.from,
        unpaid: '0',
        paid: '5000',
        status: 'PAID',
        categoryExternalIds: ['serv-a'],
      }),
    ]);
    await financial.upsertReceivables(scopeB, [
      installment({
        externalId: 'other-tenant',
        dueDate: current.from,
        unpaid: '0',
        paid: '333',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeA, 'RECEIVABLE', [
      baixa({
        id: 'prev-b',
        installmentId: 'prev-paid',
        data: iso(prev.from),
        bruto: '7000',
        liquido: '7000',
      }),
      baixa({
        id: 'cur-b',
        installmentId: 'cur-paid',
        data: iso(current.from),
        bruto: '5000',
        liquido: '5000',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scopeB, 'RECEIVABLE', [
      baixa({
        id: 'other-b',
        installmentId: 'other-tenant',
        data: iso(current.from),
        bruto: '333',
        liquido: '333',
      }),
    ]);

    await createUser({ email: 'user-a@rr-export.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@rr-export.test', role: 'USER', tenantId: b.tenant.id });
    await createUser({ email: 'admin@rr-export.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@rr-export.test');
    const cookieB = await loginAs(app, 'user-b@rr-export.test');

    const json = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${prev.monthKey}&to=${current.monthKey}`),
      headers: { cookie: cookieA },
    });
    expect(json.statusCode).toBe(200);
    const body = json.json() as {
      receivables: {
        total: string;
        received: string | null;
        items: Array<{ name: string; amount: string }>;
      };
    };
    expect(body.receivables.total).toBe('20000');
    expect(body.receivables.received).toBe('12000');
    expect(body.receivables.items.filter((item) => item.name === 'Serviços')).toHaveLength(2);

    const pdf = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${prev.monthKey}&to=${current.monthKey}&format=pdf`),
      headers: { cookie: cookieA },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain(PDF_CONTENT_TYPE);
    expect(pdf.headers['content-disposition']).toBe(
      `attachment; filename="relatorio-receita-${prev.monthKey}-a-${current.monthKey}.pdf"`,
    );
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    const pdfBytes = Buffer.from(pdf.rawPayload);
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdfText = decodedPdfStrings(pdfBytes);
    expect(pdfText.toUpperCase()).toContain('REGIME DE CAIXA');
    expect(pdfText).toContain('Entradas realizadas');
    expect(pdfText).toContain('20.000,00');
    expect(pdfText).toContain('8.000,00');
    expect(pdfText).toContain('7.000,00');
    expect(pdfText.toLowerCase()).not.toContain('competência');
    expect(pdfText).not.toContain('333');
    expect(pdfText).not.toContain(a.tenant.id);
    expect(pdfText).not.toContain('descricao-secreta-nao-vazar');
    expect(pdfText).not.toContain('access-token-secret');

    const xlsx = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${prev.monthKey}&to=${current.monthKey}&format=xlsx`),
      headers: { cookie: cookieA },
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain(XLSX_CONTENT_TYPE);
    expect(xlsx.headers['content-disposition']).toBe(
      `attachment; filename="relatorio-receita-${prev.monthKey}-a-${current.monthKey}.xlsx"`,
    );
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(xlsx.rawPayload));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumo', 'Mensal', 'Categorias']);
    expect(workbook.getWorksheet('Resumo')?.getCell('A1').value).toBe('Relatório');
    expect(String(workbook.getWorksheet('Resumo')?.getCell('B1').value)).toContain('Regime de caixa');
    expect(workbook.getWorksheet('Resumo')?.getCell('B7').value).toBe(20000);
    expect(workbook.getWorksheet('Resumo')?.getCell('B8').value).toBe(12000);
    expect(typeof workbook.getWorksheet('Mensal')?.getCell('B2').value).toBe('number');
    const categorySheet = workbook.getWorksheet('Categorias');
    expect(categorySheet?.getCell('A2').value).toBe('Serviços');
    expect(categorySheet?.getCell('A3').value).toBe('Serviços');
    expect(categorySheet?.rowCount).toBeGreaterThanOrEqual(3);

    const otherPdf = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${prev.monthKey}&to=${current.monthKey}&format=pdf`),
      headers: { cookie: cookieB },
    });
    expect(otherPdf.statusCode).toBe(200);
    expect(decodedPdfStrings(Buffer.from(otherPdf.rawPayload))).not.toContain('20.000,00');

    const tenantQuery = await app.inject({
      method: 'GET',
      url: exportUrl(
        `from=${prev.monthKey}&to=${current.monthKey}&format=pdf&tenantId=${b.tenant.id}`,
      ),
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
    expect(emptyText).toContain('filtros selecionados');
    expect(emptyText).not.toContain('0%');

    const emptyXlsx = await app.inject({
      method: 'GET',
      url: exportUrl('from=2024-01&to=2024-01&format=xlsx'),
      headers: { cookie: cookieA },
    });
    const emptyBook = new Workbook();
    await emptyBook.xlsx.load(Buffer.from(emptyXlsx.rawPayload));
    expect(emptyBook.getWorksheet('Resumo')?.getCell('B13').value).toBeNull();

    const cashFlow = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-cash-flow?month=${current.monthKey}`,
      headers: { cookie: cookieA },
    });
    const single = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${current.monthKey}&to=${current.monthKey}`),
      headers: { cookie: cookieA },
    });
    expect(single.json().receivables.total).toBe(cashFlow.json().billing);
    expect(single.json().receivables.received).toBe(cashFlow.json().realized.inflows);

    const unauthenticated = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${current.monthKey}&to=${current.monthKey}&format=pdf`),
    });
    expect(unauthenticated.statusCode).toBe(401);

    const adminCookie = await loginAs(app, 'admin@rr-export.test');
    const forbidden = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${current.monthKey}&to=${current.monthKey}&format=xlsx`),
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
      url: exportUrl(`from=${prev.monthKey}&to=${current.monthKey}&format=pdf`),
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
      url: exportUrl(`from=${current.monthKey}&to=${current.monthKey}&format=pdf`),
      headers: { cookie: adminCookie },
    });
    expect(afterExit.statusCode).toBe(403);
  });

  it('rejeita as mesmas validações do JSON; situation ignorado; category filtra caixa', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, monthKey } = civilMonthBounds(today);
    const a = await seedConnected('rr-export-filters');
    const scope = { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() };
    await financial.upsertCategories(scope, [
      {
        externalId: 'formula',
        name: '=1+1',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
      },
    ]);
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'paid-formula',
        dueDate: from,
        unpaid: '0',
        paid: '100',
        status: 'PAID',
        categoryExternalIds: ['formula'],
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'paid-formula-b',
        installmentId: 'paid-formula',
        data: iso(from),
        bruto: '100',
        liquido: '100',
      }),
    ]);
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
      url: exportUrl(`from=${monthKey}&to=${monthKey}&format=csv`),
      headers: { cookie },
    });
    expect(invalidFormat.statusCode).toBe(400);

    const invalidSituation = await app.inject({
      method: 'GET',
      url: exportUrl(`from=${monthKey}&to=${monthKey}&format=pdf&situation=PAID`),
      headers: { cookie },
    });
    expect(invalidSituation.statusCode).toBe(400);

    const missingCategory = await app.inject({
      method: 'GET',
      url: exportUrl(
        `from=${monthKey}&to=${monthKey}&format=xlsx&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403`,
      ),
      headers: { cookie },
    });
    expect(missingCategory.statusCode).toBe(404);

    const filtered = await app.inject({
      method: 'GET',
      url: exportUrl(
        `from=${monthKey}&to=${monthKey}&format=xlsx&situation=settled&category=${category.id}`,
      ),
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(filtered.rawPayload));
    // B7 = Faturamento; situation é ignorado — mesmo total da categoria.
    expect(workbook.getWorksheet('Resumo')?.getCell('B7').value).toBe(100);
    expect(workbook.getWorksheet('Categorias')?.getCell('A2').value).toBe("'=1+1");
    expect(workbook.getWorksheet('Categorias')?.getCell('A2').type).not.toBe(ValueType.Formula);
  });
});
