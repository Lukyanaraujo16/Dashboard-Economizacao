const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDashboardCostCenterId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/** `costCenter` da URL; inválido/ausente → null (Todos). */
export function parseDashboardCostCenterFromSearchParams(
  params: Readonly<URLSearchParams>,
): string | null {
  const raw = params.get('costCenter');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  return isValidDashboardCostCenterId(trimmed) ? trimmed : null;
}

export function resolveSelectedDashboardCostCenterId(
  params: Readonly<URLSearchParams>,
): string | null {
  return parseDashboardCostCenterFromSearchParams(params);
}

/**
 * Atualiza `costCenter` preservando os demais params (incl. `month`).
 * `null`/vazio = Todos → omite o param.
 */
export function buildDashboardCostCenterSearchParams(
  params: Readonly<URLSearchParams>,
  costCenterId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (costCenterId === null || costCenterId.trim() === '') {
    next.delete('costCenter');
  } else {
    next.set('costCenter', costCenterId.trim());
  }
  return next;
}
