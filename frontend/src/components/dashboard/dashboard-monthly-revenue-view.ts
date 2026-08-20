import { isExpenseCompositionEmpty } from './dashboard-expense-composition-view';
import type { DashboardMonthlyRevenueResponse } from '../../services/dashboard/monthly-revenue.types';

export function monthlyRevenueSectionTitle(): string {
  return 'Receitas por categoria';
}

export function monthlyRevenueSectionSubtitle(): string {
  return 'Competência do mês selecionado.';
}

export function isMonthlyRevenueEmpty(data: DashboardMonthlyRevenueResponse): boolean {
  return isExpenseCompositionEmpty(data.receivables.items, data.receivables.total);
}
