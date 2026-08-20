/**
 * Contrato futuro de Meta de Faturamento (F2 — ainda sem persistência/API).
 *
 * Realizado = `GET /dashboard/monthly-revenue` → `receivables.total` (competência).
 * Meta = NÃO existe hoje (schema/API/config). Não inventar valores.
 *
 * Quando a API existir, o payload esperado por competência será:
 *
 * ```
 * {
 *   monthKey: "YYYY-MM",
 *   targetAmount: string | null,   // Decimal string; null = não configurada
 *   realizedAmount: string,        // espelha monthly-revenue.total
 *   history: Array<{
 *     monthKey: string,
 *     targetAmount: string | null,
 *     realizedAmount: string,
 *   }>
 * }
 * ```
 *
 * Derivados (frontend, Decimal-safe): achievement%, remaining, exceeded.
 * IA / sugestão de meta: FUTURA — fora deste contrato.
 */

export type RevenueGoalHistoryPoint = {
  readonly monthKey: string;
  /** null = competência sem meta cadastrada. */
  readonly targetAmount: string | null;
  readonly realizedAmount: string;
};

export type RevenueGoalSnapshot = {
  readonly monthKey: string;
  readonly targetAmount: string | null;
  readonly realizedAmount: string;
  readonly history: readonly RevenueGoalHistoryPoint[];
};

export type RevenueGoalStatus = 'unconfigured' | 'behind' | 'met' | 'exceeded';
