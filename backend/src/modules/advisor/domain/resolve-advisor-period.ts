import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import {
  civilMonthKey,
  isValidMonthKey,
  shiftCivilMonthKey,
} from '../../analytics/domain/civil-calendar.js';

/**
 * Resolução temporal determinística do Consultor (F13.6.1).
 * Sem Prisma, HTTP, provider ou LLM.
 *
 * Precedência:
 * mês explícito na pergunta
 *   > mês de referência da superfície (`month` no POST)
 *   > mês civil atual America/Sao_Paulo
 *
 * Mês citado sem ano: usa o ano do mês de referência; senão o ano civil SP.
 * Dois períodos explícitos distintos: não inventa — cai no default.
 */
export const ADVISOR_PERIOD_SOURCES = ['EXPLICIT', 'SELECTED', 'CURRENT', 'RELATIVE'] as const;

export type AdvisorPeriodSource = (typeof ADVISOR_PERIOD_SOURCES)[number];

export type ResolveAdvisorPeriodInput = {
  readonly content: string;
  readonly referenceMonthKey?: string;
  readonly now?: Date;
};

export type AdvisorResolvedPeriod = {
  readonly monthKey: string;
  readonly source: AdvisorPeriodSource;
};

const MONTH_ENTRIES: readonly { readonly names: readonly string[]; readonly mm: string }[] = [
  { names: ['janeiro', 'jan'], mm: '01' },
  { names: ['fevereiro', 'fev'], mm: '02' },
  { names: ['marco', 'mar'], mm: '03' },
  { names: ['abril', 'abr'], mm: '04' },
  { names: ['maio', 'mai'], mm: '05' },
  { names: ['junho', 'jun'], mm: '06' },
  { names: ['julho', 'jul'], mm: '07' },
  { names: ['agosto', 'ago'], mm: '08' },
  { names: ['setembro', 'set'], mm: '09' },
  { names: ['outubro', 'out'], mm: '10' },
  { names: ['novembro', 'nov'], mm: '11' },
  { names: ['dezembro', 'dez'], mm: '12' },
];

const MONTH_NAME_PATTERN = MONTH_ENTRIES.flatMap((entry) => entry.names)
  .sort((left, right) => right.length - left.length)
  .join('|');

const THIS_MONTH_PATTERN = /\b(?:este|neste|nesse)\s+mes\b|\bmes\s+atual\b/;
const LAST_MONTH_PATTERN = /\bmes\s+(?:passado|anterior)\b/;

/**
 * Quantos períodos distintos a pergunta nomeia.
 * 0 = nenhum; 1 = único explícito; >= 2 = ambíguo (F13.6.1 não inventa).
 */
export function countAdvisorNamedPeriods(content: string): number {
  const folded = foldPt(content);
  const uniqueExplicit = uniqueMonthKeys(collectExplicitWithYear(folded));
  if (uniqueExplicit.length > 0) {
    return uniqueExplicit.length;
  }
  return uniqueValues(collectBareMonthNumbers(folded)).length;
}

export function resolveAdvisorPeriod(input: ResolveAdvisorPeriodInput): AdvisorResolvedPeriod {
  const now = input.now ?? new Date();
  const currentMonthKey = civilMonthKey(civilTodayInSaoPaulo(now));
  const referenceMonthKey = sanitizeReference(input.referenceMonthKey);
  const folded = foldPt(input.content);
  const uniqueExplicit = uniqueMonthKeys(collectExplicitWithYear(folded));

  if (uniqueExplicit.length === 1) {
    return { monthKey: uniqueExplicit[0]!, source: 'EXPLICIT' };
  }

  if (uniqueExplicit.length === 0) {
    const uniqueBare = uniqueValues(collectBareMonthNumbers(folded));
    if (uniqueBare.length === 1) {
      const year = (referenceMonthKey ?? currentMonthKey).slice(0, 4);
      return { monthKey: `${year}-${uniqueBare[0]!}`, source: 'EXPLICIT' };
    }
  }

  if (uniqueExplicit.length <= 1 && LAST_MONTH_PATTERN.test(folded)) {
    return {
      monthKey: shiftCivilMonthKey(referenceMonthKey ?? currentMonthKey, -1),
      source: 'RELATIVE',
    };
  }

  if (uniqueExplicit.length <= 1 && THIS_MONTH_PATTERN.test(folded)) {
    if (referenceMonthKey !== undefined) {
      return { monthKey: referenceMonthKey, source: 'SELECTED' };
    }
    return { monthKey: currentMonthKey, source: 'CURRENT' };
  }

  if (referenceMonthKey !== undefined) {
    return { monthKey: referenceMonthKey, source: 'SELECTED' };
  }

  return { monthKey: currentMonthKey, source: 'CURRENT' };
}

function sanitizeReference(referenceMonthKey: string | undefined): string | undefined {
  if (referenceMonthKey === undefined) {
    return undefined;
  }
  const trimmed = referenceMonthKey.trim();
  return isValidMonthKey(trimmed) ? trimmed : undefined;
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function monthNumberFromName(name: string): string | undefined {
  const folded = foldPt(name);
  for (const entry of MONTH_ENTRIES) {
    if (entry.names.includes(folded)) {
      return entry.mm;
    }
  }
  return undefined;
}

function collectExplicitWithYear(folded: string): string[] {
  const keys: string[] = [];
  pushMatches(folded, /\b(\d{4})-(0[1-9]|1[0-2])\b/g, (match) => {
    keys.push(`${match[1]}-${match[2]}`);
  });
  pushMatches(folded, /\b(0?[1-9]|1[0-2])[/-](\d{4})\b/g, (match) => {
    keys.push(`${match[2]}-${(match[1] ?? '').padStart(2, '0')}`);
  });
  const namedWithYear = new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b\\s*(?:de\\s*)?(\\d{4})`, 'g');
  pushMatches(folded, namedWithYear, (match) => {
    const month = monthNumberFromName(match[1] ?? '');
    if (month !== undefined) {
      keys.push(`${match[2]}-${month}`);
    }
  });
  const namedSlashYear = new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b\\s*/\\s*(\\d{4})`, 'g');
  pushMatches(folded, namedSlashYear, (match) => {
    const month = monthNumberFromName(match[1] ?? '');
    if (month !== undefined) {
      keys.push(`${match[2]}-${month}`);
    }
  });
  return keys;
}

function collectBareMonthNumbers(folded: string): string[] {
  const stripped = folded
    .replace(new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b\\s*(?:de\\s*)?\\d{4}`, 'g'), ' ')
    .replace(new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b\\s*/\\s*\\d{4}`, 'g'), ' ')
    .replace(/\b\d{4}-(0[1-9]|1[0-2])\b/g, ' ')
    .replace(/\b(0?[1-9]|1[0-2])[/-]\d{4}\b/g, ' ');
  const months: string[] = [];
  pushMatches(stripped, new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b`, 'g'), (match) => {
    const month = monthNumberFromName(match[1] ?? '');
    if (month !== undefined) {
      months.push(month);
    }
  });
  return months;
}

function pushMatches(
  text: string,
  pattern: RegExp,
  onMatch: (match: RegExpExecArray) => void,
): void {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match = global.exec(text);
  while (match !== null) {
    onMatch(match);
    match = global.exec(text);
  }
}

function uniqueMonthKeys(keys: readonly string[]): string[] {
  return uniqueValues(keys);
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}
