/**
 * Formatação visual de decimal-string do backend.
 * Não altera o valor de domínio; não soma; não usa Number para estado.
 */

const MONEY_SCALE = 2n;
const PERCENT_SCALE = 1n;

function parseUnsignedDecimal(value: string): { readonly whole: bigint; readonly frac: string } {
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('decimal inválido');
  }
  const unsigned = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ''] = unsigned.split('.');
  return { whole: BigInt(wholeRaw ?? '0'), frac: fracRaw };
}

function roundToScale(
  value: string,
  scale: bigint,
): { readonly negative: boolean; readonly scaled: bigint } {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-') && !/^-?0+(\.0+)?$/.test(trimmed);
  const { whole, frac } = parseUnsignedDecimal(trimmed);
  const scaleNumber = Number(scale);
  const padded = frac.padEnd(scaleNumber + 1, '0');
  const keep = padded.slice(0, scaleNumber);
  const next = padded.slice(scaleNumber, scaleNumber + 1);
  let scaled = whole * 10n ** scale + BigInt(keep || '0');
  if (next !== '' && Number(next) >= 5) {
    scaled += 1n;
  }
  return { negative, scaled };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatScaled(
  value: string,
  scale: bigint,
): { readonly negative: boolean; readonly int: string; readonly frac: string } {
  const { negative, scaled } = roundToScale(value, scale);
  const factor = 10n ** scale;
  const abs = scaled < 0n ? -scaled : scaled;
  const intPart = abs / factor;
  const fracPart = abs % factor;
  return {
    negative,
    int: intPart.toString(),
    frac: fracPart.toString().padStart(Number(scale), '0'),
  };
}

export function isDecimalZero(value: string): boolean {
  return /^-?0+(\.0+)?$/.test(value.trim());
}

/** Apresentação BRL (2 casas). Fonte permanece string no estado. */
export function formatMoneyBrl(decimalString: string): string {
  const { negative, int, frac } = formatScaled(decimalString, MONEY_SCALE);
  const sign = negative ? '-' : '';
  return `${sign}R$\u00a0${groupThousands(int)},${frac}`;
}

/**
 * Taxa já vem × 100 do backend.
 * null → "—"; zero exato → "0%"; demais → 1 casa decimal pt-BR.
 */
export function formatDelinquencyRate(rate: string | null): string {
  if (rate === null) {
    return '—';
  }
  if (isDecimalZero(rate)) {
    return '0%';
  }
  const { negative, int, frac } = formatScaled(rate, PERCENT_SCALE);
  const sign = negative ? '-' : '';
  return `${sign}${groupThousands(int)},${frac}%`;
}
