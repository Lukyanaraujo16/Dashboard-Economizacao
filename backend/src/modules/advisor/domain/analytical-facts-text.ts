import {
  formatAdvisorPercent,
  resolveAdvisorBillingCoverage,
  type AdvisorCashCategoryDelta,
  type AdvisorCashMonthComparison,
  type AdvisorCashPeriodSnapshot,
} from './compare-advisor-cash-months.js';
import { ADVISOR_FINANCIAL_ABSENT, formatAdvisorFinancialAmount } from './financial-facts-text.js';

export function buildAnalyticalFactsContent(input: {
  readonly monthKey: string;
  readonly comparisonMonthKey?: string;
  readonly comparison: AdvisorCashMonthComparison | null;
}): string {
  if (input.comparison === null || input.comparisonMonthKey === undefined) {
    return [
      'comparison: ABSENT',
      'comparisonMonthKey: ABSENT',
      'note: comparação oficial só é pré-carregada quando o resolvedor detecta dois períodos.',
    ].join('\n');
  }

  const comparison = input.comparison;
  return [
    `comparison: PRESENT`,
    `monthKey: ${comparison.monthKey}`,
    `comparisonMonthKey: ${comparison.comparisonMonthKey}`,
    `billingCoverage: ${comparison.billingCoverage}`,
    'note: realizedByCategory explica o faturamento integral somente quando billingCoverage=FULL_BILLING.',
    '',
    formatPeriodBlock('periodA', comparison.periodA),
    '',
    formatPeriodBlock('periodB', comparison.periodB),
    '',
    'difference:',
    `difference.billing: ${formatAdvisorFinancialAmount(comparison.difference.billing)}`,
    `difference.billingPercent: ${formatAdvisorPercent(comparison.difference.billingPercent)}`,
    `difference.realizedInflows: ${formatAdvisorFinancialAmount(comparison.difference.realizedInflows)}`,
    `difference.realizedOutflows: ${formatAdvisorFinancialAmount(comparison.difference.realizedOutflows)}`,
    `difference.realizedResult: ${formatAdvisorFinancialAmount(comparison.difference.realizedResult)}`,
    '',
    formatCategoryBlock('inflowCategories', comparison.inflowCategories.available, {
      increases: comparison.inflowCategories.increases,
      decreases: comparison.inflowCategories.decreases,
    }),
    '',
    formatCategoryBlock('outflowCategories', comparison.outflowCategories.available, {
      increases: comparison.outflowCategories.increases,
      decreases: comparison.outflowCategories.decreases,
    }),
  ].join('\n');
}

function formatPeriodBlock(label: string, period: AdvisorCashPeriodSnapshot): string {
  return [
    `${label}.monthKey: ${period.monthKey}`,
    `${label}.billing: ${formatAdvisorFinancialAmount(period.billing)}`,
    `${label}.billingCoverage: ${resolveAdvisorBillingCoverage(period.expectedReceivables)}`,
    `${label}.realized.inflows: ${formatAdvisorFinancialAmount(period.realizedInflows)}`,
    `${label}.realized.outflows: ${formatAdvisorFinancialAmount(period.realizedOutflows)}`,
    `${label}.realized.result: ${formatAdvisorFinancialAmount(period.realizedResult)}`,
    `${label}.expected.receivables: ${formatAdvisorFinancialAmount(period.expectedReceivables)}`,
    `${label}.expected.payables: ${formatAdvisorFinancialAmount(period.expectedPayables)}`,
  ].join('\n');
}

function formatCategoryBlock(
  label: string,
  available: boolean,
  sides: {
    readonly increases: readonly AdvisorCashCategoryDelta[];
    readonly decreases: readonly AdvisorCashCategoryDelta[];
  },
): string {
  if (!available) {
    return `${label}: ABSENT`;
  }
  return [
    `${label}.increases.count: ${sides.increases.length}`,
    ...sides.increases.map((item, index) => formatCategoryLine(`${label}.increase.${index + 1}`, item)),
    `${label}.decreases.count: ${sides.decreases.length}`,
    ...sides.decreases.map((item, index) => formatCategoryLine(`${label}.decrease.${index + 1}`, item)),
  ].join('\n');
}

function formatCategoryLine(prefix: string, item: AdvisorCashCategoryDelta): string {
  return [
    `${prefix}.key: ${item.key}`,
    `${prefix}.name: ${item.name}`,
    `${prefix}.kind: ${item.kind}`,
    `${prefix}.amountA: ${formatAdvisorFinancialAmount(item.amountA)}`,
    `${prefix}.amountB: ${formatAdvisorFinancialAmount(item.amountB)}`,
    `${prefix}.delta: ${formatAdvisorFinancialAmount(item.delta)}`,
    `${prefix}.percent: ${formatAdvisorPercent(item.percent)}`,
    `${prefix}.trend: ${item.trend ?? ADVISOR_FINANCIAL_ABSENT}`,
  ].join('\n');
}
