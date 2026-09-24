import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthKey, isValidMonthKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { createAnalyticsService } from '../src/modules/analytics/services/analytics.service.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import {
  ADVISOR_FINANCIAL_ABSENT,
  AdvisorDomainError,
  createAdvisorConversationRepository,
  createAdvisorKnowledgeRepository,
  createAdvisorSettingsRepository,
  createBuildAdvisorContext,
  formatAdvisorFinancialAmount,
  type AdvisorBuiltContext,
} from '../src/modules/advisor/index.js';
import { buildFinancialFactsContent } from '../src/modules/advisor/domain/financial-facts-text.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const ledgerWrite = createContaAzulLedgerRepository(prisma);
const settings = createAdvisorSettingsRepository(prisma);
const knowledge = createAdvisorKnowledgeRepository(prisma);
const conversations = createAdvisorConversationRepository(prisma);

const receivables = createReceivableReadRepository(prisma);
const payables = createPayableReadRepository(prisma);
const categories = createFinancialCategoryReadRepository(prisma);
const costCenterAllocations = createCostCenterAllocationReadRepository(prisma);

const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables,
  payables,
  categories,
  costCenterAllocations,
});
const analytics = createAnalyticsService({
  receivables,
  payables,
  categories,
  costCenterAllocations,
});

const AUGUST_NOW = new Date('2026-08-26T15:00:00.000Z');
const AUGUST_MONTH = '2026-08';
const LAST_INSTANT_SEPTEMBER_SP = new Date('2026-10-01T02:59:59.999Z');
const FIRST_INSTANT_OCTOBER_SP = new Date('2026-10-01T03:00:00.000Z');

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

function createBuilder() {
  const calls = {
    cashFlow: [] as Array<{ tenantId: string; monthKey?: string; now?: Date }>,
    snapshot: [] as Array<{ tenantId: string; now?: Date }>,
  };

  return {
    calls,
    builder: createBuildAdvisorContext({
      settings,
      knowledge,
      conversations,
      cashFlow: {
        async getMonthlyCashFlow(input) {
          calls.cashFlow.push(input);
          return cashFlow.getMonthlyCashFlow(input);
        },
      },
      analytics: {
        async getFinancialStockSnapshot(input) {
          calls.snapshot.push(input);
          return analytics.getFinancialStockSnapshot(input);
        },
      },
    }),
  };
}

async function officialOutputs(input: { tenantId: string; monthKey?: string; now: Date }) {
  const [flow, snapshot] = await Promise.all([
    cashFlow.getMonthlyCashFlow(input),
    analytics.getFinancialStockSnapshot({ tenantId: input.tenantId, now: input.now }),
  ]);
  return { flow, snapshot };
}

function factsBlock(result: AdvisorBuiltContext) {
  const found = result.blocks.find((item) => item.type === 'FINANCIAL_FACTS');
  if (!found) {
    throw new Error('Bloco FINANCIAL_FACTS ausente');
  }
  return found;
}

function expectFactsMatchOfficial(input: {
  readonly result: AdvisorBuiltContext;
  readonly monthKey: string;
  readonly flow: MonthlyCashFlow;
  readonly snapshot: FinancialStockSnapshot;
}): void {
  const facts = factsBlock(input.result);
  const officialBilling = monthlyBilling(input.flow);

  expect(input.result.monthKey).toBe(input.monthKey);
  expect(facts.trustLevel).toBe('ANALYTICAL_FACT');
  expect(facts.source).toEqual({
    kind: 'analytical',
    monthKey: input.monthKey,
    service: 'monthlyCashFlow+stockSnapshot+monthlyBilling',
  });
  expect(facts.content).toBe(
    buildFinancialFactsContent({
      monthKey: input.monthKey,
      flow: input.flow,
      snapshot: input.snapshot,
    }),
  );

  expect(facts.content).toContain(`monthKey: ${input.monthKey}`);
  expect(facts.content).toContain(`billing: ${formatAdvisorFinancialAmount(officialBilling)}`);
  expect(facts.content).toContain(
    `cash.realized.inflows: ${formatAdvisorFinancialAmount(input.flow.realized.inflows)}`,
  );
  expect(facts.content).toContain(
    `cash.realized.outflows: ${formatAdvisorFinancialAmount(input.flow.realized.outflows)}`,
  );
  expect(facts.content).toContain(
    `cash.realized.result: ${formatAdvisorFinancialAmount(input.flow.realized.result)}`,
  );
  expect(facts.content).toContain(
    `cash.expected.receivables: ${formatAdvisorFinancialAmount(input.flow.expected.receivables)}`,
  );
  expect(facts.content).toContain(
    `cash.expected.payables: ${formatAdvisorFinancialAmount(input.flow.expected.payables)}`,
  );
  expect(facts.content).toContain(
    `cash.expected.result: ${formatAdvisorFinancialAmount(input.flow.expected.result)}`,
  );
  expect(facts.content).toContain(
    `cash.overdue.receivables: ${formatAdvisorFinancialAmount(input.flow.overdue.receivables)}`,
  );
  expect(facts.content).toContain(
    `cash.overdue.payables: ${formatAdvisorFinancialAmount(input.flow.overdue.payables)}`,
  );
  expect(facts.content).toContain(
    `cash.overdue.ofMonth.receivables: ${formatAdvisorFinancialAmount(input.flow.overdue.ofMonth.receivables)}`,
  );
  expect(facts.content).toContain(
    `cash.overdue.ofMonth.payables: ${formatAdvisorFinancialAmount(input.flow.overdue.ofMonth.payables)}`,
  );
  expect(facts.content).toContain(
    `stock.receivables.open: ${formatAdvisorFinancialAmount(input.snapshot.receivables.open)}`,
  );
  expect(facts.content).toContain(
    `stock.receivables.overdue: ${formatAdvisorFinancialAmount(input.snapshot.receivables.overdue)}`,
  );
  expect(facts.content).toContain(
    `stock.payables.open: ${formatAdvisorFinancialAmount(input.snapshot.payables.open)}`,
  );
  expect(facts.content).toContain(
    `stock.payables.overdue: ${formatAdvisorFinancialAmount(input.snapshot.payables.overdue)}`,
  );
  expect(facts.content).toContain(
    `receivableDelinquency.overdueUnpaid: ${formatAdvisorFinancialAmount(input.snapshot.receivableDelinquency.overdueUnpaid)}`,
  );
  expect(facts.content).toContain(
    `receivableDelinquency.openUnpaid: ${formatAdvisorFinancialAmount(input.snapshot.receivableDelinquency.openUnpaid)}`,
  );
  expect(facts.content).toContain(
    `receivableDelinquency.rate: ${formatAdvisorFinancialAmount(input.snapshot.receivableDelinquency.rate)}`,
  );
}

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
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [],
  };
}

function baixa(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly data: string;
  readonly tipo?: 'RECEITA' | 'DESPESA';
  readonly bruto: string;
  readonly liquido: string;
}) {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data,
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
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

async function seedAugustBooks(
  name: string,
  amounts: {
    readonly inflow: string;
    readonly outflow: string;
    readonly expectedReceivable: string;
    readonly overdueReceivable: string;
    readonly expectedPayable: string;
    readonly overduePayable: string;
  },
) {
  const seeded = await seedConnected(name);
  const scope = {
    tenantId: seeded.tenant.id,
    integrationId: seeded.integration.id,
    syncedAt: new Date(),
  };

  await financial.upsertReceivables(scope, [
    installment({
      externalId: `${name}-in`,
      dueDate: '2026-08-05',
      unpaid: '0',
      paid: amounts.inflow,
      status: 'PAID',
    }),
    installment({
      externalId: `${name}-ar-open`,
      dueDate: '2026-08-28',
      unpaid: amounts.expectedReceivable,
    }),
    installment({
      externalId: `${name}-ar-overdue`,
      dueDate: '2026-08-10',
      unpaid: amounts.overdueReceivable,
    }),
  ]);
  await financial.upsertPayables(scope, [
    installment({
      externalId: `${name}-out`,
      dueDate: '2026-08-05',
      unpaid: '0',
      paid: amounts.outflow,
      status: 'PAID',
    }),
    installment({
      externalId: `${name}-ap-open`,
      dueDate: '2026-08-29',
      unpaid: amounts.expectedPayable,
    }),
    installment({
      externalId: `${name}-ap-overdue`,
      dueDate: '2026-08-01',
      unpaid: amounts.overduePayable,
    }),
  ]);
  await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
    baixa({
      id: `${name}-in-b`,
      installmentId: `${name}-in`,
      data: '2026-08-05',
      bruto: amounts.inflow,
      liquido: amounts.inflow,
    }),
  ]);
  await ledgerWrite.upsertSettlements(scope, 'PAYABLE', [
    baixa({
      id: `${name}-out-b`,
      installmentId: `${name}-out`,
      data: '2026-08-05',
      tipo: 'DESPESA',
      bruto: amounts.outflow,
      liquido: amounts.outflow,
    }),
  ]);

  return seeded;
}

describe('paridade financeira do Context Builder (Motor Analítico)', () => {
  it('FINANCIAL_FACTS reproduz formatAdvisorFinancialAmount dos services oficiais', async () => {
    const seeded = await seedAugustBooks('parity-a', {
      inflow: '111.11',
      outflow: '66.66',
      expectedReceivable: '222.22',
      overdueReceivable: '333.33',
      expectedPayable: '44.44',
      overduePayable: '55.55',
    });
    const official = await officialOutputs({
      tenantId: seeded.tenant.id,
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });
    expect(official.flow.realized.inflows?.toString()).toBe('111.11');
    expect(official.flow.expected.receivables?.toString()).toBe('222.22');
    expect(official.flow.overdue.receivables?.toString()).toBe('333.33');
    expect(official.snapshot.receivableDelinquency.rate).not.toBeNull();

    const { builder, calls } = createBuilder();
    const result = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'Como está o caixa?',
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });

    expect(calls.cashFlow).toEqual([
      { tenantId: seeded.tenant.id, monthKey: AUGUST_MONTH, now: AUGUST_NOW },
    ]);
    expect(calls.snapshot).toEqual([{ tenantId: seeded.tenant.id, now: AUGUST_NOW }]);
    expectFactsMatchOfficial({
      result,
      monthKey: AUGUST_MONTH,
      flow: official.flow,
      snapshot: official.snapshot,
    });
  });

  it('zero oficial vira "0" e null oficial vira ABSENT — nunca null vira 0', async () => {
    const seeded = await seedConnected('parity-empty');
    const official = await officialOutputs({
      tenantId: seeded.tenant.id,
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });

    expect(official.flow.realized.inflows?.toString()).toBe('0');
    expect(official.flow.realized.outflows?.toString()).toBe('0');
    expect(official.snapshot.receivables.open.equals(0)).toBe(true);
    expect(official.snapshot.receivableDelinquency.rate).toBeNull();
    expect(formatAdvisorFinancialAmount(null)).toBe(ADVISOR_FINANCIAL_ABSENT);
    expect(formatAdvisorFinancialAmount(new Prisma.Decimal('0'))).toBe('0');

    const { builder } = createBuilder();
    const result = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'Há inadimplência?',
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });
    const facts = factsBlock(result).content;

    expectFactsMatchOfficial({
      result,
      monthKey: AUGUST_MONTH,
      flow: official.flow,
      snapshot: official.snapshot,
    });
    expect(facts).toContain('cash.realized.inflows: 0');
    expect(facts).toContain('cash.realized.outflows: 0');
    expect(facts).toContain('stock.receivables.open: 0');
    expect(facts).toContain(`billing: ${formatAdvisorFinancialAmount(monthlyBilling(official.flow))}`);
    expect(facts).toContain(`receivableDelinquency.rate: ${ADVISOR_FINANCIAL_ABSENT}`);
    expect(facts).not.toMatch(/receivableDelinquency\.rate: 0/);
  });

  it('monthKey explícito é o do service; default é mês civil São Paulo via now', async () => {
    const seeded = await seedAugustBooks('parity-month', {
      inflow: '10.25',
      outflow: '1.25',
      expectedReceivable: '5.50',
      overdueReceivable: '2.00',
      expectedPayable: '1.00',
      overduePayable: '0.50',
    });
    const implicitNow = new Date('2026-10-01T02:00:00.000Z');
    const implicitMonth = civilMonthKey(civilTodayInSaoPaulo(implicitNow));
    expect(implicitNow.toISOString().startsWith('2026-10-01')).toBe(true);
    expect(implicitMonth).toBe('2026-09');

    const { builder, calls } = createBuilder();
    const explicit = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'agosto',
      monthKey: AUGUST_MONTH,
      now: implicitNow,
    });
    const officialAugust = await officialOutputs({
      tenantId: seeded.tenant.id,
      monthKey: AUGUST_MONTH,
      now: implicitNow,
    });
    expect(calls.cashFlow.at(-1)?.monthKey).toBe(AUGUST_MONTH);
    expectFactsMatchOfficial({
      result: explicit,
      monthKey: AUGUST_MONTH,
      flow: officialAugust.flow,
      snapshot: officialAugust.snapshot,
    });

    const implicit = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'mês atual',
      now: implicitNow,
    });
    const officialImplicit = await officialOutputs({
      tenantId: seeded.tenant.id,
      now: implicitNow,
    });
    expect(implicit.monthKey).toBe(implicitMonth);
    expect(calls.cashFlow.at(-1)?.monthKey).toBe(implicitMonth);
    expect(calls.cashFlow.at(-1)?.now).toBe(implicitNow);
    expect(calls.snapshot.at(-1)?.now).toBe(implicitNow);
    expectFactsMatchOfficial({
      result: implicit,
      monthKey: implicitMonth,
      flow: officialImplicit.flow,
      snapshot: officialImplicit.snapshot,
    });
  });

  it('virada de mês usa clock injetável em America/Sao_Paulo, nunca UTC', async () => {
    expect(LAST_INSTANT_SEPTEMBER_SP.toISOString().startsWith('2026-10-01')).toBe(true);
    expect(FIRST_INSTANT_OCTOBER_SP.toISOString().startsWith('2026-10-01')).toBe(true);
    expect(civilMonthKey(civilTodayInSaoPaulo(LAST_INSTANT_SEPTEMBER_SP))).toBe('2026-09');
    expect(civilMonthKey(civilTodayInSaoPaulo(FIRST_INSTANT_OCTOBER_SP))).toBe('2026-10');

    const seeded = await seedConnected('parity-rollover');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'sep-in',
        dueDate: '2026-09-15',
        unpaid: '0',
        paid: '101.01',
        status: 'PAID',
      }),
      installment({
        externalId: 'oct-in',
        dueDate: '2026-10-02',
        unpaid: '0',
        paid: '202.02',
        status: 'PAID',
      }),
      installment({
        externalId: 'due-sep-30',
        dueDate: '2026-09-30',
        unpaid: '50.50',
      }),
    ]);
    await ledgerWrite.upsertSettlements(scope, 'RECEIVABLE', [
      baixa({
        id: 'sep-b',
        installmentId: 'sep-in',
        data: '2026-09-15',
        bruto: '101.01',
        liquido: '101.01',
      }),
      baixa({
        id: 'oct-b',
        installmentId: 'oct-in',
        data: '2026-10-02',
        bruto: '202.02',
        liquido: '202.02',
      }),
    ]);

    const { builder } = createBuilder();
    const september = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'antes da virada',
      now: LAST_INSTANT_SEPTEMBER_SP,
    });
    const october = await builder.build({
      tenantId: seeded.tenant.id,
      question: 'depois da virada',
      now: FIRST_INSTANT_OCTOBER_SP,
    });
    const officialSeptember = await officialOutputs({
      tenantId: seeded.tenant.id,
      now: LAST_INSTANT_SEPTEMBER_SP,
    });
    const officialOctober = await officialOutputs({
      tenantId: seeded.tenant.id,
      now: FIRST_INSTANT_OCTOBER_SP,
    });

    expect(september.monthKey).toBe('2026-09');
    expect(october.monthKey).toBe('2026-10');
    expect(officialSeptember.flow.realized.inflows?.toString()).toBe('101.01');
    expect(officialOctober.flow.realized.inflows?.toString()).toBe('202.02');
    expect(officialSeptember.snapshot.receivables.overdue.equals(0)).toBe(true);
    expect(officialOctober.snapshot.receivables.overdue.equals(new Prisma.Decimal('50.50'))).toBe(
      true,
    );
    expectFactsMatchOfficial({
      result: september,
      monthKey: '2026-09',
      flow: officialSeptember.flow,
      snapshot: officialSeptember.snapshot,
    });
    expectFactsMatchOfficial({
      result: october,
      monthKey: '2026-10',
      flow: officialOctober.flow,
      snapshot: officialOctober.snapshot,
    });
    expect(factsBlock(september).content).not.toContain(
      `cash.realized.inflows: ${formatAdvisorFinancialAmount(officialOctober.flow.realized.inflows)}`,
    );
    expect(factsBlock(october).content).not.toContain(
      `cash.realized.inflows: ${formatAdvisorFinancialAmount(officialSeptember.flow.realized.inflows)}`,
    );
  });

  it('fatos do tenant A não incluem valores oficiais do tenant B', async () => {
    const a = await seedAugustBooks('parity-tenant-a', {
      inflow: '111.11',
      outflow: '66.66',
      expectedReceivable: '222.22',
      overdueReceivable: '333.33',
      expectedPayable: '44.44',
      overduePayable: '55.55',
    });
    const b = await seedAugustBooks('parity-tenant-b', {
      inflow: '9876.54',
      outflow: '8765.43',
      expectedReceivable: '7654.32',
      overdueReceivable: '5432.10',
      expectedPayable: '4321.09',
      overduePayable: '3210.98',
    });

    const officialA = await officialOutputs({
      tenantId: a.tenant.id,
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });
    const officialB = await officialOutputs({
      tenantId: b.tenant.id,
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });
    expect(officialA.flow.tenantId).toBe(a.tenant.id);
    expect(officialB.flow.tenantId).toBe(b.tenant.id);
    expect(formatAdvisorFinancialAmount(officialA.flow.realized.inflows)).not.toBe(
      formatAdvisorFinancialAmount(officialB.flow.realized.inflows),
    );

    const { builder, calls } = createBuilder();
    const resultA = await builder.build({
      tenantId: a.tenant.id,
      question: 'caixa da empresa A',
      monthKey: AUGUST_MONTH,
      now: AUGUST_NOW,
    });
    const factsA = factsBlock(resultA).content;

    expect(resultA.tenantId).toBe(a.tenant.id);
    expect(calls.cashFlow[0]?.tenantId).toBe(a.tenant.id);
    expect(calls.snapshot[0]?.tenantId).toBe(a.tenant.id);
    expectFactsMatchOfficial({
      result: resultA,
      monthKey: AUGUST_MONTH,
      flow: officialA.flow,
      snapshot: officialA.snapshot,
    });
    expect(factsA).not.toContain(formatAdvisorFinancialAmount(officialB.flow.realized.inflows));
    expect(factsA).not.toContain(formatAdvisorFinancialAmount(officialB.flow.expected.receivables));
    expect(factsA).not.toContain(formatAdvisorFinancialAmount(officialB.flow.overdue.receivables));
    expect(factsA).not.toContain(formatAdvisorFinancialAmount(officialB.flow.expected.payables));
    expect(factsA).not.toContain(b.tenant.id);
  });

  it('monthKey inválido no builder lança AdvisorDomainError', async () => {
    const seeded = await seedConnected('parity-invalid-month');
    const { builder, calls } = createBuilder();

    expect(isValidMonthKey('2026-08')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-8')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);

    await expect(
      builder.build({
        tenantId: seeded.tenant.id,
        question: 'mês inválido',
        monthKey: '2026-13',
        now: AUGUST_NOW,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AdvisorDomainError',
        code: 'MONTH_KEY_INVALID',
      }),
    );
    await expect(
      builder.build({
        tenantId: seeded.tenant.id,
        question: 'mês inválido',
        monthKey: '2026-8',
        now: AUGUST_NOW,
      }),
    ).rejects.toBeInstanceOf(AdvisorDomainError);
    expect(calls.cashFlow).toHaveLength(0);
    expect(calls.snapshot).toHaveLength(0);
  });
});
