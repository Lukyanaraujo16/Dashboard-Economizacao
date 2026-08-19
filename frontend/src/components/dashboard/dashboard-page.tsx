'use client';

import { useCallback, useEffect, useState } from 'react';

import { isPlatformRole, useAuth } from '../../auth';
import { getDashboardOverview } from '../../services/dashboard/overview';
import {
  DashboardOverviewRequestError,
  type DashboardOverviewResponse,
} from '../../services/dashboard/overview.types';
import { ChartCard, FinancialGrid, FinancialSection, KpiCard, StateWrapper } from '../financial';
import { Badge, Typography } from '../ui';
import { DashboardHero } from './dashboard-hero';
import {
  formatSyncTimestamp,
  hasOperationalDashboardTenant,
  isNeverSynced,
  shouldSkipOverviewFetch,
  toDashboardKpis,
} from './dashboard-overview-view';
import styles from './dashboard-page.module.css';

const KPI_TITLES = [
  'Contas a receber',
  'Contas a pagar',
  'Recebíveis vencidos',
  'Inadimplência',
] as const;

type OverviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'never-sync' }
  | { readonly kind: 'ready'; readonly data: DashboardOverviewResponse };

function heroSupportText(view: OverviewView): string {
  if (view.kind === 'never-sync') {
    return 'Os indicadores financeiros serão exibidos assim que os dados da sua empresa forem sincronizados.';
  }
  if (view.kind === 'forbidden') {
    return 'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.';
  }
  if (view.kind === 'error') {
    return 'Não foi possível carregar os indicadores da sua empresa.';
  }
  if (view.kind === 'ready') {
    return 'Acompanhe os principais indicadores financeiros da sua empresa.';
  }
  return 'Acompanhe os principais indicadores financeiros da sua empresa.';
}

/**
 * Dashboard da empresa cliente — KPIs do Grupo A via GET /dashboard/overview (10B).
 */
export function DashboardPage() {
  const { user, support, status } = useAuth();
  const [view, setView] = useState<OverviewView>({ kind: 'loading' });

  const loadOverview = useCallback(
    async (signal: AbortSignal) => {
      if (shouldSkipOverviewFetch(user, support)) {
        setView({ kind: 'forbidden' });
        return;
      }
      if (!hasOperationalDashboardTenant(user, support)) {
        setView({ kind: 'forbidden' });
        return;
      }

      setView({ kind: 'loading' });
      try {
        const data = await getDashboardOverview();
        if (signal.aborted) {
          return;
        }
        setView(isNeverSynced(data) ? { kind: 'never-sync' } : { kind: 'ready', data });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        if (error instanceof DashboardOverviewRequestError && error.kind === 'forbidden') {
          setView({ kind: 'forbidden' });
          return;
        }
        const message =
          error instanceof DashboardOverviewRequestError
            ? error.message
            : 'Não foi possível carregar os indicadores da sua empresa.';
        setView({ kind: 'error', message });
      }
    },
    [support, user],
  );

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview, status]);

  const displayName = user?.name?.trim() || 'bem-vindo';
  const kpis = view.kind === 'ready' ? toDashboardKpis(view.data) : null;
  const freshness =
    view.kind === 'ready' ? formatSyncTimestamp(view.data.integration.lastSuccessfulSyncAt) : null;
  const integrationStatus = view.kind === 'ready' ? view.data.integration.status : null;

  return (
    <div className={styles.root} data-dashboard-page="true" data-overview-state={view.kind}>
      <DashboardHero displayName={displayName} supportText={heroSupportText(view)} />

      <FinancialSection
        id="resumo-financeiro"
        title="Resumo Financeiro"
        subtitle="Indicadores principais da sua empresa."
      >
        {freshness ? (
          <Typography as="p" variant="caption" className={styles.freshness}>
            Última sincronização: {freshness}
          </Typography>
        ) : null}

        {integrationStatus === 'DISCONNECTED' ? (
          <p className={styles.notice} role="status">
            <Badge variant="warning">Desconectada</Badge>
            <span>Integração desconectada. Exibindo os últimos dados sincronizados.</span>
          </p>
        ) : null}

        {integrationStatus === 'ERROR' ? (
          <p className={styles.notice} role="status">
            <Badge variant="danger">Atenção</Badge>
            <span>
              Não foi possível atualizar a integração. Exibindo os últimos dados sincronizados.
            </span>
          </p>
        ) : null}

        {view.kind === 'loading' ? (
          <FinancialGrid>
            {KPI_TITLES.map((title) => (
              <KpiCard
                key={title}
                title={title}
                state="loading"
                loadingLabel="Carregando indicadores"
              />
            ))}
          </FinancialGrid>
        ) : null}

        {view.kind === 'never-sync' ? (
          <FinancialGrid>
            {KPI_TITLES.map((title) => (
              <KpiCard
                key={title}
                title={title}
                state="empty"
                emptyMessage="Aguardando a primeira sincronização"
              />
            ))}
          </FinancialGrid>
        ) : null}

        {view.kind === 'ready' && kpis ? (
          <FinancialGrid>
            {kpis.map((card) => (
              <KpiCard
                key={card.id}
                title={card.title}
                state="ready"
                value={card.value}
                meta={card.meta}
              />
            ))}
          </FinancialGrid>
        ) : null}

        {view.kind === 'error' ? (
          <StateWrapper
            state="error"
            errorMessage={view.message}
            onRetry={() => {
              void loadOverview(new AbortController().signal);
            }}
            align="start"
          />
        ) : null}

        {view.kind === 'forbidden' ? (
          <Typography as="p" variant="body" className={styles.forbidden}>
            {user && isPlatformRole(user.role)
              ? 'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.'
              : 'Não há empresa associada a esta sessão para visualizar os indicadores.'}
          </Typography>
        ) : null}
      </FinancialSection>

      <FinancialSection
        id="fluxo-de-caixa"
        title="Fluxo de Caixa"
        subtitle="Evolução prevista do caixa."
      >
        <ChartCard
          state="empty"
          size="chart"
          icon="chart"
          emptyMessage="O fluxo previsto entra em uma próxima etapa."
        />
      </FinancialSection>

      <FinancialSection
        id="movimentacoes-recentes"
        title="Movimentações Recentes"
        subtitle="Últimas entradas e saídas registradas."
      >
        <ChartCard
          state="empty"
          size="list"
          icon="list"
          emptyMessage="Nenhuma movimentação disponível nesta etapa."
        />
      </FinancialSection>

      <FinancialSection
        id="alertas"
        title="Alertas"
        subtitle="Sinais operacionais que merecem atenção."
      >
        <ChartCard
          state="empty"
          size="default"
          icon="alert"
          emptyMessage="Nenhum alerta disponível nesta etapa."
        />
      </FinancialSection>
    </div>
  );
}
