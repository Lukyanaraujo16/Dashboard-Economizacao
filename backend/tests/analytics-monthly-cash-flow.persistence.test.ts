import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const ledgerWrite = createContaAzulLedgerRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
  categories: createFinancialCategoryReadRepository(prisma),
  costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
});

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

function installment(input: {
  readonly externalId: string;
  readonly status?: FinancialInstallmentStatus;
  readonly dueDate: string;
  readonly competenceDate?: string | null;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly categoryExternalIds?: string[];
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: input.competenceDate ? new Date(`${input.competenceDate}T00:00:00.000Z`) : null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: input.categoryExternalIds ?? [],
  };
}

function baixa(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly data: string;
  readonly tipo?: 'RECEITA' | 'DESPESA';
  readonly bruto: string;
  readonly liquido: string;
  readonly juros?: string;
  readonly multa?: string;
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.liquido,
      juros: input.juros ?? '0',
      multa: input.multa ?? '0',
      desconto: '0',
      taxa: '0',
    },
  });
}

describe('MonthlyCashFlowService (persistência CASH-3A)', () => {
  it('15 — isola tenants com o mesmo externalId', async () => {
    const a = await seedConnected('cash-tenant-a');
    const b = await seedConnected('cash-tenant-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'same', dueDate: '2026-08-10', unpaid: '8' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'same', dueDate: '2026-08-28', unpaid: '3' })],
    );
    await ledgerWrite.upsertSettlements(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      'RECEIVABLE',
      [baixa({ id: 'b-a', installmentId: 'same', data: '2026-08-05', bruto: '1', liquido: '1' })],
    );
    await ledgerWrite.upsertSettlements(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      'RECEIVABLE',
      [baixa({ id: 'b-b', installmentId: 'same', data: '2026-08-05', bruto: '9', liquido: '9' })],
    );

    const now = new Date('2026-08-26T15:00:00.000Z');
    const flowA = await cashFlow.getMonthlyCashFlow({ tenantId: a.tenant.id, now, monthKey: '2026-08' });
    const flowB = await cashFlow.getMonthlyCashFlow({ tenantId: b.tenant.id, now, monthKey: '2026-08' });
    expect(flowA.realized.inflows?.toString()).toBe('1');
    expect(flowB.realized.inflows?.toString()).toBe('9');
    expect(flowA.overdue.receivables?.toString()).toBe('8');
    expect(flowB.expected.receivables?.toString()).toBe('3');
  });

  it('12 — título 404 local sem baixa não gera realizado', async () => {
    const seeded = await seedConnected('cash-404');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: '9c880f8e-0168-4673-a243-f7f6fa8ada84',
          dueDate: '2026-08-01',
          unpaid: '15',
        }),
      ],
    );
    const flow = await cashFlow.getMonthlyCashFlow({
      tenantId: seeded.tenant.id,
      now: new Date('2026-08-26T15:00:00.000Z'),
      monthKey: '2026-08',
    });
    expect(flow.realized.inflows?.toString()).toBe('0');
    expect(flow.overdue.receivables?.toString()).toBe('15');
  });

  it('realizado ignora competência e usa net persistido', async () => {
    const seeded = await seedConnected('cash-net');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'int',
        dueDate: '2026-07-01',
        competenceDate: '2026-06-01',
        unpaid: '0',
        paid: '294',
        status: 'PAID',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'int-baixa',
        installmentId: 'int',
        data: '2026-08-11',
        bruto: '294.00',
        liquido: '301.05',
        juros: '1.17',
        multa: '5.88',
      }),
    ]);
    const flow = await cashFlow.getMonthlyCashFlow({
      tenantId: seeded.tenant.id,
      now: new Date('2026-08-26T15:00:00.000Z'),
      monthKey: '2026-08',
    });
    expect(flow.realized.inflows?.toString()).toBe('301.05');
  });

  it('categoria precisa vs imprecisa no loader', async () => {
    const seeded = await seedConnected('cash-cat');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'precise',
        dueDate: '2026-08-28',
        unpaid: '20',
        categoryExternalIds: ['serv'],
      }),
      installment({
        externalId: 'imprecise',
        dueDate: '2026-08-28',
        unpaid: '20',
        categoryExternalIds: ['serv', 'outro'],
      }),
    ]);
    const now = new Date('2026-08-20T15:00:00.000Z');
    const precise = await cashFlow.getMonthlyCashFlow({
      tenantId: seeded.tenant.id,
      now,
      monthKey: '2026-08',
      categoryFilter: { externalId: 'serv', type: 'REVENUE' },
    });
    expect(precise.expected.receivables?.toString()).toBe('20');
  });

  it('CC 100% atribui realizado; parcial multi fica unavailable', async () => {
    const seeded = await seedConnected('cash-cc');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-1', name: 'Centro 1', code: null, active: true },
      { externalId: 'cc-2', name: 'Centro 2', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-1', 'cc-2']);
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'full',
        dueDate: '2026-08-10',
        unpaid: '0',
        paid: '80',
        total: '80',
        status: 'PAID',
      }),
      installment({
        externalId: 'partial',
        dueDate: '2026-08-31',
        unpaid: '600',
        paid: '400',
        total: '1000',
        status: 'PARTIALLY_PAID',
      }),
    ]);
    const full = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'full' },
    });
    const partial = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'partial' },
    });
    await costCenters.replaceAllocationsForReceivable(
      seeded.tenant.id,
      full.id,
      [{ costCenterId: ids.get('cc-1')!, amount: new Prisma.Decimal('80') }],
      scope.syncedAt,
    );
    await costCenters.replaceAllocationsForReceivable(
      seeded.tenant.id,
      partial.id,
      [
        { costCenterId: ids.get('cc-1')!, amount: new Prisma.Decimal('600') },
        { costCenterId: ids.get('cc-2')!, amount: new Prisma.Decimal('400') },
      ],
      scope.syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(seeded.tenant.id, full.id, {
      status: 'FETCHED',
      syncedAt: scope.syncedAt,
      ruleVersion: 1,
    });
    await costCenters.markReceivableCostCenterDetailState(seeded.tenant.id, partial.id, {
      status: 'FETCHED',
      syncedAt: scope.syncedAt,
      ruleVersion: 1,
    });
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({ id: 'full-b', installmentId: 'full', data: '2026-08-10', bruto: '80', liquido: '80' }),
      baixa({ id: 'part-b', installmentId: 'partial', data: '2026-08-10', bruto: '400', liquido: '400' }),
    ]);

    const now = new Date('2026-08-20T15:00:00.000Z');
    const partialFilter = await cashFlow.getMonthlyCashFlow({
      tenantId: seeded.tenant.id,
      now,
      monthKey: '2026-08',
      costCenterId: ids.get('cc-1'),
    });
    expect(partialFilter.costCenterCashSplit).toBe(false);
    expect(partialFilter.realized.inflows).toBeNull();
  });

  it('CC 100% atribui o net integral da baixa', async () => {
    const seeded = await seedConnected('cash-cc-full');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-1', name: 'Centro 1', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-1']);
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'full',
        dueDate: '2026-08-10',
        unpaid: '0',
        paid: '80',
        total: '80',
        status: 'PAID',
      }),
    ]);
    const full = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, externalId: 'full' },
    });
    await costCenters.replaceAllocationsForReceivable(
      seeded.tenant.id,
      full.id,
      [{ costCenterId: ids.get('cc-1')!, amount: new Prisma.Decimal('80') }],
      scope.syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(seeded.tenant.id, full.id, {
      status: 'FETCHED',
      syncedAt: scope.syncedAt,
      ruleVersion: 1,
    });
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({ id: 'full-b', installmentId: 'full', data: '2026-08-10', bruto: '80', liquido: '80' }),
    ]);
    const exact = await cashFlow.getMonthlyCashFlow({
      tenantId: seeded.tenant.id,
      now: new Date('2026-08-20T15:00:00.000Z'),
      monthKey: '2026-08',
      costCenterId: ids.get('cc-1'),
    });
    expect(exact.costCenterCashSplit).toBe(true);
    expect(exact.realized.inflows?.toString()).toBe('80');
  });

  it('rejeita tenantId vazio', async () => {
    await expect(cashFlow.getMonthlyCashFlow({ tenantId: '  ' })).rejects.toThrow(/tenantId/);
  });
});
