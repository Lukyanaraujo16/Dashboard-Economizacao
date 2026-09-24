import type { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../../analytics/domain/types.js';

export const ADVISOR_FINANCIAL_ABSENT = 'ABSENT';

export type AdvisorFinancialFactsSource = {
  readonly realized: MonthlyCashFlow['realized'];
  readonly expected: MonthlyCashFlow['expected'];
  readonly overdue: MonthlyCashFlow['overdue'];
};

export type AdvisorFinancialSnapshotSource = Pick<
  FinancialStockSnapshot,
  'receivables' | 'payables' | 'receivableDelinquency'
>;

/**
 * null = ABSENT; Decimal 0 = presente zero. Nunca converte null em 0 nem trunca o número.
 */
export function formatAdvisorFinancialAmount(value: Prisma.Decimal | null): string {
  if (value === null) {
    return ADVISOR_FINANCIAL_ABSENT;
  }
  return value.toString();
}

export function buildFinancialFactsContent(input: {
  readonly monthKey: string;
  readonly flow: AdvisorFinancialFactsSource | null;
  readonly snapshot: AdvisorFinancialSnapshotSource | null;
}): string {
  const billing = input.flow === null ? null : monthlyBilling(input.flow);
  const realized = input.flow?.realized;
  const expected = input.flow?.expected;
  const overdue = input.flow?.overdue;
  const receivables = input.snapshot?.receivables;
  const payables = input.snapshot?.payables;
  const delinquency = input.snapshot?.receivableDelinquency;

  return [
    `monthKey: ${input.monthKey}`,
    `billing: ${formatAdvisorFinancialAmount(billing)}`,
    `cash.realized.inflows: ${formatAdvisorFinancialAmount(realized?.inflows ?? null)}`,
    `cash.realized.outflows: ${formatAdvisorFinancialAmount(realized?.outflows ?? null)}`,
    `cash.realized.result: ${formatAdvisorFinancialAmount(realized?.result ?? null)}`,
    `cash.expected.receivables: ${formatAdvisorFinancialAmount(expected?.receivables ?? null)}`,
    `cash.expected.payables: ${formatAdvisorFinancialAmount(expected?.payables ?? null)}`,
    `cash.expected.result: ${formatAdvisorFinancialAmount(expected?.result ?? null)}`,
    `cash.overdue.receivables: ${formatAdvisorFinancialAmount(overdue?.receivables ?? null)}`,
    `cash.overdue.payables: ${formatAdvisorFinancialAmount(overdue?.payables ?? null)}`,
    `cash.overdue.ofMonth.receivables: ${formatAdvisorFinancialAmount(overdue?.ofMonth.receivables ?? null)}`,
    `cash.overdue.ofMonth.payables: ${formatAdvisorFinancialAmount(overdue?.ofMonth.payables ?? null)}`,
    `stock.receivables.open: ${formatAdvisorFinancialAmount(receivables?.open ?? null)}`,
    `stock.receivables.overdue: ${formatAdvisorFinancialAmount(receivables?.overdue ?? null)}`,
    `stock.payables.open: ${formatAdvisorFinancialAmount(payables?.open ?? null)}`,
    `stock.payables.overdue: ${formatAdvisorFinancialAmount(payables?.overdue ?? null)}`,
    `receivableDelinquency.overdueUnpaid: ${formatAdvisorFinancialAmount(delinquency?.overdueUnpaid ?? null)}`,
    `receivableDelinquency.openUnpaid: ${formatAdvisorFinancialAmount(delinquency?.openUnpaid ?? null)}`,
    `receivableDelinquency.rate: ${formatAdvisorFinancialAmount(delinquency?.rate ?? null)}`,
  ].join('\n');
}
