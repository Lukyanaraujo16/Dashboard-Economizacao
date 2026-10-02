import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { executeAnalyticalQuery } from '../src/modules/advisor/domain/analytical/execute-analytical-query.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import { buildFinancialFactsContent } from '../src/modules/advisor/domain/financial-facts-text.js';
import {
  composeAdvisorBillingSeriesAnswer,
} from '../src/modules/advisor/domain/compose-advisor-billing-answer.js';
import {
  BILLING_SERIES_FACT_KIND,
  officialBillingAverage,
} from '../src/modules/advisor/domain/billing-month-series.js';
import { resolveAdvisorBillingIntent } from '../src/modules/advisor/domain/resolve-advisor-billing-intent.js';
import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';
import { runAdvisorBillingAnswer } from '../src/modules/advisor/domain/run-advisor-billing-answer.js';

const NOW = new Date('2026-10-02T15:00:00.000Z');

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(input: {
  readonly monthKey: string;
  readonly inflows: string | null;
  readonly receivables: string | null;
  readonly outflows?: string | null;
  readonly result?: string | null;
  readonly categoryName?: string;
}): MonthlyCashFlow {
  const inflows = input.inflows === null ? null : money(input.inflows);
  return {
    monthKey: input.monthKey,
    realized: {
      inflows,
      outflows: input.outflows == null ? null : money(input.outflows),
      result: input.result == null ? null : money(input.result),
    },
    expected: {
      receivables: input.receivables === null ? null : money(input.receivables),
      payables: null,
      result: null,
    },
    realizedByCategory:
      input.categoryName === undefined || inflows === null
        ? { inflows: null, outflows: null }
        : {
            inflows: {
              total: inflows,
              classified: inflows,
              uncategorized: money('0'),
              imprecise: money('0'),
              coverageRate: money('1'),
              items: [
                {
                  kind: 'category',
                  key: 'cat-1',
                  name: input.categoryName,
                  amount: inflows,
                  percentage: money('1'),
                },
              ],
            },
            outflows: null,
          },
  } as MonthlyCashFlow;
}

function cashFlow(rows: Record<string, MonthlyCashFlow>, tenantId = 'tenant-a') {
  const calls: Array<{ tenantId: string; monthKey?: string; costCenterId?: string }> = [];
  return {
    calls,
    service: {
      async getMonthlyCashFlow(input: {
        tenantId: string;
        monthKey?: string;
        costCenterId?: string;
      }) {
        calls.push({
          tenantId: input.tenantId,
          monthKey: input.monthKey,
          costCenterId: input.costCenterId,
        });
        if (input.tenantId !== tenantId) {
          return flow({
            monthKey: input.monthKey ?? '2026-10',
            inflows: null,
            receivables: null,
          });
        }
        const row = input.monthKey === undefined ? undefined : rows[input.monthKey];
        return (
          row ??
          flow({
            monthKey: input.monthKey ?? '2026-10',
            inflows: null,
            receivables: null,
          })
        );
      },
    },
  };
}

describe('faturamento mensal determinístico', () => {
  it('preserva 201126.98 e não troca o faturamento pelo caixa realizado', async () => {
    const month = flow({
      monthKey: '2026-10',
      inflows: '1650',
      receivables: '199476.98',
      outflows: '48.75',
      result: '1601.25',
      categoryName: 'Particulares',
    });
    expect(monthlyBilling(month)?.toString()).toBe('201126.98');
    const facts = buildFinancialFactsContent({
      monthKey: '2026-10',
      flow: month,
      snapshot: null,
    });
    expect(facts).toContain('billing: 201126.98');
    expect(facts).toContain('billingCoverage: REALIZED_ONLY');
    expect(facts).toContain('Particulares');

    const loaded = cashFlow({ '2026-10': month });
    const result = await runAdvisorBillingAnswer({
      content: 'Como está meu faturamento este mês?',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });

    expect(result?.capabilityKey).toBe('billing.value.month');
    const answer = result?.answer ?? '';
    expect(answer).toContain('Faturamento em outubro de 2026: R$ 201.126,98.');
    expect(answer).not.toContain('R$ 20.126,98');
    expect(answer).toContain('Recebido (entradas realizadas de caixa): R$ 1.650,00.');
    expect(answer).toContain('Pago (saídas realizadas de caixa): R$ 48,75.');
    expect(answer).toContain('Resultado de caixa realizado: R$ 1.601,25.');
    expect(answer.split('\n').filter((line) => line.startsWith('Faturamento em'))).toEqual([
      'Faturamento em outubro de 2026: R$ 201.126,98.',
    ]);
    expect(answer).not.toContain('Particulares');
    expect(answer).not.toMatch(/100\s*%/);
    expect(loaded.calls).toEqual([
      { tenantId: 'tenant-a', monthKey: '2026-10', costCenterId: undefined },
    ]);
  });

  it('reconhece formulações do mês sem casar a frase inteira', () => {
    for (const question of [
      'como está meu faturamento este mês?',
      'qual meu faturamento este mês?',
      'quanto faturei neste mês?',
      'qual foi meu faturamento em setembro?',
      'quanto foi o faturamento de agosto?',
      'faturamento do mês',
      'como foi meu faturamento em outubro?',
    ]) {
      expect(resolveAdvisorBillingIntent(question)).toEqual({ kind: 'MONTH_VALUE' });
    }
    expect(resolveAdvisorBillingIntent('Qual é minha meta de faturamento deste mês?')).toBeNull();
    expect(resolveAdvisorBillingIntent('qual mês teve o maior faturamento?')).toBeNull();
    expect(resolveAdvisorBillingIntent('faturamento por categoria neste mês')).toBeNull();
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'qual foi meu faturamento em setembro?',
        referenceMonthKey: '2026-10',
        now: NOW,
      }).monthKey,
    ).toBe('2026-09');
  });
});

describe('série e média de faturamento', () => {
  const threeMonths = {
    '2026-08': flow({ monthKey: '2026-08', inflows: '100', receivables: '0' }),
    '2026-09': flow({ monthKey: '2026-09', inflows: '200', receivables: '0' }),
    '2026-10': flow({ monthKey: '2026-10', inflows: '300', receivables: '0' }),
  };

  it('roteia últimos N meses para a capability histórica e calcula a média no engine', async () => {
    const question = 'qual minha média de faturamento pensando nos últimos 3 meses?';
    expect(resolveAdvisorBillingIntent(question)).toEqual({
      kind: 'MONTH_SERIES',
      count: 3,
      wantsAverage: true,
    });
    const period = resolveAdvisorConversationalPeriod({
      content: question,
      referenceMonthKey: '2026-10',
      now: NOW,
    });
    expect(period.comparison).toBe(false);
    expect(period.monthKey).toBe('2026-10');

    const published = validateAnalyticalCapability({
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3 },
      operation: 'VALUE',
    });
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.capability.key).toBe('billing.series.months');
    }
    const single = validateAnalyticalCapability({
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: { kind: 'MONTH', monthKey: '2026-10' },
      operation: 'VALUE',
    });
    expect(single.ok).toBe(true);
    if (single.ok) {
      expect(single.capability.key).toBe('billing.value.month');
    }

    const loaded = cashFlow(threeMonths);
    const outcome = await executeAnalyticalQuery({
      runtime: { tenantId: 'tenant-a', now: NOW, planningCashFlow: loaded.service },
      query: {
        semanticFamily: 'BILLING',
        metric: 'BILLING',
        period: { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3 },
        operation: 'VALUE',
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.legacyFact.factKind).toBe(BILLING_SERIES_FACT_KIND);
    expect(new Prisma.Decimal(String(outcome.legacyFact.average)).equals('200')).toBe(true);
    expect(officialBillingAverage([money('100'), money('200'), money('300')]).equals('200')).toBe(
      true,
    );

    const result = await runAdvisorBillingAnswer({
      content: question,
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    const answer = result?.answer ?? '';
    expect(result?.capabilityKey).toBe('billing.series.months');
    expect(answer).toContain('Faturamento em agosto de 2026: R$ 100,00.');
    expect(answer).toContain('Faturamento em setembro de 2026: R$ 200,00.');
    expect(answer).toContain('Faturamento em outubro de 2026: R$ 300,00.');
    expect(answer).toContain('Meses com faturamento oficial: 3 de 3.');
    expect(answer).toContain('Média dos 3 meses: R$ 200,00.');
    expect(answer).not.toContain('comparação oficial não está disponível');
    expect(loaded.calls.map((call) => call.monthKey)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(loaded.calls.every((call) => call.tenantId === 'tenant-a' && call.costCenterId === undefined)).toBe(
      true,
    );
  });

  it('o composer publica a média do engine e não recalcula os meses', () => {
    const answer = composeAdvisorBillingSeriesAnswer({
      wantsAverage: true,
      fact: {
        factKind: BILLING_SERIES_FACT_KIND,
        requestedCount: 3,
        validCount: 3,
        complete: true,
        average: '999.99',
        months: [
          { monthKey: '2026-08', billing: '100', available: true },
          { monthKey: '2026-09', billing: '200', available: true },
          { monthKey: '2026-10', billing: '300', available: true },
        ],
      },
    });
    expect(answer).toContain('Média dos 3 meses: R$ 999,99.');
    expect(answer).not.toContain('Média dos 3 meses: R$ 200,00.');
  });

  it('aceita últimos 6 meses e número por extenso', async () => {
    expect(resolveAdvisorBillingIntent('qual foi minha média nos últimos 6 meses?')).toEqual({
      kind: 'MONTH_SERIES',
      count: 6,
      wantsAverage: true,
    });
    expect(resolveAdvisorBillingIntent('média de faturamento nos últimos quatro meses')).toEqual({
      kind: 'MONTH_SERIES',
      count: 4,
      wantsAverage: true,
    });
    expect(resolveAdvisorBillingIntent('quanto faturei em média nos últimos três meses?')).toEqual({
      kind: 'MONTH_SERIES',
      count: 3,
      wantsAverage: true,
    });
    expect(resolveAdvisorBillingIntent('faturamento médio dos últimos seis meses')).toEqual({
      kind: 'MONTH_SERIES',
      count: 6,
      wantsAverage: true,
    });

    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const rows = Object.fromEntries(
      months.map((monthKey) => [monthKey, flow({ monthKey, inflows: '60', receivables: '0' })]),
    );
    const loaded = cashFlow(rows);
    const result = await runAdvisorBillingAnswer({
      content: 'qual foi minha média nos últimos seis meses?',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    expect(result?.answer).toContain('Meses com faturamento oficial: 6 de 6.');
    expect(result?.answer).toContain('Média dos 6 meses: R$ 60,00.');
    expect(loaded.calls.map((call) => call.monthKey)).toEqual(months);
  });

  it('não transforma mês sem cobertura em zero nem chama a média parcial de janela completa', async () => {
    const loaded = cashFlow({
      '2026-08': flow({ monthKey: '2026-08', inflows: null, receivables: null }),
      '2026-09': flow({ monthKey: '2026-09', inflows: '0', receivables: '0' }),
      '2026-10': flow({ monthKey: '2026-10', inflows: '100', receivables: '0' }),
    });
    const result = await runAdvisorBillingAnswer({
      content: 'qual minha média de faturamento nos últimos 3 meses?',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    const answer = result?.answer ?? '';
    expect(answer).toContain('agosto de 2026 não possui cobertura suficiente de faturamento.');
    expect(answer).not.toContain('Faturamento em agosto de 2026');
    expect(answer).toContain('Faturamento em setembro de 2026: R$ 0,00.');
    expect(answer).toContain('Faturamento em outubro de 2026: R$ 100,00.');
    expect(answer).toContain('Meses com faturamento oficial: 2 de 3.');
    expect(answer).toContain(
      'Por isso não consigo calcular com segurança a média completa dos últimos 3 meses.',
    );
    expect(answer).not.toContain('Média dos 3 meses');
    expect(answer).not.toContain('comparação oficial não está disponível');
  });

  it('isola a série por tenant', async () => {
    const loaded = cashFlow(threeMonths, 'tenant-a');
    const other = await runAdvisorBillingAnswer({
      content: 'média de faturamento dos últimos três meses',
      tenantId: 'tenant-b',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    expect(other?.answer).toContain('Meses com faturamento oficial: 0 de 3.');
    expect(other?.answer).not.toContain('R$ 100,00');
    expect(other?.answer).not.toContain('R$ 200,00');
    expect(other?.answer).not.toContain('R$ 300,00');
    expect(loaded.calls.every((call) => call.tenantId === 'tenant-b')).toBe(true);
  });

  it('recusa janela acima do teto oficial sem inventar média', async () => {
    const loaded = cashFlow(threeMonths);
    const result = await runAdvisorBillingAnswer({
      content: 'média de faturamento dos últimos 25 meses',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    expect(result?.capabilityKey).toBe('billing.series.months');
    expect(result?.answer).toContain('24');
    expect(result?.answer).toContain('25');
    expect(loaded.calls).toEqual([]);
  });

  it('não captura comparação, mês atual nem drill-down', () => {
    expect(resolveAdvisorBillingIntent('compare o faturamento de agosto com setembro')).toBeNull();
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'compare o faturamento de agosto com setembro',
        referenceMonthKey: '2026-10',
        now: NOW,
      }).comparison,
    ).toBe(true);
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'como está meu faturamento este mês?',
        referenceMonthKey: '2026-10',
        now: NOW,
      }),
    ).toMatchObject({ monthKey: '2026-10', comparison: false, source: 'SELECTED' });
  });
});
