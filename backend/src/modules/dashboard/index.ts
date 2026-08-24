export { registerDashboardOverviewRoutes } from './http/dashboard-overview.routes.js';
export type {
  DashboardCashFlowForecastResponse,
  DashboardCategoriesResponse,
  DashboardCategoryItem,
  DashboardCostCenterItem,
  DashboardCostCentersResponse,
  DashboardExecutiveInsightsResponse,
  DashboardExpenseCompositionResponse,
  DashboardMonthEndCashPressureResponse,
  DashboardMonthlyExpenseResponse,
  DashboardMonthlyRevenueResponse,
  DashboardOverviewResponse,
  DashboardReceivableCompositionResponse,
  DashboardRevenueGoalHistoryPoint,
  DashboardRevenueGoalResponse,
  DashboardRevenueGoalStatus,
  DashboardUpcomingResponse,
} from './domain/types.js';
export {
  calculateRevenueGoalProgress,
  listRevenueGoalHistoryMonthKeys,
  parseRevenueGoalTargetAmount,
  shiftRevenueGoalMonthKey,
} from './domain/revenue-goal-math.js';
export type { RevenueGoalProgress, RevenueGoalStatus } from './domain/revenue-goal-math.js';
export { createRevenueGoalRepository } from './repositories/revenue-goal.repository.js';
export type {
  RevenueGoalRecord,
  RevenueGoalRepository,
} from './repositories/revenue-goal.repository.js';
export { createDashboardOverviewFacade } from './services/dashboard-overview.facade.js';
export type {
  DashboardOverviewFacade,
  DashboardOverviewFacadeDependencies,
} from './services/dashboard-overview.facade.js';
