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

/** Desloca um `YYYY-MM` por `offset` meses civis (pode cruzar ano). */
export function shiftCivilMonthKey(monthKey: string, offset: number): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new Error('monthKey inválido.');
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return civilMonthKey(shifted);
}

/**
 * `count` monthKeys inclusivos a partir da âncora (0 = âncora, 1 = próximo, …).
 * Ex.: âncora 2026-09 + count 6 → SET…FEV/2027.
 */
export function listForwardInclusiveMonthKeys(
  anchorMonthKey: string,
  count: number,
): readonly string[] {
  const total = Math.max(1, Math.trunc(count));
  const keys: string[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    keys.push(shiftCivilMonthKey(anchorMonthKey, offset));
  }
  return keys;
}

/** Teto V1 de Relatórios (F12-A): amplitude inclusiva máxima de meses civis. */
export const MAX_REPORT_INCLUSIVE_MONTHS = 24;

/** Lista YYYY-MM inclusivos a partir de chaves já validadas. */
export function listInclusiveMonthKeysFromKeys(
  fromKey: string,
  toKey: string,
): readonly string[] {
  const from = civilMonthBoundsFromKey(fromKey).from;
  const to = civilMonthBoundsFromKey(toKey).to;
  return listInclusiveCivilMonthKeys(from, to);
}
