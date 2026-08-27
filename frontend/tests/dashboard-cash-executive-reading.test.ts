import { describe, expect, it } from 'vitest';

import { buildCashExecutiveReading } from '../src/components/dashboard/dashboard-cash-executive-reading';
import { toMonthlyCashFlowView } from '../src/components/dashboard/dashboard-monthly-cash-flow-view';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';

function lifeAugust(): DashboardMonthlyCashFlowResponse {
  return {
    today: '2026-08-19',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    costCenterCashSplit: true,
    billing: '235301.50',
    realized: { inflows: '224790.30', outflows: '98941.52', result: '125848.78' },
    expected: { receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
    overdue: {
      receivables: '0',
      payables: '100.00',
      ofMonth: { receivables: '0', payables: '0' },
    },
    coverage: '0.955447',
    realizedByCategory: {
      inflows: {
        total: '224790.30',
        classified: '224790.30',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [{ kind: 'category', name: 'Consultas', amount: '224790.30', percentage: '100' }],
      },
      outflows: {
        total: '98941.52',
        classified: '98941.52',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [{ kind: 'category', name: 'Operacional', amount: '98941.52', percentage: '100' }],
      },
    },
    daily: { realized: [], expected: [] },
  };
}

describe('CASH-4C / FINAL-UI — buildCashExecutiveReading', () => {
  it('emite 6 métricas curtas + status clear sem mencionar competência', () => {
    const reading = buildCashExecutiveReading(toMonthlyCashFlowView(lifeAugust()));
    expect(reading.metrics).toHaveLength(6);
    expect(reading.metrics.map((m) => m.id)).toEqual([
      'cash-received',
      'cash-receivable',
      'cash-paid',
      'cash-payable',
      'cash-result',
      'cash-coverage',
    ]);
    expect(reading.metrics.map((m) => m.label)).toEqual([
      'Entrou no caixa',
      'Ainda a receber',
      'Saiu do caixa',
      'Ainda a pagar',
      'Resultado projetado',
      'Faturamento realizado',
    ]);
    expect(reading.metrics[0]?.value).toMatch(/R\$\s*224\.790,30/);
    expect(reading.metrics[1]?.value).toMatch(/R\$\s*10\.511,20/);
    expect(reading.metrics[2]?.value).toMatch(/R\$\s*98\.941,52/);
    expect(reading.metrics[3]?.value).toMatch(/R\$\s*28\.289,80/);
    expect(reading.metrics[4]?.value).toMatch(/R\$\s*108\.070,18/);
    expect(reading.metrics[5]?.value).toMatch(/95,5%/);
    expect(reading.metrics.every((m) => m.hint.length > 0)).toBe(true);
    expect(reading.status?.kind).toBe('clear');
    expect(reading.status?.body).toMatch(/nenhum valor a receber vencido/i);

    const blob = [
      ...reading.metrics.map((m) => `${m.label} ${m.value} ${m.hint}`),
      reading.status?.body ?? '',
    ]
      .join(' ')
      .toLowerCase();
    expect(blob).not.toContain('competência');
    expect(blob).not.toMatch(/ainda está previsto para entrar/);
    expect(blob).not.toMatch(/já entrou no caixa neste mês/);
  });

  it('centro de custo sem split retorna status de indisponibilidade', () => {
    const reading = buildCashExecutiveReading(
      toMonthlyCashFlowView({
        ...lifeAugust(),
        costCenterCashSplit: false,
        billing: null,
        realized: { inflows: null, outflows: null, result: null },
        expected: { receivables: null, payables: null, result: null },
        overdue: {
          receivables: null,
          payables: null,
          ofMonth: { receivables: null, payables: null },
        },
        coverage: null,
      }),
    );
    expect(reading.metrics).toHaveLength(0);
    expect(reading.status?.kind).toBe('unavailable');
    expect(reading.status?.body).toMatch(/indisponíveis no filtro por centro de custo/i);
    expect(reading.status?.body.toLowerCase()).not.toContain('competência');
  });

  it('status overdue usa valor real quando há vencido', () => {
    const reading = buildCashExecutiveReading(
      toMonthlyCashFlowView({
        ...lifeAugust(),
        overdue: {
          receivables: '4200.00',
          payables: '100.00',
          ofMonth: { receivables: '0', payables: '0' },
        },
      }),
    );
    expect(reading.status?.kind).toBe('overdue');
    expect(reading.status?.body).toMatch(/R\$\s*4\.200,00/);
  });
});
