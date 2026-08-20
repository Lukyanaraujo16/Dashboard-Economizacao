/**
 * Datas civis no mesmo contrato de dueDate (@db.Date = meia-noite UTC).
 * Soma de dias no calendário gregoriano, sem 24h em milissegundos.
 */

export function addCivilDays(civilDate: Date, days: number): Date {
  return new Date(
    Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate() + days),
  );
}

export function civilMonthKey(civilDate: Date): string {
  const month = String(civilDate.getUTCMonth() + 1).padStart(2, '0');
  return `${civilDate.getUTCFullYear()}-${month}`;
}

export function listInclusiveCivilMonthKeys(from: Date, to: Date): readonly string[] {
  const keys: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor.getTime() <= last.getTime()) {
    keys.push(civilMonthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return keys;
}

export function isCivilDateInInclusiveRange(civilDate: Date, from: Date, to: Date): boolean {
  const time = civilDate.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

/** Primeiro e último dia civil do mês de `civilToday` (UTC meia-noite). */
export function civilMonthBounds(civilToday: Date): {
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string;
} {
  const from = new Date(Date.UTC(civilToday.getUTCFullYear(), civilToday.getUTCMonth(), 1));
  const to = new Date(Date.UTC(civilToday.getUTCFullYear(), civilToday.getUTCMonth() + 1, 0));
  return { from, to, monthKey: civilMonthKey(from) };
}

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Bounds civis a partir de `YYYY-MM` estrito (mesma convenção UTC meia-noite). */
export function civilMonthBoundsFromKey(monthKey: string): {
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string;
} {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new Error('monthKey inválido.');
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { from, to, monthKey: `${match[1]}-${match[2]}` };
}

export function isValidMonthKey(monthKey: string): boolean {
  return MONTH_KEY_PATTERN.test(monthKey);
}
