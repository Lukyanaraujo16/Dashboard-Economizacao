import { describe, expect, it } from 'vitest';

import type { DashboardCashRealizedDetailItem } from '../src/services/dashboard/cash-realized-details.types';
import {
  CASH_COUNTERPARTY_FALLBACK,
  groupCashRealizedDetailsByCounterparty,
  mergeCashRealizedDetailPages,
  resolveCounterpartyGroupLabel,
  sumAttributedAmounts,
} from '../src/components/dashboard/cash-realized-details-view';

function item(
  overrides: Partial<DashboardCashRealizedDetailItem> &
    Pick<DashboardCashRealizedDetailItem, 'settlementExternalId' | 'attributedAmount'>,
): DashboardCashRealizedDetailItem {
  return {
    installmentExternalId: 'ar-1',
    installmentKind: 'RECEIVABLE',
    occurredOn: '2026-08-05',
    netAmount: overrides.attributedAmount,
    description: null,
    partyName: null,
    categoryNames: ['Serviços'],
    categoryExternalIds: ['cat'],
    categoryKey: 'cat',
    categoryKind: 'category',
    categoryName: 'Serviços',
    ...overrides,
  };
}

describe('cash-realized-details-view (12-C)', () => {
  it('agrupa por partyName e soma attributedAmount', () => {
    const groups = groupCashRealizedDetailsByCounterparty([
      item({
        settlementExternalId: 's1',
        partyName: 'Cliente A',
        attributedAmount: '10.50',
        netAmount: '100',
      }),
      item({
        settlementExternalId: 's2',
        partyName: 'Cliente A',
        attributedAmount: '5.25',
        occurredOn: '2026-08-06',
      }),
      item({
        settlementExternalId: 's3',
        partyName: 'Cliente B',
        attributedAmount: '20',
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe('Cliente B');
    expect(groups[0]?.attributedAmount).toBe('20');
    expect(groups[1]?.label).toBe('Cliente A');
    expect(groups[1]?.attributedAmount).toBe('15.75');
    expect(groups[1]?.items).toHaveLength(2);
  });

  it('fallback description e neutro', () => {
    expect(
      resolveCounterpartyGroupLabel({ partyName: null, description: '  Venda 1  ' }),
    ).toBe('Venda 1');
    expect(resolveCounterpartyGroupLabel({ partyName: '  ', description: null })).toBe(
      CASH_COUNTERPARTY_FALLBACK,
    );
  });

  it('merge deduplica settlementExternalId', () => {
    const merged = mergeCashRealizedDetailPages(
      [item({ settlementExternalId: 's1', attributedAmount: '1' })],
      [
        item({ settlementExternalId: 's1', attributedAmount: '1' }),
        item({ settlementExternalId: 's2', attributedAmount: '2' }),
      ],
    );
    expect(merged.map((row) => row.settlementExternalId)).toEqual(['s1', 's2']);
  });

  it('sumAttributedAmounts reconcilia grupos', () => {
    expect(sumAttributedAmounts(['10.10', '20.20', '0.70'])).toBe('31');
  });
});
