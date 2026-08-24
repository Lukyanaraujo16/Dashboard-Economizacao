export const DASHBOARD_SITUATIONS = ['settled', 'open', 'overdue'] as const;

export type DashboardSituation = (typeof DASHBOARD_SITUATIONS)[number];

export const DASHBOARD_SITUATION_ALL_LABEL = 'Todas';

export const DASHBOARD_SITUATION_LABELS: Record<DashboardSituation, string> = {
  settled: 'Quitado',
  open: 'Em aberto',
  overdue: 'Vencido',
};

export function isDashboardSituation(value: string): value is DashboardSituation {
  return (DASHBOARD_SITUATIONS as readonly string[]).includes(value);
}

/** `situation` da URL; inválido/ausente → null (Todas). */
export function parseDashboardSituationFromSearchParams(
  params: Readonly<URLSearchParams>,
): DashboardSituation | null {
  const raw = params.get('situation');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  return isDashboardSituation(trimmed) ? trimmed : null;
}

export function resolveSelectedDashboardSituation(
  params: Readonly<URLSearchParams>,
): DashboardSituation | null {
  return parseDashboardSituationFromSearchParams(params);
}

export function dashboardSituationLabel(situation: DashboardSituation | null): string {
  return situation === null ? DASHBOARD_SITUATION_ALL_LABEL : DASHBOARD_SITUATION_LABELS[situation];
}

/**
 * Atualiza `situation` preservando os demais params.
 * `null` = Todas → omite o param (não escreve default).
 */
export function buildDashboardSituationSearchParams(
  params: Readonly<URLSearchParams>,
  situation: DashboardSituation | null,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (situation === null) {
    next.delete('situation');
  } else {
    next.set('situation', situation);
  }
  return next;
}
