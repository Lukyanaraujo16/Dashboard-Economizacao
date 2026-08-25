import {
  parseDashboardCategoryFromSearchParams,
  buildDashboardCategorySearchParams,
} from './dashboard-category';
import {
  parseDashboardCostCenterFromSearchParams,
  buildDashboardCostCenterSearchParams,
} from './dashboard-cost-center';
import {
  isValidDashboardMonthKey,
  listInclusiveDashboardMonthKeys,
  REPORT_MAX_MONTH_SPAN,
} from './dashboard-month';
import {
  parseDashboardSituationFromSearchParams,
  buildDashboardSituationSearchParams,
  type DashboardSituation,
} from './dashboard-situation';

export const REPORT_TYPE_REVENUE = 'revenue' as const;

export type ReportType = typeof REPORT_TYPE_REVENUE;

export type ReportsQuery = {
  readonly type: ReportType;
  readonly from: string | null;
  readonly to: string | null;
  readonly costCenterId: string | null;
  readonly situation: DashboardSituation | null;
  readonly categoryId: string | null;
};

export function isReportType(value: string): value is ReportType {
  return value === REPORT_TYPE_REVENUE;
}

export function parseReportMonthParam(
  params: Readonly<URLSearchParams>,
  field: 'from' | 'to',
): string | null {
  const raw = params.get(field);
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  return isValidDashboardMonthKey(trimmed) ? trimmed : null;
}

export function parseReportsQuery(params: Readonly<URLSearchParams>): ReportsQuery {
  const rawType = params.get('type')?.trim() ?? '';
  return {
    type: isReportType(rawType) ? rawType : REPORT_TYPE_REVENUE,
    from: parseReportMonthParam(params, 'from'),
    to: parseReportMonthParam(params, 'to'),
    costCenterId: parseDashboardCostCenterFromSearchParams(params),
    situation: parseDashboardSituationFromSearchParams(params),
    categoryId: parseDashboardCategoryFromSearchParams(params),
  };
}

export function buildReportsSearchParams(input: {
  readonly type?: ReportType;
  readonly from: string;
  readonly to: string;
  readonly costCenterId: string | null;
  readonly situation: DashboardSituation | null;
  readonly categoryId: string | null;
}): URLSearchParams {
  let next = new URLSearchParams();
  next.set('type', input.type ?? REPORT_TYPE_REVENUE);
  next.set('from', input.from);
  next.set('to', input.to);
  next = buildDashboardCostCenterSearchParams(next, input.costCenterId);
  next = buildDashboardSituationSearchParams(next, input.situation);
  next = buildDashboardCategorySearchParams(next, input.categoryId);
  next.delete('tenantId');
  next.delete('costCenterId');
  next.delete('status');
  return next;
}

export type ReportRangeIssue = 'inverted' | 'too_large' | 'invalid';

export function validateReportMonthRange(
  fromKey: string,
  toKey: string,
): ReportRangeIssue | null {
  if (!isValidDashboardMonthKey(fromKey) || !isValidDashboardMonthKey(toKey)) {
    return 'invalid';
  }
  if (fromKey > toKey) {
    return 'inverted';
  }
  const keys = listInclusiveDashboardMonthKeys(fromKey, toKey);
  if (keys.length === 0) {
    return 'invalid';
  }
  if (keys.length > REPORT_MAX_MONTH_SPAN) {
    return 'too_large';
  }
  return null;
}
