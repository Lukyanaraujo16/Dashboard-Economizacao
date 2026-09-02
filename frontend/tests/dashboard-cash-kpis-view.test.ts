import { describe, expect, it } from 'vitest';

import {
  toCashBillingKpi,
  toCashExpensesKpi,
  toCashManagerialResultKpi,
  toCashOverdueReceivablesKpi,
  toCashPayableKpi,
  toCashReceivableKpi,
  toCashReceivedKpi,
} from '../src/components/dashboard/dashboard-cash-kpis-view';
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
      receivables: '5000',
      payables: '1000',
      ofMonth: { receivables: '0', payables: '0' },
    },
    coverage: '0.95',
  realizedByCategory: {
    inflows: {
      total: '224790.30', classified: '224790.30', uncategorized: '0', imprecise: '0', coverageRate: '100',
      items: [{ kind: 'category', name: 'Consultas', amount: '224790.30', percentage: '100' }],
    },
    outflows: {
      total: '98941.52', classified: '98941.52', uncategorized: '0', imprecise: '0', coverageRate: '100',
      items: [{ kind: 'category', name: 'Operacional', amount: '98941.52', percentage: '100' }],
    },
  },
    daily: { realized: [], expected: [] },
  };
}

describe('CASH-4B — KPIs de caixa (view)', () => {
  it('H1 — Faturamento = realizado + previsto', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    const kpi = toCashBillingKpi(view, 'current');
    expect(kpi.value).toMatch(/235\.301,50/);
    expect(kpi.meta.toLowerCase()).not.toContain('competência');
  });

  it('H2 — Despesas = pago + a pagar', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    const kpi = toCashExpensesKpi(view, 'current');
    expect(kpi.value).toMatch(/127\.231,32/);
  });

  it('H3 — Resultado = billing − despesas', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    const kpi = toCashManagerialResultKpi(view);
    expect(kpi.value).toMatch(/108\.070,18/);
    expect(kpi.meta.toLowerCase()).not.toContain('competência');
    expect(kpi.value).not.toMatch(/125\.848/);
  });

  it('H4/H5 — vencido fora de Faturamento e Despesas', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    expect(view.billing).toBe('235301.50');
    expect(view.monthlyExpenses).toBe('127231.32');
    expect(view.overdueReceivables).toBe('5000');
    expect(view.billing).not.toContain('5000');
  });

  it('H8/H9 — transfers já neutros no DTO (não reentram)', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    expect(view.received).toBe('224790.30');
    expect(view.billing).toBe('235301.50');
  });

  it('H10 — null CC → "—", nunca zero', () => {
    const view = toMonthlyCashFlowView({
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
    });
    expect(toCashBillingKpi(view, 'current').value).toBe('—');
    expect(toCashReceivedKpi(view).value).toBe('—');
    expect(toCashReceivableKpi(view, 'current').value).toBe('—');
    expect(toCashExpensesKpi(view, 'current').value).toBe('—');
    expect(toCashManagerialResultKpi(view).value).toBe('—');
    expect(toCashOverdueReceivablesKpi(view).value).toBe('—');
    expect(toCashBillingKpi(view, 'current').value).not.toMatch(/0,00/);
  });

  it('Já recebido / A receber / Contas a pagar — copies de caixa', () => {
    const view = toMonthlyCashFlowView(lifeAugust());
    expect(toCashReceivedKpi(view).meta.toLowerCase()).toContain('caixa');
    expect(toCashReceivedKpi(view).meta.toLowerCase()).not.toContain('competência');
    expect(toCashReceivableKpi(view, 'current').meta.toLowerCase()).toContain('caixa');
    expect(toCashPayableKpi(view, 'current').meta.toLowerCase()).toContain('prazo');
  });
});
