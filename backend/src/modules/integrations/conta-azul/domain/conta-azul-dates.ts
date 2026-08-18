export class ContaAzulDateError extends Error {
  constructor(message = 'Data inválida.') {
    super(message);
    this.name = 'ContaAzulDateError';
  }
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CivilDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

export function parseCivilDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ContaAzulDateError(`Campo ${field} deve ser uma data civil.`);
  }
  const match = CIVIL_DATE.exec(value.trim());
  if (!match) {
    throw new ContaAzulDateError(`Campo ${field} deve estar no formato YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ContaAzulDateError(`Campo ${field} não é uma data civil válida.`);
  }
  return parsed;
}

export function parseOptionalCivilDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return parseCivilDate(value, field);
}

export function parseOptionalTimestamp(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ContaAzulDateError(`Campo ${field} deve ser um instante.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ContaAzulDateError(`Campo ${field} não é um instante válido.`);
  }
  return parsed;
}

export function formatCivilDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function utcCivilDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Soma anos em calendário civil UTC. Se o dia não existir no mês destino
 * (29 de fevereiro em ano não bissexto), usa o último dia válido daquele mês.
 */
export function addCivilYears(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const monthIndex = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), utcDaysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}

export function addUtcYears(date: Date, years: number): Date {
  return addCivilYears(date, years);
}

export type DueDateWindow = {
  readonly from: string;
  readonly to: string;
};

export function buildDueDateWindows(
  now: Date,
  options: {
    readonly lookbackYears: number;
    readonly lookaheadYears: number;
    readonly windowDays: number;
  },
): DueDateWindow[] {
  const origin = utcCivilDate(now);
  const start = addCivilYears(origin, -options.lookbackYears);
  const end = addCivilYears(origin, options.lookaheadYears);
  const windows: DueDateWindow[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const windowEndCandidate = addUtcDays(cursor, options.windowDays - 1);
    const windowEnd = windowEndCandidate.getTime() > end.getTime() ? end : windowEndCandidate;
    windows.push({
      from: formatCivilDate(cursor),
      to: formatCivilDate(windowEnd),
    });
    cursor = addUtcDays(windowEnd, 1);
  }
  return windows;
}
