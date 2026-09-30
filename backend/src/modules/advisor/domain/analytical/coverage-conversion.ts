/**
 * Coverage: legado percentual (0–100 string/Decimal) ↔ canônico ratio (0–1).
 * Roundtrip deve preservar o literal percentual publicado quando possível.
 */

const HUNDRED = 100;

export function legacyPercentToCanonicalRatio(
  percent: string | number | null | undefined,
): number | null {
  if (percent === null || percent === undefined) {
    return null;
  }
  if (typeof percent === 'string') {
    const trimmed = percent.trim();
    if (
      trimmed === '' ||
      trimmed === 'ABSENT' ||
      trimmed === 'NOT_APPLICABLE' ||
      trimmed === 'UNAVAILABLE'
    ) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return clampRatio(parsed / HUNDRED);
  }
  if (!Number.isFinite(percent)) {
    return null;
  }
  return clampRatio(percent / HUNDRED);
}

export function canonicalRatioToLegacyPercentString(ratio: number | null): string | null {
  if (ratio === null) {
    return null;
  }
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error('canonical coverage ratio inválido.');
  }
  // Evita artefatos binários (ex.: 0.9489 * 100).
  const asPercent = Number((ratio * HUNDRED).toPrecision(15));
  return String(asPercent);
}

/**
 * Roundtrip do literal percentual legado → ratio → string.
 * Preferência: se o parse for estável, devolve o mesmo literal de entrada.
 */
export function roundtripLegacyCoveragePercent(percentLiteral: string): string | null {
  const ratio = legacyPercentToCanonicalRatio(percentLiteral);
  if (ratio === null) {
    return null;
  }
  const back = canonicalRatioToLegacyPercentString(ratio);
  if (back === null) {
    return null;
  }
  if (Number(percentLiteral) === Number(back)) {
    return percentLiteral;
  }
  return back;
}

function clampRatio(value: number): number {
  if (value < 0 || value > 1) {
    throw new Error(`coverage ratio fora de [0,1]: ${value}`);
  }
  return value;
}
