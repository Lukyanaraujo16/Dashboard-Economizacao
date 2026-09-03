/** Bucket genérico entrada/saída/líquido — escala visual (não contrato de API). */
export type InflowOutflowBucket = {
  readonly inflows: string;
  readonly outflows: string;
  readonly net: string;
};

const MONTHS_PT = [
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

const VISUAL_SCALE = 4n;

/** YYYY-MM → ago/2026. Não altera o bucket no estado. */
export function formatMonthKeyPtBr(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return key;
  }
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return key;
  }
  return `${MONTHS_PT[monthIndex]}/${match[1]}`;
}

/**
 * Magnitude absoluta em inteiro de escala fixa — só para altura da barra.
 * Não substitui `net` do backend nem formata BRL.
 */
export function decimalAbsScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 0n;
  }
  const unsigned = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ''] = unsigned.split('.');
  const frac = fracRaw.padEnd(Number(VISUAL_SCALE), '0').slice(0, Number(VISUAL_SCALE));
  return BigInt(wholeRaw ?? '0') * 10n ** VISUAL_SCALE + BigInt(frac || '0');
}

export function maxInflowOutflowScale(buckets: readonly InflowOutflowBucket[]): bigint {
  let max = 0n;
  for (const bucket of buckets) {
    const inflow = decimalAbsScaled(bucket.inflows);
    const outflow = decimalAbsScaled(bucket.outflows);
    if (inflow > max) {
      max = inflow;
    }
    if (outflow > max) {
      max = outflow;
    }
  }
  return max;
}

/** Percentual 0–100 para CSS. `Number` só no percentual, nunca no valor exibido. */
export function visualBarPercent(value: string, maxAbs: bigint): number {
  if (maxAbs === 0n) {
    return 0;
  }
  const pct = (decimalAbsScaled(value) * 100n) / maxAbs;
  const asNumber = Number(pct);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    return 0;
  }
  return asNumber > 100 ? 100 : asNumber;
}

export function allForecastBucketsZero(buckets: readonly InflowOutflowBucket[]): boolean {
  return buckets.every(
    (bucket) =>
      decimalAbsScaled(bucket.inflows) === 0n &&
      decimalAbsScaled(bucket.outflows) === 0n &&
      decimalAbsScaled(bucket.net) === 0n,
  );
}
