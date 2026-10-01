import type { ExpenseCeilingProgress } from '../domain/expense-ceiling-math.js';
import type { DashboardExpenseCeilingResponse } from '../domain/types.js';
import { serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullable(value: ExpenseCeilingProgress['ceiling']): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardExpenseCeilingResponse(
  progress: ExpenseCeilingProgress,
): DashboardExpenseCeilingResponse {
  return {
    monthKey: progress.monthKey,
    ceiling: serializeNullable(progress.ceiling),
    monthlyExpenses: serializeNullable(progress.monthlyExpenses),
    consumedRate: serializeNullable(progress.consumedRate),
    available: serializeNullable(progress.available),
    exceeded: serializeNullable(progress.exceeded),
    status: progress.status,
  };
}
