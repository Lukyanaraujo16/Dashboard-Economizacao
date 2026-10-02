import { describe, expect, it } from 'vitest';

import {
  failureProgressSummary,
  primarySyncCountSummary,
  summarizeAiPage,
  syncCountDetails,
  syncErrorLabel,
} from '../src/components/operations/operations-display';

describe('apresentação operacional', () => {
  it('resume contagens principais e guarda o restante nos detalhes', () => {
    const counts = {
      receivables: 86,
      payables: 115,
      categories: 86,
      costCenters: 6,
      ledgerFetched: 100,
      installmentPresenceWouldTombstone: 2,
    };
    expect(primarySyncCountSummary(counts)).toBe(
      'Recebimentos 86 · Pagamentos 115 · Categorias 86 · Centros de custo 6 · Lançamentos 100',
    );
    expect(primarySyncCountSummary(counts)).not.toContain('installmentPresenceWouldTombstone');
    const details = syncCountDetails(counts);
    expect(details.find((item) => item.key === 'installmentPresenceWouldTombstone')).toMatchObject({
      label: 'Parcelas que seriam removidas',
      value: 2,
    });
  });

  it('traduz falhas e descreve o ponto registrado', () => {
    expect(syncErrorLabel('sync_upstream_unavailable')).toBe('Serviço de origem indisponível');
    expect(syncErrorLabel('sync_disconnected')).toBe('Empresa desconectada');
    expect(syncErrorLabel('sync_upstream_unavailable')).not.toBe('sync_upstream_unavailable');
    expect(failureProgressSummary(null)).toContain('antes de registrar contagens');
    expect(failureProgressSummary({ payables: 4 })).toContain('Pagamentos 4');
  });

  it('resume a página de execuções sem estimar custo', () => {
    const summary = summarizeAiPage([
      { status: 'SUCCEEDED', durationMs: 100 },
      { status: 'FAILED', durationMs: 300 },
      { status: 'TIMEOUT', durationMs: null },
      { status: 'LIMIT_BLOCKED', durationMs: 200 },
    ]);
    expect(summary).toEqual({
      total: 4,
      succeeded: 1,
      failed: 2,
      averageDurationMs: 200,
    });
  });
});
