import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { addCivilDays, civilDateUtcFromKey, formatCivilDateKey } from '../../analytics/domain/civil-calendar.js';

const MONTHS: readonly { readonly name: string; readonly month: number }[] = [
  { name: 'janeiro', month: 1 },
  { name: 'fevereiro', month: 2 },
  { name: 'marco', month: 3 },
  { name: 'abril', month: 4 },
  { name: 'maio', month: 5 },
  { name: 'junho', month: 6 },
  { name: 'julho', month: 7 },
  { name: 'agosto', month: 8 },
  { name: 'setembro', month: 9 },
  { name: 'outubro', month: 10 },
  { name: 'novembro', month: 11 },
  { name: 'dezembro', month: 12 },
];

const MONTH_PATTERN = MONTHS.map((entry) => entry.name).join('|');

export type AdvisorCivilDayResolution =
  | { readonly status: 'ABSENT' }
  | { readonly status: 'RESOLVED'; readonly date: string }
  | { readonly status: 'INVALID' }
  | { readonly status: 'AMBIGUOUS' };

export type AdvisorDailyDirectionResolution = 'INFLOW' | 'OUTFLOW' | null;

export type AdvisorDailyCenterResolution =
  | { readonly status: 'ABSENT' }
  | { readonly status: 'ALL' }
  | { readonly status: 'NAMED'; readonly query: string }
  | { readonly status: 'AMBIGUOUS' };

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string | null {
  const key = `${year}-${pad(month)}-${pad(day)}`;
  return civilDateUtcFromKey(key) === null ? null : key;
}

function referenceParts(referenceMonthKey: string | null, now: Date): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(referenceMonthKey ?? '');
  if (match !== null) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  const today = civilTodayInSaoPaulo(now);
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

function monthFromName(name: string): number | null {
  return MONTHS.find((entry) => entry.name === name)?.month ?? null;
}

function pushUnique(target: string[], value: string | null): 'invalid' | 'ok' {
  if (value === null) {
    return 'invalid';
  }
  if (!target.includes(value)) {
    target.push(value);
  }
  return 'ok';
}

/**
 * Datas determinísticas de um dia civil.
 * Ano explícito vence. Mês sem ano usa o ano da referência.
 * "dia N" sem mês usa o mês da referência. hoje/ontem/anteontem usam America/Sao_Paulo.
 */
export function resolveAdvisorCivilDay(input: {
  readonly content: string;
  readonly referenceMonthKey: string | null;
  readonly now: Date;
}): AdvisorCivilDayResolution {
  const folded = foldPt(input.content);
  const reference = referenceParts(input.referenceMonthKey, input.now);
  const found: string[] = [];
  let invalid = false;

  const relative = /\banteontem\b/.test(folded)
    ? 'anteontem'
    : /\bontem\b/.test(folded)
      ? 'ontem'
      : /\bhoje\b/.test(folded)
        ? 'hoje'
        : null;
  if (relative !== null) {
    const today = civilTodayInSaoPaulo(input.now);
    const shifted =
      relative === 'anteontem' ? addCivilDays(today, -2) : relative === 'ontem' ? addCivilDays(today, -1) : today;
    found.push(formatCivilDateKey(shifted));
  }

  const fullSlash = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(folded);
  if (fullSlash !== null) {
    invalid =
      pushUnique(found, dateKey(Number(fullSlash[3]), Number(fullSlash[2]), Number(fullSlash[1]))) ===
        'invalid' || invalid;
  }

  const namedYear = new RegExp(`\\b(\\d{1,2}) de (${MONTH_PATTERN}) de (\\d{4})\\b`).exec(folded);
  if (namedYear !== null) {
    const month = monthFromName(namedYear[2] ?? '');
    invalid =
      pushUnique(
        found,
        month === null ? null : dateKey(Number(namedYear[3]), month, Number(namedYear[1])),
      ) === 'invalid' || invalid;
  }

  const named = new RegExp(`\\b(\\d{1,2}) de (${MONTH_PATTERN})\\b`).exec(folded);
  if (named !== null && namedYear === null) {
    const month = monthFromName(named[2] ?? '');
    invalid =
      pushUnique(found, month === null ? null : dateKey(reference.year, month, Number(named[1]))) ===
        'invalid' || invalid;
  }

  if (fullSlash === null) {
    const shortSlash = /\b(\d{1,2})\/(\d{1,2})\b/.exec(folded);
    if (shortSlash !== null) {
      invalid =
        pushUnique(
          found,
          dateKey(reference.year, Number(shortSlash[2]), Number(shortSlash[1])),
        ) === 'invalid' || invalid;
    }
  }

  const bare = /\bdia\s+(\d{1,2})\b/.exec(folded);
  if (bare !== null && named === null && namedYear === null && fullSlash === null && !/\b\d{1,2}\/\d{1,2}\b/.test(folded)) {
    invalid = pushUnique(found, dateKey(reference.year, reference.month, Number(bare[1]))) === 'invalid' || invalid;
  }

  if (invalid) {
    return { status: 'INVALID' };
  }
  if (found.length > 1) {
    return { status: 'AMBIGUOUS' };
  }
  if (found.length === 1) {
    return { status: 'RESOLVED', date: found[0]! };
  }
  return { status: 'ABSENT' };
}

export function resolveAdvisorDailyMovementDirection(content: string): AdvisorDailyDirectionResolution {
  const folded = foldPt(content);
  const withoutWhoPaid = folded.replace(/\bquem me pagou\b/g, ' ').replace(/\bquem pagou\b/g, ' ');
  const inflow =
    /\b(?:recebi|recebeu|entrou|entradas|recebimentos|quem me pagou|quem pagou|de onde veio)\b/.test(
      folded,
    );
  const outflow =
    /\b(?:paguei|pagou|saiu|saidas|pagamentos|para onde foi|com o que gastei)\b/.test(withoutWhoPaid);
  if (inflow === outflow) {
    return null;
  }
  return inflow ? 'INFLOW' : 'OUTFLOW';
}

function cleanCenterName(name: string): string {
  let current = name.trim();
  let previous = '';
  while (current !== previous) {
    previous = current;
    current = current.replace(/\s+(?:no|na|de|do|da|em|para|por|o|a|os|as)$/g, '').trim();
  }
  return current;
}

function isStopCenter(name: string): boolean {
  return (
    MONTHS.some((entry) => entry.name === name) ||
    /^(?:dia|hoje|ontem|anteontem|todos|centros|centro|de custo|dinheiro|caixa|agosto)$/.test(name)
  );
}

function stripDayPhrases(folded: string): string {
  return folded
    .replace(new RegExp(`\\b\\d{1,2} de (${MONTH_PATTERN}) de \\d{4}\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b\\d{1,2} de (${MONTH_PATTERN})\\b`, 'g'), ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g, ' ')
    .replace(/\bdia\s+\d{1,2}\b/g, ' ')
    .replace(/\b(?:hoje|ontem|anteontem)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveAdvisorDailyMovementCenter(content: string): AdvisorDailyCenterResolution {
  const folded = foldPt(content);
  if (/\btodos os centros\b/.test(folded)) {
    return { status: 'ALL' };
  }
  const cleaned = stripDayPhrases(folded);
  const names: string[] = [];
  const pattern = /\bem\s+([a-z0-9][a-z0-9 ]{0,48}?)(?=\s+em\s+|$)/g;
  for (const match of cleaned.matchAll(pattern)) {
    const name = cleanCenterName(match[1] ?? '');
    if (name === '' || isStopCenter(name)) {
      continue;
    }
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  if (names.length > 1) {
    return { status: 'AMBIGUOUS' };
  }
  if (names.length === 1) {
    return { status: 'NAMED', query: names[0]! };
  }
  return { status: 'ABSENT' };
}

export function parseAdvisorDailyCenterFollowUp(
  content: string,
): { readonly kind: 'ALL' } | { readonly kind: 'NAMED'; readonly query: string } | null {
  const folded = foldPt(content);
  if (!/^(?:e|agora) em\b/.test(folded)) {
    return null;
  }
  if (resolveAdvisorCivilDay({ content, referenceMonthKey: null, now: new Date() }).status !== 'ABSENT') {
    return null;
  }
  if (resolveAdvisorDailyMovementDirection(content) !== null) {
    return null;
  }
  const center = resolveAdvisorDailyMovementCenter(content);
  if (center.status === 'ALL') {
    return { kind: 'ALL' };
  }
  if (center.status === 'NAMED') {
    return { kind: 'NAMED', query: center.query };
  }
  return null;
}

export function resolveCatalogCostCenter(
  centers: readonly { readonly id: string; readonly name: string; readonly active: boolean }[],
  query: string,
):
  | { readonly status: 'FOUND'; readonly id: string; readonly name: string }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'AMBIGUOUS' } {
  const needle = foldPt(query);
  if (needle === '') {
    return { status: 'NOT_FOUND' };
  }
  const active = centers.filter((center) => center.active);
  const exact = active.filter((center) => foldPt(center.name) === needle);
  if (exact.length === 1) {
    return { status: 'FOUND', id: exact[0]!.id, name: exact[0]!.name };
  }
  if (exact.length > 1) {
    return { status: 'AMBIGUOUS' };
  }
  const partial = active.filter((center) => foldPt(center.name).includes(needle));
  if (partial.length === 1) {
    return { status: 'FOUND', id: partial[0]!.id, name: partial[0]!.name };
  }
  if (partial.length > 1) {
    return { status: 'AMBIGUOUS' };
  }
  return { status: 'NOT_FOUND' };
}
