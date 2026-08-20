const SCALE = 2n;

function parseScaled(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const padded = frac.padEnd(Number(SCALE) + 1, '0').slice(0, Number(SCALE));
  const scaled = BigInt(whole) * 10n ** SCALE + BigInt(padded || '0');
  return negative ? -scaled : scaled;
}

function formatScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 10n ** SCALE;
  const frac = (abs % 10n ** SCALE).toString().padStart(Number(SCALE), '0');
  const body = `${whole}.${frac}`;
  return negative ? `-${body}` : body;
}

export type CategoryCompositionItem = {
  readonly kind: string;
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
};

export type CategoryDonutSlice = {
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
  readonly kind: string;
};

const OTHERS_LABEL = 'Outras';

/** Top N categorias nominais; restante agregado em Outras (soma exata dos amounts/percentages do backend). */
export function presentTopCategoryDonutSlices(
  items: readonly CategoryCompositionItem[],
  maxNamed = 5,
): readonly CategoryDonutSlice[] {
  if (items.length === 0) {
    return [];
  }
  const sorted = [...items].sort((left, right) => {
    const diff = parseScaled(right.amount) - parseScaled(left.amount);
    if (diff === 0n) {
      return left.name.localeCompare(right.name, 'pt-BR');
    }
    return diff > 0n ? 1 : -1;
  });
  if (sorted.length <= maxNamed) {
    return sorted.map((item) => ({
      name: item.name,
      amount: item.amount,
      percentage: item.percentage,
      kind: item.kind,
    }));
  }
  const top = sorted.slice(0, maxNamed);
  const rest = sorted.slice(maxNamed);
  const othersAmount = rest.reduce((sum, item) => sum + parseScaled(item.amount), 0n);
  const othersPercentage = rest.reduce((sum, item) => sum + parseScaled(item.percentage), 0n);
  return [
    ...top.map((item) => ({
      name: item.name,
      amount: item.amount,
      percentage: item.percentage,
      kind: item.kind,
    })),
    {
      name: OTHERS_LABEL,
      amount: formatScaled(othersAmount),
      percentage: formatScaled(othersPercentage),
      kind: 'other',
    },
  ];
}

export function donutSlicePercentages(slices: readonly CategoryDonutSlice[]): readonly number[] {
  const scaled = slices.map((slice) => Number.parseFloat(slice.percentage));
  const total = scaled.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return slices.map(() => 0);
  }
  return scaled.map((value) => (value / total) * 100);
}

/**
 * Paleta categórica derivada apenas das séries financeiras protegidas — o
 * branding do tenant não desloca as cores das fatias. As posições ímpares
 * alternam entre matizes opostos e as misturas usam `oklch` para percorrer o
 * círculo de matiz, mantendo fatias vizinhas distinguíveis nos dois temas.
 * A ordem é de apresentação e não carrega juízo sobre a categoria.
 */
export const CATEGORY_DONUT_COLORS = [
  'var(--color-series-receivable)',
  'var(--color-series-expense)',
  'var(--color-series-result)',
  'var(--color-series-revenue)',
  'color-mix(in oklch, var(--color-series-expense) 55%, var(--color-series-result))',
  'color-mix(in oklch, var(--color-series-revenue) 55%, var(--color-series-receivable))',
  'var(--color-series-received)',
  'color-mix(in oklch, var(--color-series-expense) 62%, var(--color-series-revenue))',
  'color-mix(in oklch, var(--color-series-result) 58%, var(--color-series-received))',
  'color-mix(in oklch, var(--color-series-receivable) 55%, var(--color-series-result))',
] as const;

/**
 * Índice da fatia que cobre o percentual informado (0–100), na mesma ordem do
 * gradiente cônico. Fora do intervalo das fatias retorna -1.
 */
export function sliceIndexAtPercent(percents: readonly number[], percent: number): number {
  if (percent < 0) {
    return -1;
  }
  let cursor = 0;
  for (let index = 0; index < percents.length; index += 1) {
    cursor += percents[index] ?? 0;
    if (percent < cursor) {
      return index;
    }
  }
  return percents.length > 0 && percent <= cursor ? percents.length - 1 : -1;
}
