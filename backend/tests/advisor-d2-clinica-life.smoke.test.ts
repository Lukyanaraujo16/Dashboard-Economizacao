import { afterAll, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import {
  createAdvisorCashBreakdownService,
  createAdvisorCashMovementLinesService,
  rankAdvisorCashRealizedBreakdown,
} from '../src/modules/advisor/index.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../src/modules/finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../src/modules/finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createReportCashDetailsService } from '../src/modules/reports/services/report-cash-details.service.js';

const CLINICA_LIFE_TENANT = '8b7e9b53-3435-476a-be47-56908ca846c5';

describe('F13.8.1D2 smoke read-only Clínica Life', () => {
  it('breakdown e movement lines de agosto sem PII desnecessária', async () => {
    const prisma = getPrismaClient();
    const tenant = await prisma.tenant.findUnique({
      where: { id: CLINICA_LIFE_TENANT },
      select: { id: true },
    });
    if (tenant === null) {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_d2_smoke_skipped',
          reason: 'tenant ausente no banco local',
        }),
      );
      return;
    }

    const ledger = createLedgerReadRepository(prisma);
    const receivables = createReceivableReadRepository(prisma);
    const payables = createPayableReadRepository(prisma);
    const categories = createFinancialCategoryReadRepository(prisma);
    const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
    const cashFlow = createMonthlyCashFlowService({
      ledger,
      receivables,
      payables,
      categories,
      costCenterAllocations,
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    const breakdown = createAdvisorCashBreakdownService({ cashFlow });
    const movements = createAdvisorCashMovementLinesService({
      reportCashDetails: createReportCashDetailsService({
        ledger,
        receivables,
        payables,
        categories,
        parties: createPartyReadRepository(prisma),
        costCenters: createCostCenterReadRepository(prisma),
        costCenterAllocations,
      }),
    });

    const [inflow, outflow, receipts, payments] = await Promise.all([
      breakdown.breakdown({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        direction: 'INFLOW',
        limit: 5,
        now,
      }),
      breakdown.breakdown({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        limit: 5,
        now,
      }),
      movements.list({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        direction: 'INFLOW',
        sort: 'AMOUNT_DESC',
        limit: 5,
        now,
      }),
      movements.list({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        sort: 'AMOUNT_DESC',
        limit: 5,
        now,
      }),
    ]);

    expect(inflow.tenantId).toBe(CLINICA_LIFE_TENANT);
    expect(inflow.monthKey).toBe('2026-08');
    expect(inflow.scope).toBe('PERIOD');
    expect(outflow.direction).toBe('OUTFLOW');
    expect(receipts.returnedCount).toBeLessThanOrEqual(5);
    expect(payments.returnedCount).toBeLessThanOrEqual(5);
    expect(receipts.lines.every((line) => line.date.startsWith('2026-08'))).toBe(true);
    expect(JSON.stringify(receipts.lines)).not.toMatch(/cpf|cnpj|@|telefone/i);
    expect(receipts.lines.every((line) => !('installmentExternalId' in line))).toBe(true);

    const official = rankAdvisorCashRealizedBreakdown({
      flow: await cashFlow.getMonthlyCashFlow({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        now,
      }),
      direction: 'INFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(official.categories.map((item) => item.key)).toEqual(
      inflow.categories.map((item) => item.key),
    );

    console.info(
      JSON.stringify({
        event: 'clinica_life_d2_smoke',
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-08',
        inflowStatus: inflow.status,
        inflowCount: inflow.categories.length,
        inflowHasMore: inflow.hasMore,
        outflowStatus: outflow.status,
        outflowCount: outflow.categories.length,
        receiptCount: receipts.returnedCount,
        receiptHasMore: receipts.hasMore,
        paymentCount: payments.returnedCount,
        paymentHasMore: payments.hasMore,
      }),
    );
  });
});

afterAll(async () => {
  await disconnectPrisma();
});
