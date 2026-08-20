/**
 * Helpers de apresentação dos gráficos SVG da Dashboard V2.
 * Valor de domínio permanece decimal-string; `number` entra apenas na geometria.
 */

/** Ponto diário por competência (`date` = competenceDate; `amount` = Σ total do dia). */
export type DailyPoint = {
  readonly date: string;
  readonly amount: string;
};

/**
 * Ponto diário com os snapshots do backend.
 * `received`/`outstanding` são o estado atual dos títulos com competência
 * naquele dia — nunca o movimento de caixa do dia.
 */
export type CompetenceDailyPoint = DailyPoint & {
  readonly received: string;
  readonly outstanding: string;
};

export type SvgPoint = {
  readonly index: number;
  readonly x: number;
  readonly y: number;
};

export type SvgScaleOptions = {
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
  readonly max?: number;
  /** Escala com zero no meio do eixo, para séries que podem ser negativas. */
  readonly signed?: boolean;
};

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CENTS_SCALE = 2;

function toCents(value: string): bigint {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return 0n;
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw = '0', fracRaw = ''] = unsigned.split('.');
  const padded = fracRaw.padEnd(CENTS_SCALE + 1, '0');
  const keep = padded.slice(0, CENTS_SCALE);
  const next = padded.slice(CENTS_SCALE, CENTS_SCALE + 1);
  let cents = BigInt(wholeRaw || '0') * 100n + BigInt(keep || '0');
  if (next !== '' && Number(next) >= 5) {
    cents += 1n;
  }
  return negative ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(CENTS_SCALE, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDecimalPt(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits).replace('.', ',');
}

/** Decimal-string → number. Uso restrito a escala/geometria; nunca para exibir dinheiro. */
export function parseAmount(value: string): number {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** YYYY-MM-DD → dd/mm. Entrada inválida retorna o valor original. */
export function formatDayPt(date: string): string {
  const match = DATE_PATTERN.exec(date.trim());
  if (!match) {
    return date;
  }
  const [, , month, day] = match;
  if (!month || !day) {
    return date;
  }
  return `${day}/${month}`;
}

/** Soma corrida em centavos (bigint) — o acumulado continua decimal-string. */
export function accumulate(points: readonly DailyPoint[]): readonly DailyPoint[] {
  let running = 0n;
  return points.map((point) => {
    running += toCents(point.amount);
    return { date: point.date, amount: fromCents(running) };
  });
}

/** Diferença em centavos (bigint) — o resultado continua decimal-string. */
export function subtractDecimalStrings(minuend: string, subtrahend: string): string {
  return fromCents(toCents(minuend) - toCents(subtrahend));
}

/**
 * Série de `received` do snapshot como pontos diários.
 * O valor é o quanto já foi liquidado dos títulos com competência no dia,
 * não o que entrou em caixa naquele dia.
 */
export function receivedSeries(
  points: readonly CompetenceDailyPoint[],
): readonly DailyPoint[] {
  return points.map((point) => ({ date: point.date, amount: point.received }));
}

/** Série de `outstanding` do snapshot como pontos diários (saldo atual, não caixa). */
export function outstandingSeries(
  points: readonly CompetenceDailyPoint[],
): readonly DailyPoint[] {
  return points.map((point) => ({ date: point.date, amount: point.outstanding }));
}

/**
 * Resultado gerencial diário da competência: receitas − despesas do mesmo dia
 * civil de competência. Dias ausentes de um dos lados contam como zero.
 * Diferença de competência; não é caixa.
 */
export function resultDailySeries(
  revenueDaily: readonly DailyPoint[],
  expenseDaily: readonly DailyPoint[],
): readonly DailyPoint[] {
  const aligned = alignDailySeries(revenueDaily, expenseDaily);
  return aligned.dates.map((date, index) => ({
    date,
    amount: subtractDecimalStrings(
      aligned.first[index]?.amount ?? '0.00',
      aligned.second[index]?.amount ?? '0.00',
    ),
  }));
}

/**
 * Participação da parte no total (×100, 1 casa), preservando o sinal da parte.
 * `null` quando o total é zero — não existe participação a declarar.
 * Mesmo contrato visual de `formatDelinquencyRate`.
 */
export function signedSharePercent(part: string, total: string): string | null {
  const totalCents = toCents(total);
  if (totalCents === 0n) {
    return null;
  }
  const absTotal = totalCents < 0n ? -totalCents : totalCents;
  const tenths = (toCents(part) * 1000n) / absTotal;
  const negative = tenths < 0n;
  const abs = negative ? -tenths : tenths;
  return `${negative ? '-' : ''}${abs / 10n}.${abs % 10n}`;
}

export type ActiveDaySummary = {
  /** Dias com lançamento na competência. */
  readonly days: number;
  /** Média por dia com lançamento, em decimal-string. */
  readonly average: string;
};

/**
 * Resume os dias que efetivamente tiveram lançamento na competência.
 * Dias zerados ficam fora da média; `null` quando não há nenhum dia com valor.
 */
export function summarizeActiveDays(points: readonly DailyPoint[]): ActiveDaySummary | null {
  let sum = 0n;
  let days = 0n;
  for (const point of points) {
    const cents = toCents(point.amount);
    if (cents !== 0n) {
      sum += cents;
      days += 1n;
    }
  }
  if (days === 0n) {
    return null;
  }
  return { days: Number(days), average: fromCents(sum / days) };
}

/**
 * Razão 0–1 entre duas decimal-strings, dividida em centavos (bigint).
 * Serve apenas a microvisualizações; não substitui os percentuais do backend.
 */
export function decimalRatio(part: string, whole: string): number {
  const wholeCents = toCents(whole);
  if (wholeCents === 0n) {
    return 0;
  }
  const permyriad = (toCents(part) * 10_000n) / wholeCents;
  const ratio = Number(permyriad) / 10_000;
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Variação percentual entre duas decimal-strings (×100, 1 casa), dividida em centavos (bigint).
 * `null` quando a base é zero — não existe variação a declarar.
 * O retorno usa o mesmo contrato visual de `formatDelinquencyRate`.
 */
export function percentChangeRate(current: string, previous: string): string | null {
  const base = toCents(previous);
  if (base === 0n) {
    return null;
  }
  const absBase = base < 0n ? -base : base;
  const tenths = ((toCents(current) - base) * 1000n) / absBase;
  const negative = tenths < 0n;
  const abs = negative ? -tenths : tenths;
  return `${negative ? '-' : ''}${abs / 10n}.${abs % 10n}`;
}

export function maxAbs(values: readonly number[]): number {
  let max = 0;
  for (const value of values) {
    const abs = Math.abs(value);
    if (Number.isFinite(abs) && abs > max) {
      max = abs;
    }
  }
  return max;
}

export function amountValues(points: readonly DailyPoint[]): readonly number[] {
  return points.map((point) => parseAmount(point.amount));
}

/** Série vazia ou integralmente zerada — habilita o estado vazio dos gráficos. */
export function isFlatSeries(points: readonly DailyPoint[]): boolean {
  return points.length === 0 || points.every((point) => toCents(point.amount) === 0n);
}

/**
 * Une duas séries diárias pela data, preenchendo dias ausentes com zero.
 * Mantém ambas com o mesmo comprimento para comparação no mesmo eixo.
 */
export function alignDailySeries(
  first: readonly DailyPoint[],
  second: readonly DailyPoint[],
): {
  readonly dates: readonly string[];
  readonly first: readonly DailyPoint[];
  readonly second: readonly DailyPoint[];
} {
  const byDateFirst = new Map(first.map((point) => [point.date, point.amount] as const));
  const byDateSecond = new Map(second.map((point) => [point.date, point.amount] as const));
  const dates = [...new Set([...byDateFirst.keys(), ...byDateSecond.keys()])].sort();

  return {
    dates,
    first: dates.map((date) => ({ date, amount: byDateFirst.get(date) ?? '0.00' })),
    second: dates.map((date) => ({ date, amount: byDateSecond.get(date) ?? '0.00' })),
  };
}

/**
 * Linha de zero do eixo vertical.
 * Escala assinada põe o zero no meio; a padrão apoia a área na base do desenho.
 */
export function svgBaselineY(options: SvgScaleOptions): number {
  const { height, padding = 0, signed = false } = options;
  if (!signed) {
    return height;
  }
  const usable = Math.max(height - padding * 2, 1);
  return roundCoordinate(padding + usable / 2);
}

/** Coordenadas SVG a partir dos valores; `max` compartilhado alinha séries no mesmo eixo. */
export function buildSvgPoints(
  values: readonly number[],
  options: SvgScaleOptions,
): readonly SvgPoint[] {
  const { width, height, padding = 0, max, signed = false } = options;
  const scaleMax = max ?? maxAbs(values);
  const usable = Math.max(height - padding * 2, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const span = signed ? usable / 2 : usable;
  const zeroY = signed ? padding + usable / 2 : padding + usable;
  const lowerBound = signed ? -1 : 0;

  return values.map((value, index) => {
    const ratio = scaleMax > 0 ? Math.min(Math.max(value / scaleMax, lowerBound), 1) : 0;
    const x = values.length > 1 ? index * step : width / 2;
    return {
      index,
      x: roundCoordinate(x),
      y: roundCoordinate(zeroY - ratio * span),
    };
  });
}

export function toPolyline(points: readonly SvgPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function toAreaPath(points: readonly SvgPoint[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return '';
  }
  const segments = points.map((point) => `L ${point.x} ${point.y}`).join(' ');
  return `M ${first.x} ${baselineY} ${segments} L ${last.x} ${baselineY} Z`;
}

/** Índice do ponto mais próximo a partir da posição relativa do ponteiro (0–1). */
export function indexFromRatio(ratio: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.min(count - 1, Math.max(0, Math.round(clamped * (count - 1))));
}

/** Rótulo curto de eixo (não substitui `formatMoneyBrl` na exibição de valores). */
export function formatCompactBrl(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}R$\u00a0${formatDecimalPt(abs / 1_000_000, 1)}\u00a0mi`;
  }
  if (abs >= 1_000) {
    return `${sign}R$\u00a0${formatDecimalPt(abs / 1_000, 1)}\u00a0mil`;
  }
  return `${sign}R$\u00a0${formatDecimalPt(abs, 0)}`;
}
