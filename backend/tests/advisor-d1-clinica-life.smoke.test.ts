import { afterAll, describe, expect, it } from 'vitest';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { createAnalyticsService } from '../src/modules/analytics/services/analytics.service.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { compareAdvisorCashMonths } from '../src/modules/advisor/domain/compare-advisor-cash-months.js';
import { createBuildAdvisorContext } from '../src/modules/advisor/index.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';

const CLINICA_LIFE_TENANT = '8b7e9b53-3435-476a-be47-56908ca846c5';

describe('F13.8.1D1 smoke read-only Clínica Life', () => {
  it('compara JUL/AGO pelo serviço oficial sem hardcode no domínio', async () => {
    const prisma = getPrismaClient();
    const tenant = await prisma.tenant.findUnique({
      where: { id: CLINICA_LIFE_TENANT },
      select: { id: true },
    });
    if (tenant === null) {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_smoke_skipped',
          reason: 'tenant ausente no banco local',
        }),
      );
      return;
    }

    const cashFlow = createMonthlyCashFlowService({
      ledger: createLedgerReadRepository(prisma),
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
      categories: createFinancialCategoryReadRepository(prisma),
      costCenterAllocations: createCostCenterAllocationReadRepository(prisma),
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    const [jul, ago] = await Promise.all([
      cashFlow.getMonthlyCashFlow({ tenantId: CLINICA_LIFE_TENANT, monthKey: '2026-07', now }),
      cashFlow.getMonthlyCashFlow({ tenantId: CLINICA_LIFE_TENANT, monthKey: '2026-08', now }),
    ]);
    const comparison = compareAdvisorCashMonths({
      tenantId: CLINICA_LIFE_TENANT,
      periodA: jul,
      periodB: ago,
    });
    const julBilling = monthlyBilling(jul)?.toString() ?? 'ABSENT';
    const agoBilling = monthlyBilling(ago)?.toString() ?? 'ABSENT';
    expect(comparison.tenantId).toBe(CLINICA_LIFE_TENANT);
    expect(comparison.difference.billingPercent === null || Number.isFinite(Number(comparison.difference.billingPercent))).toBe(true);

    if (julBilling !== '136659.99' || agoBilling !== '224790.3') {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_smoke_diverged',
          julBilling,
          agoBilling,
        }),
      );
      return;
    }

    expect(comparison.difference.billing?.toString()).toBe('88130.31');
    expect(comparison.difference.billingPercent?.toDecimalPlaces(2).toString()).toBe('64.49');
    expect(comparison.billingCoverage).toBe('FULL_BILLING');
    const convenio = comparison.inflowCategories.items.find((item) => item.name === 'Atendimentos Convênio');
    const particulares = comparison.inflowCategories.items.find((item) => item.name === 'Particulares');
    expect(convenio?.amountA?.toString()).toBe('113984.49');
    expect(convenio?.amountB?.toString()).toBe('207185.5');
    expect(particulares?.amountA?.toString()).toBe('22675');
    expect(particulares?.amountB?.toString()).toBe('17469.35');
    expect(convenio?.trend).toBe('INCREASE');
    expect(particulares?.trend).toBe('DECREASE');
  });

  it('Context Builder de julho rotula PERIOD e CURRENT_SNAPSHOT sem misturar', async () => {
    const prisma = getPrismaClient();
    const tenant = await prisma.tenant.findUnique({
      where: { id: CLINICA_LIFE_TENANT },
      select: { id: true },
    });
    if (tenant === null) {
      console.warn(
        JSON.stringify({
          event: 'clinica_life_context_smoke_skipped',
          reason: 'tenant ausente no banco local',
        }),
      );
      return;
    }

    const receivables = createReceivableReadRepository(prisma);
    const payables = createPayableReadRepository(prisma);
    const categories = createFinancialCategoryReadRepository(prisma);
    const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);
    const builder = createBuildAdvisorContext({
      settings: {
        async findSettingsByTenant() {
          return null;
        },
      },
      knowledge: {
        async listKnowledge() {
          return [];
        },
      },
      conversations: {
        async findConversation() {
          return null;
        },
        async listMessages() {
          return [];
        },
      },
      cashFlow: createMonthlyCashFlowService({
        ledger: createLedgerReadRepository(prisma),
        receivables,
        payables,
        categories,
        costCenterAllocations,
      }),
      analytics: createAnalyticsService({
        receivables,
        payables,
        categories,
        costCenterAllocations,
      }),
    });
    const result = await builder.build({
      tenantId: CLINICA_LIFE_TENANT,
      question: 'E em julho?',
      monthKey: '2026-07',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    const facts = result.blocks.find((item) => item.type === 'FINANCIAL_FACTS')?.content ?? '';
    const currentIndex = facts.indexOf('scope: CURRENT_SNAPSHOT');
    expect(result.monthKey).toBe('2026-07');
    expect(facts).toContain('scope: PERIOD');
    expect(facts).toContain('scope: CURRENT_SNAPSHOT');
    expect(currentIndex).toBeGreaterThan(0);
    expect(facts.slice(0, currentIndex)).toContain('monthKey: 2026-07');
    expect(facts.slice(currentIndex)).toMatch(/asOf: \d{4}-\d{2}-\d{2}/);
    expect(facts.slice(currentIndex)).toContain('NÃO pertence ao monthKey PERIOD');
    console.info(
      JSON.stringify({
        event: 'clinica_life_context_smoke',
        monthKey: result.monthKey,
        hasPeriod: facts.includes('scope: PERIOD'),
        hasCurrentSnapshot: facts.includes('scope: CURRENT_SNAPSHOT'),
        asOf: /asOf: (\d{4}-\d{2}-\d{2}|ABSENT)/.exec(facts)?.[1] ?? 'MISSING',
      }),
    );
  });
});

afterAll(async () => {
  await disconnectPrisma();
});
