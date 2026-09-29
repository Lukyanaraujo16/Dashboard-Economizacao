import { Prisma } from '../../../generated/prisma/client.js';

const MONTH_LABELS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/**
 * Formatação determinística de exibição. Não recalcula domínio financeiro.
 */
export function formatAdvisorFactualBrl(raw: string): string | null {
  if (!isNumericFact(raw)) {
    return null;
  }
  try {
    const decimal = new Prisma.Decimal(raw);
    const fixed = decimal.toFixed(2);
    const negative = fixed.startsWith('-');
    const absolute = negative ? fixed.slice(1) : fixed;
    const [integerPart, fractionPart] = absolute.split('.');
    if (integerPart === undefined || fractionPart === undefined) {
      return null;
    }
    const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negative ? '-' : ''}R$ ${grouped},${fractionPart}`;
  } catch {
    return null;
  }
}

export function formatAdvisorFactualPercent(raw: string): string | null {
  if (!isNumericFact(raw)) {
    return null;
  }
  try {
    const decimal = new Prisma.Decimal(raw);
    return `${decimal.toDecimalPlaces(2).toFixed(2).replace('.', ',')}%`;
  } catch {
    return null;
  }
}

export function formatAdvisorFactualMonth(monthKey: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (match === null) {
    return null;
  }
  const year = match[1]!;
  const monthIndex = Number(match[2]) - 1;
  const label = MONTH_LABELS[monthIndex];
  if (label === undefined) {
    return null;
  }
  return `${label} de ${year}`;
}

/**
 * Rótulo civil de período oficial do Consultor (mês OU range YTD/YEAR).
 * Não recalcula domínio financeiro.
 */
export function formatAdvisorFactualPeriodScope(facts: {
  readonly monthKey?: unknown;
  readonly periodKind?: unknown;
  readonly year?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
}): string | null {
  const periodKind =
    typeof facts.periodKind === 'string' ? facts.periodKind.trim().toUpperCase() : '';
  const year =
    typeof facts.year === 'number' && Number.isInteger(facts.year)
      ? facts.year
      : typeof facts.year === 'string' && /^\d{4}$/.test(facts.year.trim())
        ? Number(facts.year.trim())
        : null;
  if (periodKind === 'YTD' && year !== null) {
    return `${year} até agora`;
  }
  if (periodKind === 'YEAR' && year !== null) {
    return String(year);
  }
  if (typeof facts.monthKey === 'string' && facts.monthKey.trim() !== '') {
    return formatAdvisorFactualMonth(facts.monthKey);
  }
  return null;
}

/**
 * Prefixo semântico obrigatório: caixa realizado ≠ faturamento/competência.
 */
export function formatAdvisorNominalCashPeriodPrefix(facts: {
  readonly monthKey?: unknown;
  readonly periodKind?: unknown;
  readonly year?: unknown;
  readonly direction?: unknown;
}): string | null {
  const scope = formatAdvisorFactualPeriodScope(facts);
  if (scope === null) {
    return null;
  }
  const direction =
    typeof facts.direction === 'string' ? facts.direction.trim().toUpperCase() : 'INFLOWS';
  const cashLabel =
    direction === 'OUTFLOWS'
      ? 'saídas realizadas de caixa'
      : 'recebimentos realizados / entradas de caixa';
  if (typeof facts.periodKind === 'string' && facts.periodKind.trim() !== '') {
    return `Considerando ${cashLabel} em ${scope}`;
  }
  return `Em ${scope}`;
}

export function parseAdvisorFactualDecimal(raw: string): Prisma.Decimal | null {
  if (!isNumericFact(raw)) {
    return null;
  }
  try {
    return new Prisma.Decimal(raw);
  } catch {
    return null;
  }
}

export function extractAdvisorMentionedAmounts(content: string): readonly string[] {
  const matches = content.match(
    /R\$\s*\d{1,3}(?:\.\d{3})+,\d{2}|R\$\s*\d+,\d{2}|\b\d{1,3}(?:\.\d{3})+,\d{2}\b|\b\d+[.,]\d{2}\b/g,
  );
  if (matches === null) {
    return [];
  }
  const parsed: string[] = [];
  for (const match of matches) {
    const normalized = match
      .replace(/R\$\s*/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const decimal = parseAdvisorFactualDecimal(normalized);
    if (decimal !== null) {
      parsed.push(decimal.toString());
    }
  }
  return parsed;
}

export function amountsMatch(left: string, right: string): boolean {
  const leftDecimal = parseAdvisorFactualDecimal(left);
  const rightDecimal = parseAdvisorFactualDecimal(right);
  if (leftDecimal === null || rightDecimal === null) {
    return false;
  }
  return leftDecimal.eq(rightDecimal);
}

function isNumericFact(raw: string): boolean {
  return raw !== 'ABSENT' && raw !== 'NOT_APPLICABLE' && /^-?\d+(?:\.\d+)?$/.test(raw.trim());
}
