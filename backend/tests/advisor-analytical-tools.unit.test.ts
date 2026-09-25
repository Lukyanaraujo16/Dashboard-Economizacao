import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_MAX_TOOL_ROUNDS,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  assertCompareCashMonthsArgs,
  createAdvisorAnalyticalToolExecutor,
  createAdvisorCashComparisonService,
  listAdvisorAnalyticalTools,
} from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';

function flow(tenantId: string, monthKey: string, inflows: string): MonthlyCashFlow {
  return {
    tenantId,
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey,
    from: new Date(`${monthKey}-01T00:00:00.000Z`),
    to: new Date(`${monthKey}-28T00:00:00.000Z`),
    costCenterCashSplit: true,
    realized: {
      inflows: new Prisma.Decimal(inflows),
      outflows: new Prisma.Decimal('0'),
      result: new Prisma.Decimal(inflows),
    },
    realizedByCategory: { inflows: null, outflows: null },
    expected: {
      receivables: new Prisma.Decimal('0'),
      payables: new Prisma.Decimal('0'),
      result: new Prisma.Decimal('0'),
    },
    overdue: {
      receivables: new Prisma.Decimal('0'),
      payables: new Prisma.Decimal('0'),
      ofMonth: { receivables: new Prisma.Decimal('0'), payables: new Prisma.Decimal('0') },
    },
    stock: {
      receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
      payables: { open: null, overdue: null, dueToday: null, upcoming: null },
    },
    coverage: null,
    daily: { realized: [], expected: [] },
  };
}

describe('Analytical Tools do Consultor (F13.8.1D1)', () => {
  it('allowlist contém compare_cash_months e rejeita tool desconhecida', async () => {
    expect(listAdvisorAnalyticalTools().map((tool) => tool.name)).toEqual([
      COMPARE_CASH_MONTHS_TOOL_NAME,
      'cash_realized_breakdown',
      'cash_movement_lines',
      'cash_nominal_dimension_ranking',
      'cash_nominal_dimension_lookup',
      'compare_cash_nominal_dimension',
      'cash_cost_center_ranking',
      'cash_cost_center_lookup',
    ]);
    expect(ADVISOR_MAX_TOOL_ROUNDS).toBe(3);
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('não deveria executar tool desconhecida');
        },
      },
    });
    const unknown = await executor.execute({
      tenantId: 'tenant-a',
      call: { id: '1', name: 'drop_table', arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' } },
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.content).toContain('UNAVAILABLE');
    expect(unknown.content).not.toContain('"billing":"0"');
  });

  it('rejeita tenantId do provider, args inválidos e não aceita SQL', () => {
    expect(() =>
      assertCompareCashMonthsArgs({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        tenantId: 'tenant-xyz',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCompareCashMonthsArgs({
        monthKey: '2026-13',
        comparisonMonthKey: '2026-07',
      }),
    ).toThrow(/YYYY-MM/);
    expect(() =>
      assertCompareCashMonthsArgs({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        sql: 'select 1',
      }),
    ).toThrow(/proibido|apenas monthKey/);
  });

  it('executa tenant-scoped, reusa cache e ignora tenantId do modelo', async () => {
    const calls: Array<{ tenantId: string; monthKey?: string }> = [];
    const cashComparison = createAdvisorCashComparisonService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          calls.push({ tenantId: input.tenantId, monthKey: input.monthKey });
          if (input.tenantId !== 'tenant-a') {
            throw new Error(`cross-tenant ${input.tenantId}`);
          }
          return flow(input.tenantId, input.monthKey ?? '2026-09', input.monthKey === '2026-08' ? '224790.3' : '136659.99');
        },
      },
    });
    const executor = createAdvisorAnalyticalToolExecutor({ cashComparison });
    const first = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'call-1',
        name: COMPARE_CASH_MONTHS_TOOL_NAME,
        arguments: {
          monthKey: '2026-08',
          comparisonMonthKey: '2026-07',
        },
      },
    });
    const second = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'call-2',
        name: COMPARE_CASH_MONTHS_TOOL_NAME,
        arguments: {
          monthKey: '2026-08',
          comparisonMonthKey: '2026-07',
        },
      },
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.content).toContain('88130.31');
    expect(calls.every((item) => item.tenantId === 'tenant-a')).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.map((item) => item.monthKey).sort()).toEqual(['2026-07', '2026-08']);

    const injected = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'call-3',
        name: COMPARE_CASH_MONTHS_TOOL_NAME,
        arguments: {
          monthKey: '2026-08',
          comparisonMonthKey: '2026-07',
          tenantId: 'tenant-b',
        },
      },
    });
    expect(injected.ok).toBe(false);
    expect(injected.content).toContain('UNAVAILABLE');
    expect(injected.content).not.toContain('tenant-b');
  });

  it('falha da tool vira UNAVAILABLE e não zero', async () => {
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('boom');
        },
      },
    });
    const failed = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'x',
        name: COMPARE_CASH_MONTHS_TOOL_NAME,
        arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
      },
    });
    expect(failed.ok).toBe(false);
    expect(failed.content).toContain('UNAVAILABLE');
    expect(failed.content).not.toMatch(/"billing":"0"/);
  });

  it('prompt injection de tenant não muda o runtime', async () => {
    const compare = vi.fn(async (input: { tenantId: string }) => {
      expect(input.tenantId).toBe('tenant-a');
      return {
        tenantId: 'tenant-a',
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        periodA: {
          monthKey: '2026-07',
          billing: new Prisma.Decimal('1'),
          realizedInflows: new Prisma.Decimal('1'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('1'),
          expectedReceivables: new Prisma.Decimal('0'),
          expectedPayables: new Prisma.Decimal('0'),
        },
        periodB: {
          monthKey: '2026-08',
          billing: new Prisma.Decimal('2'),
          realizedInflows: new Prisma.Decimal('2'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('2'),
          expectedReceivables: new Prisma.Decimal('0'),
          expectedPayables: new Prisma.Decimal('0'),
        },
        difference: {
          billing: new Prisma.Decimal('1'),
          billingPercent: new Prisma.Decimal('100'),
          realizedInflows: new Prisma.Decimal('1'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('1'),
        },
        billingCoverage: 'FULL_BILLING' as const,
        inflowCategories: { available: false, items: [], increases: [], decreases: [] },
        outflowCategories: { available: false, items: [], increases: [], decreases: [] },
      };
    });
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: { compare },
    });
    const result = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'inj',
        name: COMPARE_CASH_MONTHS_TOOL_NAME,
        arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
      },
    });
    expect(result.ok).toBe(true);
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });
});
