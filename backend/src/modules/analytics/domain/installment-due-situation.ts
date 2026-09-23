/**
 * Classificação civil de vencimento do estoque financeiro.
 * `today` deve ser `civilTodayInSaoPaulo` (meia-noite UTC).
 */

export const INSTALLMENT_DUE_SITUATIONS = ['OVERDUE', 'DUE_TODAY', 'UPCOMING'] as const;

export type InstallmentDueSituation = (typeof INSTALLMENT_DUE_SITUATIONS)[number];

const SITUATION_RANK: Readonly<Record<InstallmentDueSituation, number>> = {
  OVERDUE: 0,
  DUE_TODAY: 1,
  UPCOMING: 2,
};

const MS_PER_CIVIL_DAY = 86_400_000;

export function isInstallmentDueSituation(value: string): value is InstallmentDueSituation {
  return (INSTALLMENT_DUE_SITUATIONS as readonly string[]).includes(value);
}

export function classifyInstallmentDueSituation(
  dueDate: Date,
  today: Date,
): InstallmentDueSituation {
  const dueTime = dueDate.getTime();
  const todayTime = today.getTime();
  if (dueTime < todayTime) {
    return 'OVERDUE';
  }
  if (dueTime === todayTime) {
    return 'DUE_TODAY';
  }
  return 'UPCOMING';
}

/**
 * Dias civis de atraso (dueDate e today em meia-noite UTC).
 * Null quando não está vencido.
 */
export function civilDaysOverdue(dueDate: Date, today: Date): number | null {
  if (dueDate.getTime() >= today.getTime()) {
    return null;
  }
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((todayDay - dueDay) / MS_PER_CIVIL_DAY);
}

export function compareInstallmentDueSituation(
  left: InstallmentDueSituation,
  right: InstallmentDueSituation,
): number {
  return SITUATION_RANK[left] - SITUATION_RANK[right];
}
