import type { MonthlyExecutiveInsightsResult } from '../../analytics/domain/monthly-executive-insights.js';
import type { DashboardExecutiveInsightsResponse } from '../domain/types.js';
import { serializeCivilDate } from './to-dashboard-overview-response.js';

export function toDashboardExecutiveInsightsResponse(
  insights: MonthlyExecutiveInsightsResult,
): DashboardExecutiveInsightsResponse {
  return {
    today: serializeCivilDate(insights.today),
    monthKey: insights.monthKey,
    from: serializeCivilDate(insights.from),
    to: serializeCivilDate(insights.to),
    insights: insights.insights.map((item) => ({
      id: item.id,
      body: item.body,
    })),
  };
}
