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
