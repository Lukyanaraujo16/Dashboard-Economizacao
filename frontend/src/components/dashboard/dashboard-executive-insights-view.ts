import type { DashboardExecutiveInsight } from '../../services/dashboard/executive-insights.types';

export type ExecutiveInsightRow = {
  readonly id: string;
  readonly body: string;
};

export function executiveInsightRows(
  insights: readonly DashboardExecutiveInsight[],
): readonly ExecutiveInsightRow[] {
  return insights.map((insight) => ({
    id: insight.id,
    body: insight.body,
  }));
}
