import type { OpenPayablesCategoryCompositionResult } from '../../analytics/domain/types.js';
import type { DashboardExpenseCompositionResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardExpenseCompositionResponse(
  composition: OpenPayablesCategoryCompositionResult,
): DashboardExpenseCompositionResponse {
  return {
    today: serializeCivilDate(composition.today),
    payables: {
      total: serializeDecimal(composition.total),
      classified: serializeDecimal(composition.classified),
      uncategorized: serializeDecimal(composition.uncategorized),
      imprecise: serializeDecimal(composition.imprecise),
      coverageRate:
        composition.coverageRate === null ? null : serializeDecimal(composition.coverageRate),
      items: composition.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        percentage: serializeDecimal(item.percentage),
      })),
    },
  };
}
