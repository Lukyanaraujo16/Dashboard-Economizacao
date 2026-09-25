import { afterAll, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createAdvisorCashMovementLinesService } from '../src/modules/advisor/index.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createCostCenterReadRepository } from '../src/modules/finance/repositories/cost-center-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createPartyReadRepository } from '../src/modules/finance/repositories/party-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createReportCashDetailsService } from '../src/modules/reports/services/report-cash-details.service.js';

const CLINICA_LIFE_TENANT = '8b7e9b53-3435-476a-be47-56908ca846c5';

describe('F13.8.1D2.1 smoke read-only Clínica Life', () => {
  it('julho limit 10 e regressões de agosto sem PII', async () => {
    const prisma = getPrismaClient();
    const tenant = await prisma.tenant.findUnique({
      where: { id: CLINICA_LIFE_TENANT },
      select: { id: true },
    });
    if (tenant === null) {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_d21_smoke_skipped',
          reason: 'tenant ausente no banco local',
        }),
      );
      return;
    }

    const movements = createAdvisorCashMovementLinesService({
      reportCashDetails: createReportCashDetailsService({
        ledger: createLedgerReadRepository(prisma),
        receivables: createReceivableReadRepository(prisma),
        payables: createPayableReadRepository(prisma),
        categories: createFinancialCategoryReadRepository(prisma),
        parties: createPartyReadRepository(prisma),
        costCenters: createCostCenterReadRepository(prisma),
        costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
      }),
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    const [julIn, julOut, agoIn] = await Promise.all([
      movements.list({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-07',
        direction: 'INFLOW',
        sort: 'AMOUNT_DESC',
        limit: 10,
        now,
      }),
      movements.list({
        tenantId: CLINICA_LIFE_TENANT,
        monthKey: '2026-07',
        direction: 'OUTFLOW',
        sort: 'AMOUNT_DESC',
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
    ]);

    expect(julIn.status).toBe('OK');
    expect(julIn.monthKey).toBe('2026-07');
    expect(julIn.effectiveLimit).toBe(10);
    expect(julIn.returnedCount).toBeLessThanOrEqual(10);
    expect(julIn.returnedCount).toBeGreaterThan(0);
    expect(julOut.effectiveLimit).toBe(5);
    expect(julOut.returnedCount).toBeLessThanOrEqual(5);
    expect(agoIn.monthKey).toBe('2026-08');
    expect(agoIn.effectiveLimit).toBe(5);
    expect(JSON.stringify(julIn.lines)).not.toMatch(/cpf|cnpj|@|telefone/i);
    expect(julIn.lines.every((line) => !('installmentExternalId' in line))).toBe(true);

    console.info(
      JSON.stringify({
        event: 'clinica_life_d21_smoke',
        tenantId: CLINICA_LIFE_TENANT,
        julIn: {
          status: julIn.status,
          effectiveLimit: julIn.effectiveLimit,
          returnedCount: julIn.returnedCount,
          hasMore: julIn.hasMore,
        },
        julOut: {
          status: julOut.status,
          effectiveLimit: julOut.effectiveLimit,
          returnedCount: julOut.returnedCount,
          hasMore: julOut.hasMore,
        },
        agoIn: {
          status: agoIn.status,
          effectiveLimit: agoIn.effectiveLimit,
          returnedCount: agoIn.returnedCount,
          hasMore: agoIn.hasMore,
        },
      }),
    );
  });
});

afterAll(async () => {
  await disconnectPrisma();
});
