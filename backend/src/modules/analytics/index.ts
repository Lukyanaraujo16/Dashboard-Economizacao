export { analyticalTimeZone, civilTodayInSaoPaulo } from './domain/analytical-timezone.js';
export { CASH_FLOW_FORECAST_HORIZON_DAYS } from './domain/cash-flow-forecast.js';
export { sumUpcomingUnpaid, summarizeUpcomingWindow } from './domain/upcoming.js';
export {
  DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
  classifyOpenPayablesByCategory,
  classifyOpenReceivablesByCategory,
  presentOpenPayablesCategoryComposition,
} from './domain/payable-category-composition.js';
export { buildDailyCompetenceTotals, accumulateDailyCompetence } from './domain/daily-competence-series.js';
export type { DailyCompetencePoint } from './domain/daily-competence-series.js';
export { calculateMonthlyCompetenceRevenue } from './domain/monthly-competence-revenue.js';
export { buildMonthlyExecutiveInsights } from './domain/monthly-executive-insights.js';
export type {
  MonthlyExecutiveInsight,
  MonthlyExecutiveInsightId,
  MonthlyExecutiveInsightsResult,
} from './domain/monthly-executive-insights.js';
export { buildMonthEndCashPressureResult } from './domain/month-end-cash-pressure.js';
export type {
  CashFlowForecast,
  ExecutiveInsightsResult,
  FinancialStockSnapshot,
  ForecastBucket,
  GetFinancialStockSnapshotInput,
  GetUpcomingInstallmentsInput,
  InstallmentStockSnapshot,
  OpenPayablesCategoryCompositionResult,
  OpenReceivablesCategoryCompositionResult,
  MonthlyCompetenceExpenseResult,
  MonthlyCompetenceRevenueResult,
  MonthEndCashPressureResult,
  ReceivableDelinquency,
  UpcomingInstallment,
  UpcomingInstallments,
} from './domain/types.js';
export { createAnalyticsService } from './services/analytics.service.js';
export type {
  AnalyticsService,
  AnalyticsServiceDependencies,
} from './services/analytics.service.js';
