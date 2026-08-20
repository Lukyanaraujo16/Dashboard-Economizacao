import type { FinancialInstallmentStatus } from '../../../generated/prisma/client.js';

/**
 * Títulos que entram na receita mensal por competência.
 * RENEGOTIATED fica de fora (D3). LOST e UNKNOWN não são receita reconhecida.
 */
export const MONTHLY_COMPETENCE_REVENUE_STATUSES = [
  'OPEN',
  'OVERDUE',
  'PARTIALLY_PAID',
  'PAID',
] as const satisfies readonly FinancialInstallmentStatus[];

export type MonthlyCompetenceRevenueStatus = (typeof MONTHLY_COMPETENCE_REVENUE_STATUSES)[number];
