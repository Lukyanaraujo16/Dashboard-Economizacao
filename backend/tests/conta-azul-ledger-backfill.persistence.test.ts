import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulLedgerBackfillService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-backfill.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  ContaAzulApiError,
  type ContaAzulApiClient,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
    encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  return { tenant, integration };
}

function paidInstallment(input: {
  readonly externalId: string;
  readonly paid: string;
  readonly dueDate?: string;
  readonly status?: MappedInstallment['status'];
}): MappedInstallment {
  const paid = new Prisma.Decimal(input.paid);
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date(`${input.dueDate ?? '2026-06-01'}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'PAID',
    upstreamStatus: 'PAID',
    total: paid,
    paid,
    unpaid: new Prisma.Decimal(0),
    externalPartyId: null,
    categoryExternalIds: [],
  };
}

function settlementPayload(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly tipo?: 'RECEITA' | 'DESPESA';
  readonly data?: string;
  readonly bruto: string;
  readonly liquido: string;
  readonly juros?: string;
  readonly multa?: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data ?? '2026-08-10',
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.liquido,
      juros: input.juros ?? '0',
      multa: input.multa ?? '0',
      desconto: '0',
      taxa: '0',
    },
  };
}

function clientWithBaixas(
  baixas: Record<string, unknown[]>,
  options?: {
    readonly fail?: Record<string, ContaAzulApiError>;
    readonly onGet?: (id: string) => void;
  },
): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    getInstallmentSettlements: async (_token, id) => {
      options?.onGet?.(id);
      const fail = options?.fail?.[id];
      if (fail) {
        throw fail;
      }
      return baixas[id] ?? [];
    },
  };
}

async function runBackfill(
  tenantId: string,
  integrationId: string,
  apiClient: ContaAzulApiClient,
  dryRun = false,
) {
  const service = createContaAzulLedgerBackfillService({ prisma, ledger, apiClient });
  return service.run({
    scope: { tenantId, integrationId, syncedAt: new Date() },
    dryRun,
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
    heartbeat: async () => undefined,
  });
}

describe('CASH-7 backfill do ledger', () => {
  it('B1 — parcela PAID com uma baixa gera 1 row', async () => {
    const { tenant, integration } = await seedConnected('b1');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-1', paid: '80' })],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-1': [
          settlementPayload({
            id: 'baixa-1',
            installmentId: 'parcela-1',
            bruto: '80',
            liquido: '80',
          }),
        ],
      }),
    );
    expect(summary.candidates).toBe(1);
    expect(summary.requested).toBe(1);
    expect(summary.upserted).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('B2 — duas baixas geram duas rows', async () => {
    const { tenant, integration } = await seedConnected('b2');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-2', paid: '11550' })],
    );
    await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-2': [
          settlementPayload({
            id: 'baixa-a',
            installmentId: 'parcela-2',
            bruto: '10000',
            liquido: '10000',
          }),
          settlementPayload({
            id: 'baixa-b',
            installmentId: 'parcela-2',
            bruto: '1550',
            liquido: '1550',
          }),
        ],
      }),
    );
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it('B3 — reexecução não duplica', async () => {
    const { tenant, integration } = await seedConnected('b3');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-3', paid: '10' })],
    );
    const client = clientWithBaixas({
      'parcela-3': [
        settlementPayload({ id: 'baixa-3', installmentId: 'parcela-3', bruto: '10', liquido: '10' }),
      ],
    });
    await runBackfill(tenant.id, integration.id, client);
    const second = await runBackfill(tenant.id, integration.id, client);
    expect(second.skippedCovered).toBe(1);
    expect(second.requested).toBe(0);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('B4 — /baixa [] não cria movimento', async () => {
    const { tenant, integration } = await seedConnected('b4');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: '9c880f8e-0168-4673-a243-f7f6fa8ada84', paid: '50' })],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({ '9c880f8e-0168-4673-a243-f7f6fa8ada84': [] }),
    );
    expect(summary.empty).toBe(1);
    expect(summary.upserted).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });

  it('B5 — 404 conta failure e não apaga', async () => {
    const { tenant, integration } = await seedConnected('b5');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'missing', paid: '10' })],
    );
    const existing = mapSettlement(
      settlementPayload({ id: 'keep', installmentId: 'other', bruto: '1', liquido: '1' }),
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [existing],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas(
        {},
        {
          fail: {
            missing: new ContaAzulApiError('unavailable', '404', { httpStatus: 404 }),
          },
        },
      ),
    );
    expect(summary.notFound).toBe(1);
    expect(summary.parcelFailures).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('B6 — identity mismatch é observável e não persiste a baixa', async () => {
    const { tenant, integration } = await seedConnected('b6');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-6', paid: '100' })],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-6': [
          settlementPayload({
            id: 'baixa-bad',
            installmentId: 'parcela-6',
            bruto: '100',
            liquido: '90',
          }),
        ],
      }),
    );
    expect(summary.identityMismatch).toBe(1);
    expect(summary.upserted).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });

  it('B7 — net missing skip observável', async () => {
    const { tenant, integration } = await seedConnected('b7');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-7', paid: '10' })],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-7': [
          {
            id: 'baixa-nonet',
            id_parcela: 'parcela-7',
            data_pagamento: '2026-08-10',
            tipo_evento_financeiro: 'RECEITA',
            valor_composicao: { valor_bruto: '10' },
          },
        ],
      }),
    );
    expect(summary.skippedInvalid).toBe(1);
    expect(summary.upserted).toBe(0);
  });

  it('B8/B9 — isolamento de tenant e integration', async () => {
    const a = await seedConnected('b8a');
    const b = await seedConnected('b8b');
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-a', paid: '10' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-b', paid: '20' })],
    );
    await runBackfill(
      a.tenant.id,
      a.integration.id,
      clientWithBaixas({
        'parcela-a': [
          settlementPayload({
            id: 'baixa-a',
            installmentId: 'parcela-a',
            bruto: '10',
            liquido: '10',
          }),
        ],
        'parcela-b': [
          settlementPayload({
            id: 'baixa-b',
            installmentId: 'parcela-b',
            bruto: '20',
            liquido: '20',
          }),
        ],
      }),
    );
    expect(await prisma.financialTransaction.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: b.tenant.id } })).toBe(0);
  });

  it('B10 — parcela já coberta é skipped', async () => {
    const { tenant, integration } = await seedConnected('b10');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-10', paid: '40' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        mapSettlement(
          settlementPayload({
            id: 'baixa-10',
            installmentId: 'parcela-10',
            bruto: '40',
            liquido: '40',
          }),
        ),
      ],
    );
    let gets = 0;
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({}, { onGet: () => {
        gets += 1;
      } }),
    );
    expect(summary.skippedCovered).toBe(1);
    expect(summary.requested).toBe(0);
    expect(gets).toBe(0);
  });

  it('B11 — juros/multa persistem net correto', async () => {
    const { tenant, integration } = await seedConnected('b11');
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-11', paid: '294' })],
    );
    await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-11': [
          settlementPayload({
            id: 'baixa-11',
            installmentId: 'parcela-11',
            tipo: 'DESPESA',
            bruto: '294',
            liquido: '301.05',
            juros: '1.17',
            multa: '5.88',
          }),
        ],
      }),
    );
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(row.netAmount.equals(new Prisma.Decimal('301.05'))).toBe(true);
    expect(row.grossAmount.equals(new Prisma.Decimal('294'))).toBe(true);
  });

  it('B12 — pagamento tardio usa occurredOn da baixa', async () => {
    const { tenant, integration } = await seedConnected('b12');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-12', paid: '10', dueDate: '2026-06-01' })],
    );
    await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-12': [
          settlementPayload({
            id: 'baixa-12',
            installmentId: 'parcela-12',
            data: '2026-08-20',
            bruto: '10',
            liquido: '10',
          }),
        ],
      }),
    );
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(formatCivilDate(row.occurredOn)).toBe('2026-08-20');
  });

  it('B13 — data civil no limite do mês não desloca timezone', async () => {
    const { tenant, integration } = await seedConnected('b13');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-13', paid: '10' })],
    );
    await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'parcela-13': [
          settlementPayload({
            id: 'baixa-13',
            installmentId: 'parcela-13',
            data: '2026-08-31',
            bruto: '10',
            liquido: '10',
          }),
        ],
      }),
    );
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(formatCivilDate(row.occurredOn)).toBe('2026-08-31');
    expect(row.occurredOn.toISOString().startsWith('2026-08-31')).toBe(true);
  });

  it('B14 — múltiplas parcelas em batch estável', async () => {
    const { tenant, integration } = await seedConnected('b14');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        paidInstallment({ externalId: 'p-a', paid: '10' }),
        paidInstallment({ externalId: 'p-b', paid: '20' }),
        paidInstallment({ externalId: 'p-c', paid: '30' }),
      ],
    );
    const summary = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        'p-a': [settlementPayload({ id: 'ba', installmentId: 'p-a', bruto: '10', liquido: '10' })],
        'p-b': [settlementPayload({ id: 'bb', installmentId: 'p-b', bruto: '20', liquido: '20' })],
        'p-c': [settlementPayload({ id: 'bc', installmentId: 'p-c', bruto: '30', liquido: '30' })],
      }),
    );
    expect(summary.candidates).toBe(3);
    expect(summary.upserted).toBe(3);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(3);
  });

  it('B15 — rate-limit retry na mesma parcela', async () => {
    const { tenant, integration } = await seedConnected('b15');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: 'parcela-15', paid: '10' })],
    );
    let calls = 0;
    const base = createMockContaAzulApiClient();
    const client: ContaAzulApiClient = {
      ...base,
      getInstallmentSettlements: async () => {
        calls += 1;
        if (calls === 1) {
          throw new ContaAzulApiError('rate_limited', '429', { httpStatus: 429, retryAfterMs: 1 });
        }
        return [
          settlementPayload({
            id: 'baixa-15',
            installmentId: 'parcela-15',
            bruto: '10',
            liquido: '10',
          }),
        ];
      },
    };
    const summary = await runBackfill(tenant.id, integration.id, client);
    expect(summary.rateLimited).toBe(1);
    expect(summary.retries).toBe(1);
    expect(summary.upserted).toBe(1);
    expect(calls).toBe(2);
  });

  it('B16 — backfill parcial retomável', async () => {
    const { tenant, integration } = await seedConnected('b16');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        paidInstallment({ externalId: 'first', paid: '10' }),
        paidInstallment({ externalId: 'second', paid: '20' }),
      ],
    );
    let calls = 0;
    const exploding = clientWithBaixas(
      {
        first: [
          settlementPayload({ id: 'bf', installmentId: 'first', bruto: '10', liquido: '10' }),
        ],
        second: [
          settlementPayload({ id: 'bs', installmentId: 'second', bruto: '20', liquido: '20' }),
        ],
      },
      {
        onGet: () => {
          calls += 1;
          if (calls === 2) {
            throw new Error('interrupted');
          }
        },
      },
    );
    await expect(runBackfill(tenant.id, integration.id, exploding)).rejects.toThrow('interrupted');
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(1);

    const resume = await runBackfill(
      tenant.id,
      integration.id,
      clientWithBaixas({
        first: [
          settlementPayload({ id: 'bf', installmentId: 'first', bruto: '10', liquido: '10' }),
        ],
        second: [
          settlementPayload({ id: 'bs', installmentId: 'second', bruto: '20', liquido: '20' }),
        ],
      }),
    );
    expect(resume.skippedCovered).toBe(1);
    expect(resume.requested).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id } })).toBe(2);
  });
});
