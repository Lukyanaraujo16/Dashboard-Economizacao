import { civilMonthKey } from '../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';

export function isCurrentCivilMonth(monthKey: string, now: Date): boolean {
  return monthKey === civilMonthKey(civilTodayInSaoPaulo(now));
}

export function logProactive(
  event: string,
  fields: Record<string, string | number | boolean | null>,
): void {
  process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`);
}

/** Depois do sync já marcado como sucesso. Falha aqui não desfaz o sync. */
export async function runAfterSyncSuccess(
  tenantId: string,
  hook: ((tenantId: string) => Promise<void>) | undefined,
): Promise<void> {
  if (!hook) {
    return;
  }
  try {
    await hook(tenantId);
  } catch {
    logProactive('proactive_evaluation_enqueue_failed', { tenantId });
  }
}

/**
 * Meta ou teto do mês civil corrente. Mês futuro e mês passado não enfileiram.
 * Falha da fila não desfaz o salvamento.
 */
export async function scheduleProactiveEvaluationForSavedMonth(input: {
  readonly monthKey: string;
  readonly now: Date;
  readonly tenantId: string;
  readonly schedule?: (tenantId: string) => Promise<void>;
}): Promise<void> {
  if (!input.schedule || !isCurrentCivilMonth(input.monthKey, input.now)) {
    return;
  }
  try {
    await input.schedule(input.tenantId);
  } catch {
    logProactive('proactive_evaluation_enqueue_failed', { tenantId: input.tenantId });
  }
}
