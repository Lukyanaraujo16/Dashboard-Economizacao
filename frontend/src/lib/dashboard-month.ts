const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type DashboardMonthPhase = 'past' | 'current' | 'future';

export function isValidDashboardMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value.trim());
}

/** Mês civil corrente em America/Sao_Paulo (YYYY-MM). */
export function currentDashboardMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

export function parseDashboardMonthFromSearchParams(
  params: Readonly<URLSearchParams>,
): string | null {
  const raw = params.get('month');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  return isValidDashboardMonthKey(trimmed) ? trimmed : null;
}

export function resolveSelectedDashboardMonthKey(
  params: Readonly<URLSearchParams>,
  todayMonthKey: string,
): string {
  const fromUrl = parseDashboardMonthFromSearchParams(params);
  return fromUrl ?? todayMonthKey;
}

export function compareMonthKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function dashboardMonthPhase(monthKey: string, todayMonthKey: string): DashboardMonthPhase {
  const cmp = compareMonthKeys(monthKey, todayMonthKey);
  if (cmp < 0) {
    return 'past';
  }
  if (cmp > 0) {
    return 'future';
  }
  return 'current';
}

export function shiftDashboardMonthKey(monthKey: string, deltaMonths: number): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    return monthKey;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(Date.UTC(year, monthIndex + deltaMonths, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

export function listDashboardMonthKeysForYear(year: number): readonly string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
}

export function monthShortLabelPtBr(monthKey: string): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    return monthKey;
  }
  const labels = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ] as const;
  const index = Number(match[2]) - 1;
  if (index < 0 || index >= labels.length) {
    return monthKey;
  }
  return labels[index]!;
}

export function buildDashboardMonthSearchParams(
  params: Readonly<URLSearchParams>,
  monthKey: string,
  todayMonthKey: string = currentDashboardMonthKey(),
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (monthKey === todayMonthKey) {
    next.delete('month');
  } else {
    next.set('month', monthKey);
  }
  return next;
}

/** Teto V1 de Relatórios (F12-A): amplitude inclusiva máxima. */
export const REPORT_MAX_MONTH_SPAN = 24;

/** Meses civis inclusivos `from`..`to`. Inválido ou invertido → []. */
export function listInclusiveDashboardMonthKeys(
  fromKey: string,
  toKey: string,
): readonly string[] {
  if (!isValidDashboardMonthKey(fromKey) || !isValidDashboardMonthKey(toKey)) {
    return [];
  }
  if (compareMonthKeys(fromKey, toKey) > 0) {
    return [];
  }
  const keys: string[] = [];
  let cursor = fromKey;
  while (compareMonthKeys(cursor, toKey) <= 0) {
    keys.push(cursor);
    if (keys.length > REPORT_MAX_MONTH_SPAN) {
      break;
    }
    cursor = shiftDashboardMonthKey(cursor, 1);
  }
  return keys;
}
