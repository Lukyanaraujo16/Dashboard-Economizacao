import type { DashboardSituation } from './dashboard-situation';

/**
 * Contrato único dos query params da Home.
 * Cada endpoint escolhe quais campos enviar.
 */
export type DashboardHomeQuery = {
  readonly monthKey?: string | null;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
};

export type DashboardCompetenceQuery = DashboardHomeQuery;

/** Forecast / pressão: category sim; situation não entra na query. */
export type DashboardCashWindowQuery = {
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
};
