export {
  anchorRatioFromIndex,
  anchorRatioFromSvgX,
  DEFAULT_CHART_TOOLTIP_PADDING,
  isHorizontalTooltipWithinBounds,
  resolveHorizontalTooltipPlacement,
  resolveVerticalTooltipPlacement,
} from './chart-tooltip-placement';

export { ChartTooltip } from './chart-tooltip';
export type { ChartTooltipProps, ChartTooltipVerticalMode } from './chart-tooltip';

export { CategoryRanking } from './category-ranking';
export type { CategoryRankingItem, CategoryRankingProps } from './category-ranking';

export {
  accumulate,
  alignDailySeries,
  amountValues,
  buildSvgPoints,
  decimalRatio,
  formatCompactBrl,
  formatDayPt,
  indexFromRatio,
  isFlatSeries,
  maxAbs,
  outstandingSeries,
  parseAmount,
  percentChangeRate,
  receivedSeries,
  resultDailySeries,
  signedSharePercent,
  subtractDecimalStrings,
  summarizeActiveDays,
  svgBaselineY,
  toAreaPath,
  toPolyline,
} from './chart-math';
export type {
  ActiveDaySummary,
  CompetenceDailyPoint,
  DailyPoint,
  SvgPoint,
  SvgScaleOptions,
} from './chart-math';

export { CompetenceComparisonChart } from './competence-comparison-chart';
export type { CompetenceComparisonChartProps } from './competence-comparison-chart';

export { CompetenceDailyBars } from './competence-daily-bars';
export type { CompetenceDailyBarsProps } from './competence-daily-bars';

export { CashMonthlyGroupedBars } from './cash-monthly-grouped-bars';
export type {
  CashMonthlyGroupedBarsBucket,
  CashMonthlyGroupedBarsProps,
} from './cash-monthly-grouped-bars';

export { ExecutiveKpiCard } from './executive-kpi-card';
export type {
  ExecutiveKpiCardProps,
  ExecutiveKpiState,
  ExecutiveKpiTone,
} from './executive-kpi-card';

export { ExecutiveSignals, signalTone } from './executive-signals';
export type { ExecutiveSignal, ExecutiveSignalsProps, SignalTone } from './executive-signals';

export { ForecastPanel } from './forecast-panel';
export type { ForecastPanelBucket, ForecastPanelProps } from './forecast-panel';

export { RatioMeter } from './ratio-meter';
export type { RatioMeterProps } from './ratio-meter';

export { Sparkline } from './sparkline';
export type { SparklineProps } from './sparkline';

export {
  goalProgressStatusFromApi,
  presentApiGoalProgress,
  presentGoalProgress,
  revenueGoalHistoryCaption,
  revenueGoalStatusLabel,
  toRevenueGoalTargetDecimal,
} from './revenue-goal-math';
export type { GoalProgressStatus, GoalProgressView } from './revenue-goal-math';

export { RevenueGoalCard, RevenueGoalHistoryList } from './revenue-goal-card';
export type { RevenueGoalCardProps, RevenueGoalHistoryListProps } from './revenue-goal-card';

export { RevenueGoalEditDialog } from './revenue-goal-edit-dialog';
export type { RevenueGoalEditDialogProps } from './revenue-goal-edit-dialog';

export { WidgetExpandDialog } from './widget-expand-dialog';
export type { WidgetExpandDialogProps } from './widget-expand-dialog';

export { WidgetShell } from './widget-shell';
export type { WidgetShellProps } from './widget-shell';
