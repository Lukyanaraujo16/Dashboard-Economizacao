import type { DashboardCashRealizedDetailItem } from '../../services/dashboard/cash-realized-details.types';

const SCALE = 4n;

export const CASH_COUNTERPARTY_FALLBACK = 'Sem contraparte identificada';

function parseScaled(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const padded = frac.padEnd(Number(SCALE), '0').slice(0, Number(SCALE));
  const scaled = BigInt(whole || '0') * 10n ** SCALE + BigInt(padded || '0');
  return negative ? -scaled : scaled;
}

function formatScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 10n ** SCALE;
  const frac = (abs % 10n ** SCALE).toString().padStart(Number(SCALE), '0');
  const body = `${whole}.${frac}`.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return negative ? `-${body}` : body === '' ? '0' : body;
}

/** Soma attributedAmount sem Number — escala fixa para reconciliação visual. */
export function sumAttributedAmounts(values: readonly string[]): string {
  const total = values.reduce((acc, value) => acc + parseScaled(value), 0n);
  return formatScaled(total);
}

export function resolveCounterpartyGroupLabel(
  item: Pick<DashboardCashRealizedDetailItem, 'partyName' | 'description'>,
): string {
  const party = item.partyName?.trim() ?? '';
  if (party !== '') {
    return party;
  }
  const description = item.description?.trim() ?? '';
  if (description !== '') {
    return description;
  }
  return CASH_COUNTERPARTY_FALLBACK;
}

export type CashCounterpartyGroup = {
  readonly label: string;
  readonly attributedAmount: string;
  readonly items: readonly DashboardCashRealizedDetailItem[];
};

/**
 * Agrupa lançamentos por contraparte (party → description → fallback).
 * Ordem estável: maior attributedAmount, depois label pt-BR.
 */
export function groupCashRealizedDetailsByCounterparty(
  items: readonly DashboardCashRealizedDetailItem[],
): readonly CashCounterpartyGroup[] {
  const buckets = new Map<string, DashboardCashRealizedDetailItem[]>();
  for (const item of items) {
    const label = resolveCounterpartyGroupLabel(item);
    const current = buckets.get(label);
    if (current) {
      current.push(item);
    } else {
      buckets.set(label, [item]);
    }
  }

  return [...buckets.entries()]
    .map(([label, groupItems]) => ({
      label,
      attributedAmount: sumAttributedAmounts(groupItems.map((row) => row.attributedAmount)),
      items: [...groupItems].sort((left, right) => {
        const byDate = left.occurredOn.localeCompare(right.occurredOn);
        if (byDate !== 0) {
          return byDate;
        }
        return left.settlementExternalId.localeCompare(right.settlementExternalId);
      }),
    }))
    .sort((left, right) => {
      const byAmount = parseScaled(right.attributedAmount) - parseScaled(left.attributedAmount);
      if (byAmount !== 0n) {
        return byAmount > 0n ? 1 : -1;
      }
      return left.label.localeCompare(right.label, 'pt-BR');
    });
}

export function mergeCashRealizedDetailPages(
  existing: readonly DashboardCashRealizedDetailItem[],
  incoming: readonly DashboardCashRealizedDetailItem[],
): readonly DashboardCashRealizedDetailItem[] {
  const seen = new Set(existing.map((item) => item.settlementExternalId));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.settlementExternalId)) {
      continue;
    }
    seen.add(item.settlementExternalId);
    merged.push(item);
  }
  return merged;
}

export function cashRealizedDetailsCacheKey(input: {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly direction: string;
  readonly categoryKind: string;
  readonly categoryKey: string;
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
}): string {
  return [
    input.tenantId,
    input.monthKey,
    input.direction,
    input.categoryKind,
    input.categoryKey,
    input.costCenterId ?? '',
    input.categoryId ?? '',
  ].join('|');
}
