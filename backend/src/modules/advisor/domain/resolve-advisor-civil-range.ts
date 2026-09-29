/**
 * Resolução determinística de período anual/YTD do Consultor (F13.8.3).
 * Não substitui monthKey: mês explícito continua autoridade quando presente.
 * Sem Prisma/HTTP/provider.
 */

import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { listAdvisorNamedPeriodKeys } from './resolve-advisor-period.js';

export const ADVISOR_CIVIL_RANGE_KINDS = ['YTD', 'YEAR'] as const;
export type AdvisorCivilRangeKind = (typeof ADVISOR_CIVIL_RANGE_KINDS)[number];

export type AdvisorCivilRange = {
  readonly kind: AdvisorCivilRangeKind;
  readonly year: number;
  readonly from: Date;
  readonly to: Date;
  readonly asOf: Date;
  readonly isPartialYear: boolean;
  /** Chave estável para logs/contrato (ex.: 2026-YTD, 2025). */
  readonly rangeKey: string;
};

export type ResolveAdvisorCivilRangeInput = {
  readonly content: string;
  readonly now?: Date;
};

const YTD_CUE =
  /\b(?:este|neste|nesse|deste)\s+ano(?:\s+ate\s+agora)?\b|\bno\s+ano(?:\s+ate\s+agora)?\b|\bde\s+janeiro\s+ate\s+agora\b/;

const EXPLICIT_YEAR =
  /\b(?:em|no\s+ano\s+de|durante)\s+(\d{4})\b|\bano\s+de\s+(\d{4})\b/;

/**
 * Bounds civis do ano completo (1 jan … 31 dez), meia-noite UTC da data civil.
 */
export function civilYearBounds(year: number): { readonly from: Date; readonly to: Date } {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error('year inválido.');
  }
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31)),
  };
}

/**
 * YTD: 1 jan do ano de `asOf` até `asOf` (inclusive).
 */
export function civilYtdBounds(asOf: Date): {
  readonly from: Date;
  readonly to: Date;
  readonly year: number;
} {
  const year = asOf.getUTCFullYear();
  return {
    year,
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
  };
}

export function formatAdvisorCivilDateKey(civilDate: Date): string {
  const year = civilDate.getUTCFullYear();
  const month = String(civilDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(civilDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolve YTD/ano explícito. Retorna null quando:
 * - não há cue anual; ou
 * - há mês explícito que não é o idioma "janeiro até agora"; ou
 * - ano futuro (sem fato oficial ainda).
 *
 * Precedência: mês explícito (exceto idioma YTD) > interpretação anual.
 */
export function resolveAdvisorCivilRange(
  input: ResolveAdvisorCivilRangeInput,
): AdvisorCivilRange | null {
  const now = input.now ?? new Date();
  const asOf = civilTodayInSaoPaulo(now);
  const folded = foldPt(input.content);
  const currentYear = asOf.getUTCFullYear();

  if (!hasAnnualCue(folded)) {
    return null;
  }

  if (hasBlockingExplicitMonth(folded, input)) {
    return null;
  }

  const explicitYear = extractExplicitYear(folded);
  if (explicitYear !== null) {
    if (explicitYear > currentYear) {
      return null;
    }
    if (explicitYear === currentYear) {
      const ytd = civilYtdBounds(asOf);
      return {
        kind: 'YTD',
        year: ytd.year,
        from: ytd.from,
        to: ytd.to,
        asOf,
        isPartialYear: true,
        rangeKey: `${ytd.year}-YTD`,
      };
    }
    const full = civilYearBounds(explicitYear);
    return {
      kind: 'YEAR',
      year: explicitYear,
      from: full.from,
      to: full.to,
      asOf,
      isPartialYear: false,
      rangeKey: String(explicitYear),
    };
  }

  const ytd = civilYtdBounds(asOf);
  return {
    kind: 'YTD',
    year: ytd.year,
    from: ytd.from,
    to: ytd.to,
    asOf,
    isPartialYear: true,
    rangeKey: `${ytd.year}-YTD`,
  };
}

function hasAnnualCue(folded: string): boolean {
  return YTD_CUE.test(folded) || EXPLICIT_YEAR.test(folded);
}

function extractExplicitYear(folded: string): number | null {
  const match = EXPLICIT_YEAR.exec(folded);
  if (match === null) {
    return null;
  }
  const raw = match[1] ?? match[2];
  if (raw === undefined) {
    return null;
  }
  const year = Number(raw);
  return Number.isInteger(year) ? year : null;
}

/**
 * Mês explícito bloqueia anual, exceto o idioma "de janeiro até agora"
 * (tratado como YTD, não como janeiro isolado).
 */
function hasBlockingExplicitMonth(
  folded: string,
  input: ResolveAdvisorCivilRangeInput,
): boolean {
  const janeiroAteAgora = /\b(?:de\s+)?janeiro\s+ate\s+agora\b/.test(folded);
  const named = listAdvisorNamedPeriodKeys({
    content: input.content,
    now: input.now,
  });
  if (named.length === 0) {
    return false;
  }
  if (janeiroAteAgora && named.every((key) => key.endsWith('-01'))) {
    return false;
  }
  return true;
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
