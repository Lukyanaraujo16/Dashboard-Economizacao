import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { OperationsExecutive } from '../src/components/operations/operations-executive';
import type { OperationsOverview } from '../src/services/admin/operations';

afterEach(() => {
  cleanup();
});

function overview(alerts: OperationsOverview['alerts']): OperationsOverview {
  return {
    referenceMonthKey: '2026-10',
    windows: { syncFreshnessHours: 24, recentDays: 7 },
    kpis: {
      companies: { total: 2 },
      integrations: { connected: 1, total: 2, withError: 1 },
      synchronization: { syncedCompaniesLast24Hours: 0, failuresLast7Days: 1 },
      ai: { runsLast7Days: 4, errorsLast7Days: 0 },
      audit: { changesLast7Days: 0 },
    },
    companies: {
      data: [
        {
          tenantId: '11111111-1111-4111-8111-111111111111',
          tenantDisplayName: 'Empresa Alfa',
          tenantStatus: 'ACTIVE',
          integrationState: 'ERROR',
          referenceMonthKey: '2026-10',
          integration: {
            id: '22222222-2222-4222-8222-222222222222',
            status: 'ERROR',
            lastSuccessfulSyncAt: null,
            lastErrorAt: '2026-10-01T12:00:00.000Z',
            lastErrorCode: 'sync_upstream_unavailable',
            currentRun: null,
          },
          financials: {
            billing: null,
            result: null,
            receivables: '0',
            payables: '10.50',
            overdueReceivables: null,
            overduePayables: '0',
          },
        },
        {
          tenantId: '33333333-3333-4333-8333-333333333333',
          tenantDisplayName: 'Empresa Beta',
          tenantStatus: 'ACTIVE',
          integrationState: 'DISCONNECTED',
          referenceMonthKey: '2026-10',
          integration: null,
          financials: {
            billing: '0',
            result: '0',
            receivables: '0',
            payables: '0',
            overdueReceivables: '0',
            overduePayables: '0',
          },
        },
      ],
      pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
    },
    alerts,
  };
}

const emptyAlerts: OperationsOverview['alerts'] = { failures: [], aiErrors: [], audit: [] };

describe('visão executiva da operação', () => {
  it('mostra fatos financeiros sem tratar ausência como zero', () => {
    render(
      <OperationsExecutive
        overview={overview(emptyAlerts)}
        formatWhen={() => '01/10/2026, 09:00'}
        labelOf={(value) => value}
      />,
    );

    const companies = screen.getByTestId('operations-companies').textContent ?? '';
    expect(companies).toContain('Empresa Alfa');
    expect(companies).toContain('Erro na integração');
    expect(companies).toContain('Empresa Beta');
    expect(companies).toContain('Desconectada');
    expect(companies).toContain('—');
    expect(companies).toContain('0,00');
    expect(companies).toContain('10,50');
    expect(screen.getByText('1 com erro')).toBeTruthy();
    expect(screen.getByTestId('operations-activity').textContent).toContain('Nenhuma atividade nesse período.');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lista atividade recente quando há eventos', () => {
    render(
      <OperationsExecutive
        overview={overview({
          failures: [
            {
              id: 'run-1',
              tenantId: '11111111-1111-4111-8111-111111111111',
              tenantDisplayName: 'Empresa Alfa',
              integrationId: '22222222-2222-4222-8222-222222222222',
              status: 'FAILED',
              triggerType: 'SCHEDULED',
              startedAt: '2026-10-02T15:00:00.000Z',
              finishedAt: null,
              durationMs: 1000,
              heartbeatAt: null,
              errorCode: 'sync_disconnected',
              counts: null,
            },
          ],
          aiErrors: [],
          audit: [],
        })}
        formatWhen={() => '02/10/2026, 12:00'}
        labelOf={(value) => value}
      />,
    );

    const activity = screen.getByTestId('operations-activity').textContent ?? '';
    expect(activity).toContain('Falha de sincronização');
    expect(activity).toContain('Empresa Alfa');
    expect(activity).toContain('Empresa desconectada');
    expect(activity).not.toContain('Nenhuma atividade nesse período.');
  });
});
