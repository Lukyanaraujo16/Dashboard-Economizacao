'use client';

import { useAuth } from '../../auth';
import { ChartCard, FinancialGrid, FinancialSection, KpiCard } from '../financial';
import { Divider, Typography } from '../ui';
import { DashboardHero } from './dashboard-hero';
import styles from './dashboard-page.module.css';

const SUMMARY_CARDS = [
  { id: 'receita', title: 'Receita' },
  { id: 'despesas', title: 'Despesas' },
  { id: 'saldo', title: 'Saldo' },
  { id: 'resultado', title: 'Resultado' },
] as const;

/**
 * Tela inicial — estrutura definitiva (1.2A) com componentes financeiros (1.2B).
 * Empty state completo; sem dados, gráficos reais ou integrações.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const displayName = user?.name?.trim() || 'bem-vindo';

  return (
    <div className={styles.root} data-dashboard-page="true">
      <DashboardHero displayName={displayName} />

      <FinancialSection
        id="resumo-financeiro"
        title="Resumo Financeiro"
        subtitle="Indicadores principais da operação."
      >
        <FinancialGrid>
          {SUMMARY_CARDS.map((card) => (
            <KpiCard key={card.id} title={card.title} state="empty" />
          ))}
        </FinancialGrid>
      </FinancialSection>

      <FinancialSection
        id="fluxo-de-caixa"
        title="Fluxo de Caixa"
        subtitle="Evolução do caixa no período selecionado."
      >
        <ChartCard
          state="empty"
          size="chart"
          icon="chart"
          emptyMessage="O gráfico de fluxo de caixa ficará disponível após a sincronização."
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
          emptyMessage="Nenhuma movimentação disponível."
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
          emptyMessage="Nenhum alerta disponível."
        />
      </FinancialSection>

      <footer className={styles.footer}>
        <Divider className={styles.footerDivider} />
        <Typography variant="caption" className={styles.footerCopy}>
          Dados financeiros serão exibidos somente após integração e sincronização. Nenhum valor
          demonstrativo é apresentado nesta etapa.
        </Typography>
      </footer>
    </div>
  );
}
