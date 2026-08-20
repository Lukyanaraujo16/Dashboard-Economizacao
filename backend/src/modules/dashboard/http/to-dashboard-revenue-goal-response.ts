import type { RevenueGoalProgress } from '../domain/revenue-goal-math.js';
import type {
  DashboardRevenueGoalHistoryPoint,
  DashboardRevenueGoalResponse,
} from '../domain/types.js';
import { serializeDecimal } from './to-dashboard-overview-response.js';

function serializeHistoryPoint(progress: RevenueGoalProgress): DashboardRevenueGoalHistoryPoint {
  return {
    monthKey: progress.monthKey,
    target: progress.target === null ? null : serializeDecimal(progress.target),
    actual: serializeDecimal(progress.actual),
    achievementRate:
      progress.achievementRate === null ? null : serializeDecimal(progress.achievementRate),
    status: progress.status,
  };
}

export function toDashboardRevenueGoalResponse(
  selected: RevenueGoalProgress,
  history: readonly RevenueGoalProgress[],
): DashboardRevenueGoalResponse {
  return {
    monthKey: selected.monthKey,
    target: selected.target === null ? null : serializeDecimal(selected.target),
    actual: serializeDecimal(selected.actual),
    achievementRate:
      selected.achievementRate === null ? null : serializeDecimal(selected.achievementRate),
    remaining: selected.remaining === null ? null : serializeDecimal(selected.remaining),
    exceeded: selected.exceeded === null ? null : serializeDecimal(selected.exceeded),
    status: selected.status,
    history: history.map(serializeHistoryPoint),
  };
}
