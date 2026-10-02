import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { monthlyBilling, monthlyExpenses } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  resolveOperationsIntegrationState,
  toOperationsCompanyFinancials,
} from '../src/modules/audit/domain/operations-overview.js';

function money(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function flow(input: {
  readonly inflows: string | null;
  readonly receivables: string | null;
  readonly outflows: string | null;
  readonly payables: string | null;
  readonly openReceivables: string | null;
  readonly openPayables: string | null;
  readonly overdueReceivables: string | null;
  readonly overduePayables: string | null;
}): MonthlyCashFlow {
  return {
    realized: {
      inflows: money(input.inflows),
      outflows: money(input.outflows),
      result: null,
    },
    expected: {
      receivables: money(input.receivables),
      payables: money(input.payables),
      result: null,
    },
    stock: {
      receivables: {
        open: money(input.openReceivables),
        overdue: money(input.overdueReceivables),
        dueToday: null,
        upcoming: null,
      },
      payables: {
        open: money(input.openPayables),
        overdue: money(input.overduePayables),
        dueToday: null,
        upcoming: null,
      },
    },
  } as MonthlyCashFlow;
}

describe('visão financeira administrativa', () => {
  it('reusa monthlyBilling e monthlyExpenses e calcula o resultado da Home', () => {
    const source = flow({
      inflows: '1650',
      receivables: '199476.98',
      outflows: '48.75',
      payables: '176026.97',
      openReceivables: '199476.98',
      openPayables: '176026.97',
      overdueReceivables: '10',
      overduePayables: '4',
    });
    const facts = toOperationsCompanyFinancials(source);
    const billing = monthlyBilling(source);
    const expenses = monthlyExpenses(source);
    expect(billing?.toString()).toBe('201126.98');
    expect(facts.billing).toBe(billing?.toString());
    expect(facts.result).toBe(billing!.minus(expenses!).toString());
    expect(facts.receivables).toBe('199476.98');
    expect(facts.payables).toBe('176026.97');
    expect(facts.overdueReceivables).toBe('10');
    expect(facts.overduePayables).toBe('4');
  });

  it('não transforma ausência em zero', () => {
    const facts = toOperationsCompanyFinancials(
      flow({
        inflows: null,
        receivables: '20',
        outflows: '0',
        payables: '0',
        openReceivables: null,
        openPayables: '0',
        overdueReceivables: null,
        overduePayables: '0',
      }),
    );
    expect(facts.billing).toBeNull();
    expect(facts.result).toBeNull();
    expect(facts.receivables).toBeNull();
    expect(facts.payables).toBe('0');
    expect(facts.overdueReceivables).toBeNull();
    expect(facts.overduePayables).toBe('0');
  });

  it('distingue integração ausente, erro e sincronização com falha', () => {
    expect(
      resolveOperationsIntegrationState({
        status: null,
        lastSuccessfulSyncAt: null,
        lastErrorAt: null,
      }),
    ).toBe('NONE');
    expect(
      resolveOperationsIntegrationState({
        status: 'ERROR',
        lastSuccessfulSyncAt: null,
        lastErrorAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ).toBe('ERROR');
    expect(
      resolveOperationsIntegrationState({
        status: 'CONNECTED',
        lastSuccessfulSyncAt: new Date('2026-10-01T00:00:00.000Z'),
        lastErrorAt: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).toBe('SYNC_FAILED');
    expect(
      resolveOperationsIntegrationState({
        status: 'DISCONNECTED',
        lastSuccessfulSyncAt: null,
        lastErrorAt: null,
      }),
    ).toBe('DISCONNECTED');
  });
});
