import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulLedgerSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { ContaAzulApiError, type ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);

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
    data_pagamento: input.data ?? '2025-09-10',
    tipo_evento_financeiro: input.tipo ?? 'DESPESA',
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

describe('Persistência do ledger de baixas (CASH-2)', () => {
  it('E — duas baixas da mesma parcela geram duas linhas (10000 + 1550)', async () => {
    const { tenant, integration } = await seedConnected('ledger-multi');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() };
    const mapped = [
      mapSettlement(
        settlementPayload({
          id: '17c475ff-6f0e-4565-a709-420075c28f80',
          installmentId: '52cc77f3-bab3-4ad2-87b1-21335cd5e8b2',
          bruto: '10000',
          liquido: '10000',
        }),
      ),
      mapSettlement(
        settlementPayload({
          id: '8e3b5d2f-c722-48e7-afd0-f07eb53d089b',
          installmentId: '52cc77f3-bab3-4ad2-87b1-21335cd5e8b2',
          bruto: '1550',
          liquido: '1550',
        }),
      ),
    ];
    await ledger.upsertSettlements(scope, 'PAYABLE', mapped);
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
      orderBy: { grossAmount: 'desc' },
    });
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((acc, row) => acc.add(row.netAmount), new Prisma.Decimal(0));
    expect(sum.equals(new Prisma.Decimal('11550'))).toBe(true);
    expect(rows.every((row) => row.installmentExternalId === '52cc77f3-bab3-4ad2-87b1-21335cd5e8b2')).toBe(
      true,
    );
  });

  it('F — upsert da mesma baixa duas vezes permanece 1 registro', async () => {
    const { tenant, integration } = await seedConnected('ledger-idem');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() };
    const item = mapSettlement(
      settlementPayload({
        id: 'baixa-idem',
        installmentId: 'parcela-idem',
        bruto: '294.00',
        liquido: '301.05',
        juros: '1.17',
        multa: '5.88',
      }),
    );
    await ledger.upsertSettlements(scope, 'PAYABLE', [item]);
    await ledger.upsertSettlements(
      { ...scope, syncedAt: new Date(Date.now() + 1000) },
      'PAYABLE',
      [item],
    );
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.grossAmount.equals(new Prisma.Decimal('294'))).toBe(true);
    expect(rows[0]?.netAmount.equals(new Prisma.Decimal('301.05'))).toBe(true);
    expect(rows[0]?.tenantId).toBe(tenant.id);
    expect(rows[0]?.integrationId).toBe(integration.id);
  });

  it('G — GET /baixa [] não cria movimento sintético', async () => {
    const { tenant, integration } = await seedConnected('ledger-empty');
    const base = createMockContaAzulApiClient();
    const client: ContaAzulApiClient = {
      ...base,
      getInstallmentSettlements: async () => [],
    };
    const sync = createContaAzulLedgerSyncService({ prisma, ledger, apiClient: client });
    const summary = await sync.sync({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      mode: 'incremental',
      changedInstallments: [{ kind: 'RECEIVABLE', externalId: '9c880f8e-0168-4673-a243-f7f6fa8ada84' }],
      paymentDiscoveryWindow: null,
      dueHorizon: { de: '2020-01-01', ate: '2028-12-31' },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(summary.fetched).toBe(1);
    expect(summary.upserted).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });

  it('H — occurredOn civil 2025-09-11 sobrevive à persistência', async () => {
    const { tenant, integration } = await seedConnected('ledger-date');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() };
    const item = mapSettlement(
      settlementPayload({
        id: 'baixa-date',
        installmentId: 'parcela-date',
        data: '2025-09-11',
        bruto: '10',
        liquido: '10',
      }),
    );
    await ledger.upsertSettlements(scope, 'RECEIVABLE', [item]);
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(formatCivilDate(row.occurredOn)).toBe('2025-09-11');
    expect(row.occurredOn.toISOString().startsWith('2025-09-11')).toBe(true);
  });

  it('isola tenants e não infere estorno em 404', async () => {
    const a = await seedConnected('ledger-iso-a');
    const b = await seedConnected('ledger-iso-b');
    const item = mapSettlement(
      settlementPayload({
        id: 'shared-ext',
        installmentId: 'parcela-a',
        bruto: '10',
        liquido: '10',
        tipo: 'RECEITA',
      }),
    );
    await ledger.upsertSettlements(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    await ledger.upsertSettlements(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    expect(await prisma.financialTransaction.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: b.tenant.id } })).toBe(1);
    const aRow = await prisma.financialTransaction.findFirstOrThrow({
      where: { tenantId: a.tenant.id },
    });
    const bRow = await prisma.financialTransaction.findFirstOrThrow({
      where: { tenantId: b.tenant.id },
    });
    expect(aRow.externalId).toBe('shared-ext');
    expect(bRow.externalId).toBe('shared-ext');
    expect(aRow.integrationId).toBe(a.integration.id);
    expect(bRow.integrationId).toBe(b.integration.id);
    expect(aRow.id).not.toBe(bRow.id);

    const failing: ContaAzulApiClient = {
      ...createMockContaAzulApiClient(),
      getInstallmentSettlements: async () => {
        throw new ContaAzulApiError('unavailable', '404', { httpStatus: 404 });
      },
    };
    const sync = createContaAzulLedgerSyncService({ prisma, ledger, apiClient: failing });
    const before = await prisma.financialTransaction.count();
    const summary = await sync.sync({
      scope: { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      mode: 'incremental',
      changedInstallments: [{ kind: 'RECEIVABLE', externalId: 'missing-parcela' }],
      paymentDiscoveryWindow: null,
      dueHorizon: { de: '2020-01-01', ate: '2028-12-31' },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(summary.parcelFailures).toBe(1);
    expect(summary.upserted).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(before);
    expect(await prisma.financialTransaction.count({ where: { tenantId: b.tenant.id } })).toBe(1);
  });
});
