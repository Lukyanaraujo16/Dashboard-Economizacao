import { describe, expect, it } from 'vitest';

import { toDashboardKpis } from '../src/components/dashboard/dashboard-overview-view';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';

function overview(
  partial: Partial<DashboardOverviewResponse> &
    Pick<DashboardOverviewResponse, 'delinquency' | 'receivables'>,
): DashboardOverviewResponse {
  return {
    today: '2026-08-19',
    payables: { open: '0', overdue: '0', upcoming: '0' },
    integration: {
      status: 'CONNECTED',
      lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
      lastErrorCode: null,
    },
    ...partial,
  };
}

describe('toDashboardKpis', () => {
  it('mapeia open/overdue/rate sem somar', () => {
    const cards = toDashboardKpis(
      overview({
        receivables: { open: '8', overdue: '3', upcoming: '5' },
        payables: { open: '20', overdue: '4', upcoming: '16' },
        delinquency: { overdueUnpaid: '3', openUnpaid: '8', rate: '37.5' },
      }),
    );
    expect(cards.map((card) => card.title)).toEqual([
      'Contas a receber',
      'Contas a pagar',
      'Recebíveis vencidos',
      'Inadimplência',
    ]);
    expect(cards[0]?.value).toBe('R$\u00a08,00');
    expect(cards[1]?.value).toBe('R$\u00a020,00');
    expect(cards[2]?.value).toBe('R$\u00a03,00');
    expect(cards[3]?.value).toBe('37,5%');
    expect(cards[3]?.meta).toContain('R$\u00a03,00 vencido de R$\u00a08,00 em aberto');
  });

  it('rate null vira travessão e não 0%', () => {
    const cards = toDashboardKpis(
      overview({
        receivables: { open: '0', overdue: '0', upcoming: '0' },
        delinquency: { overdueUnpaid: '0', openUnpaid: '0', rate: null },
      }),
    );
    expect(cards[3]?.value).toBe('—');
    expect(cards[3]?.meta).toBe('Sem valores em aberto.');
    expect(cards[3]?.value).not.toBe('0%');
  });

  it('rate zero exato vira 0%', () => {
    const cards = toDashboardKpis(
      overview({
        receivables: { open: '10', overdue: '0', upcoming: '10' },
        delinquency: { overdueUnpaid: '0', openUnpaid: '10', rate: '0' },
      }),
    );
    expect(cards[3]?.value).toBe('0%');
  });
});
