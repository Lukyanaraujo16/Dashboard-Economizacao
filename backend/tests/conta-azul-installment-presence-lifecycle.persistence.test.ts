import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND } from '../src/modules/integrations/conta-azul/domain/conta-azul-installment-presence.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulInstallmentPresenceRepository } from '../src/modules/integrations/conta-azul/repositories/installment-presence.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulInstallmentPresenceSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-installment-presence-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const presenceRepo = createContaAzulInstallmentPresenceRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);
const ledgerWrite = createContaAzulLedgerRepository(prisma);
const receivables = createReceivableReadRepository(prisma);
const payables = createPayableReadRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables,
  payables,
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
  readonly dueDate?: string;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date(`${input.dueDate ?? '2026-09-25'}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [] as string[],
  };
}

function createPresenceService(getInstallmentDetail: ReturnType<typeof vi.fn>) {
  return createContaAzulInstallmentPresenceSyncService({
    presence: presenceRepo,
    apiClient: { getInstallmentDetail } as never,
  });
}

describe('Correção 11-E.1 — installment presence lifecycle (persistência)', () => {
  it('404 tombstone + reativação no upsert + isolamento tenant', async () => {
    const a = await seedConnected('11e1-a');
    const b = await seedConnected('11e1-b');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'same-id', unpaid: '40' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'same-id', unpaid: '7' })],
    );

    const getDetail = vi.fn(async (_token: string, id: string) => {
      if (id === 'same-id') {
        throw new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 });
      }
      return { id };
    });
    const service = createPresenceService(getDetail);
    const summary = await service.maintainPresence({
      scope: { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      kind: 'RECEIVABLE',
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      autoTombstone: true,
      now: () => new Date('2026-09-21T15:00:00.000Z'),
    });
    expect(summary.tombstoned).toBe(1);

    const deletedA = await prisma.receivable.findFirst({
      where: { integrationId: a.integration.id, externalId: 'same-id' },
    });
    const stillB = await prisma.receivable.findFirst({
      where: { integrationId: b.integration.id, externalId: 'same-id' },
    });
    expect(deletedA?.lifecycleStatus).toBe('DELETED');
    expect(deletedA?.lifecycleDeletedAt).not.toBeNull();
    expect(deletedA?.status).toBe('OPEN');
    expect(stillB?.lifecycleStatus).toBe('ACTIVE');

    // 12/13 — reativação limpa DELETED
    await financial.upsertReceivables(
      {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        syncedAt: new Date('2026-09-21T16:00:00.000Z'),
      },
      [installment({ externalId: 'same-id', unpaid: '40' })],
    );
    const revived = await prisma.receivable.findFirst({
      where: { integrationId: a.integration.id, externalId: 'same-id' },
    });
    expect(revived?.lifecycleStatus).toBe('ACTIVE');
    expect(revived?.lifecycleDeletedAt).toBeNull();
  });

  it('ordenação never-checked → oldest; limite bounded; sem starvation AR/AP', async () => {
    const { tenant, integration } = await seedConnected('11e1-order');
    const syncedAt = new Date();
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await financial.upsertReceivables(scope, [
      installment({ externalId: 'ar-c' }),
      installment({ externalId: 'ar-b' }),
      installment({ externalId: 'ar-a' }),
      installment({ externalId: 'ar-old' }),
      installment({ externalId: 'ar-newer' }),
    ]);
    await financial.upsertPayables(
      scope,
      Array.from({ length: 55 }, (_, i) =>
        installment({ externalId: `ap-${String(i).padStart(3, '0')}` }),
      ),
    );

    await presenceRepo.touchPresenceCheckpoint({
      tenantId: tenant.id,
      integrationId: integration.id,
      kind: 'RECEIVABLE',
      externalId: 'ar-old',
      checkedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    await presenceRepo.touchPresenceCheckpoint({
      tenantId: tenant.id,
      integrationId: integration.id,
      kind: 'RECEIVABLE',
      externalId: 'ar-newer',
      checkedAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    const ar = await presenceRepo.listBoundedPresenceProbeCandidates({
      ...scope,
      kind: 'RECEIVABLE',
      limit: MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
    });
    expect(ar.map((row) => row.externalId)).toEqual([
      'ar-a',
      'ar-b',
      'ar-c',
      'ar-old',
      'ar-newer',
    ]);

    const ap = await presenceRepo.listBoundedPresenceProbeCandidates({
      ...scope,
      kind: 'PAYABLE',
      limit: MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
    });
    expect(ap).toHaveLength(50);
    expect(ap.every((row) => row.kind === 'PAYABLE')).toBe(true);
    expect(ap[0]?.externalId).toBe('ap-000');
  });

  it('estoque/previsto exclui DELETED; histórico e ledger realizado intactos; CC enrich exclui', async () => {
    const { tenant, integration } = await seedConnected('11e1-reads');
    const syncedAt = new Date();
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'alive',
        status: 'OVERDUE',
        dueDate: '2026-09-10',
        unpaid: '25',
      }),
      installment({
        externalId: 'expected-live',
        status: 'OPEN',
        dueDate: '2026-09-28',
        unpaid: '15',
      }),
      installment({
        externalId: 'ghost',
        status: 'OPEN',
        dueDate: '2026-09-28',
        unpaid: '50',
      }),
    ]);
    await financial.upsertPayables(scope, [
      installment({
        externalId: 'ap-ghost',
        status: 'OPEN',
        dueDate: '2026-09-28',
        unpaid: '30',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      mapSettlement({
        id: 'baixa-alive',
        id_parcela: 'alive',
        data_pagamento: '2026-09-05',
        tipo_evento_financeiro: 'RECEITA',
        valor_composicao: {
          valor_bruto: '12',
          valor_liquido: '12',
          juros: '0',
          multa: '0',
          desconto: '0',
          taxa: '0',
        },
      }),
    ]);

    await presenceRepo.markDeleted({
      tenantId: tenant.id,
      integrationId: integration.id,
      kind: 'RECEIVABLE',
      externalId: 'ghost',
      deletedAt: new Date('2026-09-21T15:00:00.000Z'),
    });
    await presenceRepo.markDeleted({
      tenantId: tenant.id,
      integrationId: integration.id,
      kind: 'PAYABLE',
      externalId: 'ap-ghost',
      deletedAt: new Date('2026-09-21T15:00:00.000Z'),
    });

    const activeAr = await receivables.findActiveByTenant({ tenantId: tenant.id });
    expect(activeAr.map((row) => row.externalId).sort()).toEqual(['alive', 'expected-live']);

    const hist = await receivables.findByExternalIds({ tenantId: tenant.id }, ['ghost', 'alive']);
    expect(hist.map((row) => row.externalId).sort()).toEqual(['alive', 'ghost']);

    const now = new Date('2026-09-20T15:00:00.000Z');
    const flow = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      now,
      monthKey: '2026-09',
    });
    // 26/27 — realizado intacto; 28 — previsto não conta ghost (50), só expected-live (15)
    expect(flow.realized.inflows?.toString()).toBe('12');
    expect(flow.expected.receivables?.toString()).toBe('15');
    expect(flow.overdue.receivables?.toString()).toBe('25');
    expect(flow.expected.payables?.toString() ?? '0').toBe('0');

    const cc = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(cc.candidates.every((row) => row.externalId !== 'ghost')).toBe(true);
    expect(cc.candidates.every((row) => row.externalId !== 'ap-ghost')).toBe(true);
    expect(cc.candidates.some((row) => row.externalId === 'alive')).toBe(true);
  });

  it('29/30 — OVERDUE + GET 200 permanece ACTIVE; PAID/QUITADO não vira DELETED', async () => {
    const { tenant, integration } = await seedConnected('11e1-status');
    const syncedAt = new Date();
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };
    await financial.upsertReceivables(scope, [
      installment({ externalId: 'overdue-ok', status: 'OVERDUE', unpaid: '9' }),
      installment({
        externalId: 'paid-ok',
        status: 'PAID',
        unpaid: '0',
        paid: '9',
        total: '9',
      }),
    ]);
    // PAID não é candidato analítico; só OVERDUE entra no probe
    const getDetail = vi.fn(async () => ({ id: 'overdue-ok', status: 'ATRASADO' }));
    const service = createPresenceService(getDetail);
    const summary = await service.maintainPresence({
      scope,
      kind: 'RECEIVABLE',
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      autoTombstone: true,
    });
    expect(summary.found200).toBe(1);
    expect(summary.tombstoned).toBe(0);
    const overdue = await prisma.receivable.findFirst({
      where: { integrationId: integration.id, externalId: 'overdue-ok' },
    });
    const paid = await prisma.receivable.findFirst({
      where: { integrationId: integration.id, externalId: 'paid-ok' },
    });
    expect(overdue?.lifecycleStatus).toBe('ACTIVE');
    expect(paid?.lifecycleStatus).toBe('ACTIVE');
    expect(paid?.status).toBe('PAID');
  });

  it('31/32 — ausência full/incremental sem probe NÃO tombstona', async () => {
    const { tenant, integration } = await seedConnected('11e1-no-probe');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt },
      [installment({ externalId: 'stale-local', unpaid: '11' })],
    );
    // Sync full/incremental ausente = apenas não upsertar de novo. Sem maintainPresence.
    const row = await prisma.receivable.findFirst({
      where: { integrationId: integration.id, externalId: 'stale-local' },
    });
    expect(row?.lifecycleStatus).toBe('ACTIVE');
    expect(row?.status).toBe('OPEN');
  });
});
