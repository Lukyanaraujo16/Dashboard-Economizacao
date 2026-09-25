import type { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type {
  FinancialStockSnapshot,
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';
import {
  ADVISOR_CASH_CATEGORY_TOP_N,
  resolveAdvisorBillingCoverage,
} from './compare-advisor-cash-months.js';

export const ADVISOR_FINANCIAL_ABSENT = 'ABSENT';

export type AdvisorFinancialFactsSource = {
  readonly realized: MonthlyCashFlow['realized'];
  readonly expected: MonthlyCashFlow['expected'];
  readonly overdue: MonthlyCashFlow['overdue'];
  readonly realizedByCategory?: MonthlyCashFlow['realizedByCategory'];
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

  const billingCoverage =
    input.flow === null
      ? ADVISOR_FINANCIAL_ABSENT
      : resolveAdvisorBillingCoverage(expected?.receivables ?? null);

  return [
    `monthKey: ${input.monthKey}`,
    `billing: ${formatAdvisorFinancialAmount(billing)}`,
    `billingCoverage: ${billingCoverage}`,
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
    ...formatRealizedCategoryFacts('inflows', input.flow?.realizedByCategory?.inflows ?? null),
    ...formatRealizedCategoryFacts('outflows', input.flow?.realizedByCategory?.outflows ?? null),
    'note: realizedByCategory é composição do REALIZADO. billingCoverage=FULL_BILLING somente quando expected.receivables=0.',
    'note: Atendimentos Convênio, quando presente, é CATEGORIA agregada — não é convênio individual.',
  ].join('\n');
}

function formatRealizedCategoryFacts(
  side: 'inflows' | 'outflows',
  composition: MonthlyCashFlowRealizedCategoryComposition | null,
): string[] {
  const prefix = `realizedByCategory.${side}`;
  if (composition === null) {
    return [`${prefix}: ${ADVISOR_FINANCIAL_ABSENT}`];
  }
  const items = [...composition.items]
    .sort((left, right) => {
      const byAmount = right.amount.comparedTo(left.amount);
      if (byAmount !== 0) {
        return byAmount;
      }
      return left.name.localeCompare(right.name, 'pt-BR');
    })
    .slice(0, ADVISOR_CASH_CATEGORY_TOP_N);
  return [
    `${prefix}.total: ${formatAdvisorFinancialAmount(composition.total)}`,
    `${prefix}.count: ${items.length}`,
    ...items.flatMap((item, index) => [
      `${prefix}.${index + 1}.key: ${item.key}`,
      `${prefix}.${index + 1}.name: ${item.name}`,
      `${prefix}.${index + 1}.kind: ${item.kind}`,
      `${prefix}.${index + 1}.amount: ${formatAdvisorFinancialAmount(item.amount)}`,
      `${prefix}.${index + 1}.share: ${formatAdvisorFinancialAmount(item.percentage)}`,
    ]),
  ];
}
