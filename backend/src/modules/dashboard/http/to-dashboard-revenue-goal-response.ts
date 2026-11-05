import type {
  RevenueGoalProgress,
  UnavailableRevenueGoalProgress,
} from '../domain/revenue-goal-math.js';

type Progress = RevenueGoalProgress | UnavailableRevenueGoalProgress;
import type {
  DashboardRevenueGoalHistoryPoint,
  DashboardRevenueGoalResponse,
} from '../domain/types.js';
import { serializeDecimal } from './to-dashboard-overview-response.js';

function serializeHistoryPoint(progress: Progress): DashboardRevenueGoalHistoryPoint {
  return {
    monthKey: progress.monthKey,
    target: progress.target === null ? null : serializeDecimal(progress.target),
    actual: progress.actual === null ? null : serializeDecimal(progress.actual),
    achievementRate:
      progress.achievementRate === null ? null : serializeDecimal(progress.achievementRate),
    status: progress.status,
  };
}

export function toDashboardRevenueGoalResponse(
  selected: Progress,
  history: readonly Progress[],
  costCenterId: string | null = null,
): DashboardRevenueGoalResponse {
  return {
    monthKey: selected.monthKey,
    costCenterId,
    target: selected.target === null ? null : serializeDecimal(selected.target),
    actual: selected.actual === null ? null : serializeDecimal(selected.actual),
    achievementRate:
      selected.achievementRate === null ? null : serializeDecimal(selected.achievementRate),
    remaining: selected.remaining === null ? null : serializeDecimal(selected.remaining),
    exceeded: selected.exceeded === null ? null : serializeDecimal(selected.exceeded),
    status: selected.status,
    history: history.map(serializeHistoryPoint),
  };
}
