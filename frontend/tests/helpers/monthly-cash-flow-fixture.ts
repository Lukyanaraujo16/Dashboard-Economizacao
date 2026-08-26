import type { DashboardMonthlyCashFlowResponse } from '../../src/services/dashboard/monthly-cash-flow.types';

/**
 * Fixture CASH-4A: totais de caixa deliberadamente distintos da competência
 * (Faturamento competência = R$ 10.000,00 nos testes da Home).
 */
export const cashFlowHomeFixture: DashboardMonthlyCashFlowResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  costCenterCashSplit: true,
  billing: '999999.99',
  realized: { inflows: '888888.88', outflows: '111111.11', result: '777777.77' },
  expected: { receivables: '111111.11', payables: '22222.22', result: '88888.89' },
  overdue: {
    receivables: '1.00',
    payables: '2.00',
    ofMonth: { receivables: '0', payables: '0' },
  },
  coverage: '0.5',
  daily: {
    realized: [{ date: '2026-08-05', inflows: '888888.88', outflows: '0', result: '888888.88' }],
    expected: [
      { date: '2026-08-31', receivables: '111111.11', payables: '22222.22', result: '88888.89' },
    ],
  },
};
