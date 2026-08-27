import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { mapFinancialTransfer } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulTransferRepository } from '../src/modules/integrations/conta-azul/repositories/transfer.repository.js';
import { createContaAzulTransferSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-transfer-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { type ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const transfers = createContaAzulTransferRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
});

const SRC = '11111111-1111-4111-8111-111111111111';
const DST = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const TRANSFER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRANSFER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRANSFER_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

function transferPayload(input: {
  readonly id: string;
  readonly data: string;
  readonly valor: number | string;
  readonly origin: string;
  readonly dest: string;
  readonly descricao?: string;
}) {
  return {
    id: input.id,
    data: input.data,
    valor: input.valor,
    descricao: input.descricao ?? `Origem / Destino`,
    origem: { conta_financeira: { id: input.origin, nome: 'Origem' } },
    destino: { conta_financeira: { id: input.dest, nome: 'Destino' } },
  };
}

function settlementPayload(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly tipo?: 'RECEITA' | 'DESPESA';
  readonly data: string;
  readonly amount: string;
  readonly account: string;
  readonly juros?: string;
  readonly multa?: string;
  readonly liquido?: string;
}) {
  return {
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
    valor_composicao: {
      valor_bruto: input.amount,
      valor_liquido: input.liquido ?? input.amount,
      juros: input.juros ?? '0',
      multa: input.multa ?? '0',
      desconto: '0',
      taxa: '0',
    },
    conta_financeira: { id: input.account },
  };
}

async function putSettlement(
  tenantId: string,
  integrationId: string,
  input: Parameters<typeof settlementPayload>[0],
  kind: 'RECEIVABLE' | 'PAYABLE' = 'RECEIVABLE',
) {
  await ledger.upsertSettlements(
    { tenantId, integrationId, syncedAt: new Date() },
    kind,
    [mapSettlement(settlementPayload(input))],
  );
}

function transfersClient(itens: unknown[]): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    searchTransfers: async (_token, query) => {
      if (query.pagina > 1) {
        return { itens_totais: itens.length, itens: [] };
      }
      return { itens_totais: itens.length, itens };
    },
  };
}

async function syncWindow(
  tenantId: string,
  integrationId: string,
  itens: unknown[],
  from: Date,
  to: Date,
) {
  const service = createContaAzulTransferSyncService({
    transfers,
    apiClient: transfersClient(itens),
  });
  return service.sync({
    scope: { tenantId, integrationId, syncedAt: new Date() },
    from,
    to,
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
  });
}

async function augustFlow(tenantId: string, integrationId: string) {
  return cashFlow.getMonthlyCashFlow({
    tenantId,
    integrationId,
    monthKey: '2026-08',
    now: new Date('2026-08-26T15:00:00.000Z'),
  });
}

describe('CASH-9C transferências internas', () => {
  it('T1 T2 — um objeto canônico e re-sync não duplica', async () => {
    const { tenant, integration } = await seedConnected('t1-canonical');
    const payload = transferPayload({
      id: TRANSFER_A,
      data: '2026-08-20',
      valor: 10881,
      origin: SRC,
      dest: DST,
    });
    await syncWindow(
      tenant.id,
      integration.id,
      [payload],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    await syncWindow(
      tenant.id,
      integration.id,
      [payload],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const rows = await prisma.financialTransfer.findMany({ where: { integrationId: integration.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe(TRANSFER_A);
    expect(rows[0]?.sourceFinancialAccountExternalId).toBe(SRC);
    expect(rows[0]?.destinationFinancialAccountExternalId).toBe(DST);
    expect(rows[0]?.amount.equals(new Prisma.Decimal('10881'))).toBe(true);
    expect(rows[0]?.matchStatus).toBe('UNMATCHED');
  });

  it('T3 — transferência sem AR/AP/ledger persiste e não altera KPI', async () => {
    const { tenant, integration } = await seedConnected('t3-orphan');
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_B,
          data: '2026-08-21',
          valor: 700,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(0)).toBe(true);
    expect(flow.realized.outflows?.equals(0)).toBe(true);
    const count = await prisma.financialTransfer.count({ where: { integrationId: integration.id } });
    expect(count).toBe(1);
  });

  it('T4 T13 T17 T18 T19 — ghost destino permanece ACTIVE e sai do realizado', async () => {
    const { tenant, integration } = await seedConnected('t4-ghost-dest');
    await putSettlement(tenant.id, integration.id, {
      id: 'settlement-dest',
      installmentId: 'installment-dest',
      data: '2026-08-20',
      amount: '10881',
      account: DST,
    });
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_A,
          data: '2026-08-20',
          valor: 10881,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const ghost = await prisma.financialTransaction.findFirst({
      where: { integrationId: integration.id, externalId: 'settlement-dest' },
    });
    expect(ghost?.lifecycleStatus).toBe('ACTIVE');
    expect(ghost?.transactionType).toBe('RECEIPT');
    expect(ghost?.financialTransferId).not.toBeNull();
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(0)).toBe(true);
    expect(flow.realized.outflows?.equals(0)).toBe(true);
    expect(monthlyBilling(flow)?.equals(0)).toBe(true);
  });

  it('T5 T20 — ghost na origem usa a mesma regra e não vira despesa', async () => {
    const { tenant, integration } = await seedConnected('t5-ghost-origin');
    await putSettlement(tenant.id, integration.id, {
      id: 'settlement-origin',
      installmentId: 'installment-origin',
      data: '2026-08-12',
      amount: '1313',
      account: SRC,
    });
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_C,
          data: '2026-08-12',
          valor: 1313,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const ghost = await prisma.financialTransaction.findFirst({
      where: { integrationId: integration.id, externalId: 'settlement-origin' },
    });
    expect(ghost?.lifecycleStatus).toBe('ACTIVE');
    expect(ghost?.financialTransferId).not.toBeNull();
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(0)).toBe(true);
    expect(flow.realized.outflows?.equals(0)).toBe(true);
  });

  it('T6 — dois candidatos: AMBIGUOUS e nenhum excluído', async () => {
    const { tenant, integration } = await seedConnected('t6-ambiguous');
    await putSettlement(tenant.id, integration.id, {
      id: 'cand-1',
      installmentId: 'inst-1',
      data: '2026-08-20',
      amount: '10881',
      account: DST,
    });
    await putSettlement(tenant.id, integration.id, {
      id: 'cand-2',
      installmentId: 'inst-2',
      data: '2026-08-20',
      amount: '10881',
      account: SRC,
    });
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_A,
          data: '2026-08-20',
          valor: 10881,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const transfer = await prisma.financialTransfer.findFirst({
      where: { integrationId: integration.id },
    });
    expect(transfer?.matchStatus).toBe('AMBIGUOUS');
    const linked = await prisma.financialTransaction.count({
      where: { integrationId: integration.id, financialTransferId: { not: null } },
    });
    expect(linked).toBe(0);
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(new Prisma.Decimal('21762'))).toBe(true);
  });

  it('T7 T8 T9 — venda, PIX e rendimento não classificam', async () => {
    const { tenant, integration } = await seedConnected('t7-controls');
    await putSettlement(tenant.id, integration.id, {
      id: 'sale-700',
      installmentId: 'sale-inst',
      data: '2026-08-21',
      amount: '700',
      account: OTHER,
    });
    await putSettlement(tenant.id, integration.id, {
      id: 'pix-transf',
      installmentId: 'pix-inst',
      data: '2026-08-21',
      amount: '500',
      account: OTHER,
    });
    await putSettlement(tenant.id, integration.id, {
      id: 'yield-032',
      installmentId: 'yield-inst',
      data: '2026-08-20',
      amount: '0.32',
      account: DST,
    });
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_B,
          data: '2026-08-21',
          valor: 700,
          origin: SRC,
          dest: DST,
          descricao: 'PIX TRANSF',
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const transfer = await prisma.financialTransfer.findFirst({
      where: { integrationId: integration.id },
    });
    expect(transfer?.matchStatus).toBe('UNMATCHED');
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(new Prisma.Decimal('1200.32'))).toBe(true);
  });

  it('T10 T11 T12 T15 T16 — AR/AP/multi-baixa/juros/tardio inalterados', async () => {
    const { tenant, integration } = await seedConnected('t10-operating');
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        {
          externalId: 'ar-open',
          description: 'AR normal',
          dueDate: new Date('2026-08-28T00:00:00.000Z'),
          competenceDate: new Date('2026-08-28T00:00:00.000Z'),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          total: new Prisma.Decimal('80'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('80'),
          externalPartyId: 'cust-1',
          categoryExternalIds: [],
          upstreamStatus: 'EM_ABERTO',
        },
      ],
    );
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        {
          externalId: 'ap-open',
          description: 'AP normal',
          dueDate: new Date('2026-08-29T00:00:00.000Z'),
          competenceDate: new Date('2026-08-29T00:00:00.000Z'),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          total: new Prisma.Decimal('40'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('40'),
          externalPartyId: 'sup-1',
          categoryExternalIds: [],
          upstreamStatus: 'EM_ABERTO',
        },
      ],
    );
    await putSettlement(tenant.id, integration.id, {
      id: 'multi-a',
      installmentId: 'multi-inst',
      tipo: 'DESPESA',
      data: '2026-08-10',
      amount: '100',
      account: OTHER,
    }, 'PAYABLE');
    await putSettlement(tenant.id, integration.id, {
      id: 'multi-b',
      installmentId: 'multi-inst',
      tipo: 'DESPESA',
      data: '2026-08-10',
      amount: '50',
      account: OTHER,
    }, 'PAYABLE');
    await putSettlement(tenant.id, integration.id, {
      id: 'late-op',
      installmentId: 'late-inst',
      tipo: 'RECEITA',
      data: '2026-08-25',
      amount: '90',
      account: OTHER,
    });
    await putSettlement(tenant.id, integration.id, {
      id: 'interest-net',
      installmentId: 'interest-inst',
      tipo: 'DESPESA',
      data: '2026-08-11',
      amount: '294',
      liquido: '301.05',
      juros: '1.17',
      multa: '5.88',
      account: OTHER,
    }, 'PAYABLE');
    await syncWindow(
      tenant.id,
      integration.id,
      [
        transferPayload({
          id: TRANSFER_A,
          data: '2026-08-20',
          valor: 10881,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const flow = await augustFlow(tenant.id, integration.id);
    expect(flow.realized.inflows?.equals(new Prisma.Decimal('90'))).toBe(true);
    expect(flow.realized.outflows?.equals(new Prisma.Decimal('451.05'))).toBe(true);
    expect(flow.expected.receivables?.equals(new Prisma.Decimal('80'))).toBe(true);
    expect(flow.expected.payables?.equals(new Prisma.Decimal('40'))).toBe(true);
    const linked = await prisma.financialTransaction.count({
      where: { integrationId: integration.id, financialTransferId: { not: null } },
    });
    expect(linked).toBe(0);
  });

  it('T14 — isolamento de tenant', async () => {
    const a = await seedConnected('t14-a');
    const b = await seedConnected('t14-b');
    await putSettlement(a.tenant.id, a.integration.id, {
      id: 'ghost-a',
      installmentId: 'inst-a',
      data: '2026-08-20',
      amount: '10881',
      account: DST,
    });
    await syncWindow(
      a.tenant.id,
      a.integration.id,
      [
        transferPayload({
          id: TRANSFER_A,
          data: '2026-08-20',
          valor: 10881,
          origin: SRC,
          dest: DST,
        }),
      ],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );
    const bRows = await prisma.financialTransfer.findMany({
      where: { tenantId: b.tenant.id },
    });
    expect(bRows).toHaveLength(0);
    const flowB = await augustFlow(b.tenant.id, b.integration.id);
    expect(flowB.realized.inflows?.equals(0)).toBe(true);
    const flowA = await augustFlow(a.tenant.id, a.integration.id);
    expect(flowA.realized.inflows?.equals(0)).toBe(true);
  });

  it('T21 — mapper/sync não dependem de UUID real hardcoded', async () => {
    const mapped = mapFinancialTransfer(
      transferPayload({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        data: '2026-01-02',
        valor: '12.5',
        origin: SRC,
        dest: DST,
      }),
    );
    expect(mapped.externalId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(mapped.sourceFinancialAccountExternalId).toBe(SRC);
    expect(mapped.destinationFinancialAccountExternalId).toBe(DST);
  });
});
