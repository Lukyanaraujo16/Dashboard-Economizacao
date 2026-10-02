import { formatMoneyBrl } from '../../lib/format-money-brl';
import type {
  OperationsCompanyRow,
  OperationsMoney,
  OperationsOverview,
} from '../../services/admin/operations';
import { Badge, Card, Typography } from '../ui';
import { formatOperationsMonth, syncErrorLabel } from './operations-display';
import styles from './operations.module.css';

function moneyOrDash(value: OperationsMoney): string {
  if (value === null) {
    return '—';
  }
  return formatMoneyBrl(value);
}

function integrationLabel(state: string): { readonly label: string; readonly variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (state === 'CONNECTED') {
    return { label: 'Conectada', variant: 'success' };
  }
  if (state === 'DISCONNECTED') {
    return { label: 'Desconectada', variant: 'neutral' };
  }
  if (state === 'ERROR') {
    return { label: 'Erro na integração', variant: 'danger' };
  }
  if (state === 'SYNC_FAILED') {
    return { label: 'Sincronização com falha', variant: 'warning' };
  }
  return { label: 'Sem integração', variant: 'neutral' };
}

export function OperationsExecutive({
  overview,
  formatWhen,
  labelOf,
}: {
  readonly overview: OperationsOverview;
  readonly formatWhen: (iso: string | null) => string;
  readonly labelOf: (value: string) => string;
}) {
  const { kpis, windows } = overview;
  const month = formatOperationsMonth(overview.referenceMonthKey);
  const alertsEmpty =
    overview.alerts.failures.length === 0 &&
    overview.alerts.aiErrors.length === 0 &&
    overview.alerts.audit.length === 0;

  return (
    <div className={styles.executive} data-testid="operations-executive">
      <div className={styles.kpiGrid}>
        <Card className={styles.kpi}>
          <Typography as="p" variant="caption" className={styles.kpiLabel}>
            Empresas
          </Typography>
          <p className={styles.kpiValue}>{kpis.companies.total}</p>
          <Typography as="p" variant="caption" className={styles.muted}>
            Cadastradas na plataforma
          </Typography>
        </Card>
        <Card className={styles.kpi}>
          <Typography as="p" variant="caption" className={styles.kpiLabel}>
            Integrações
          </Typography>
          <p className={styles.kpiValue}>
            {kpis.integrations.connected}
            <span className={styles.kpiUnit}> de {kpis.integrations.total}</span>
          </p>
          {kpis.integrations.withError > 0 ? (
            <Badge variant="danger">{kpis.integrations.withError} com erro</Badge>
          ) : (
            <Typography as="p" variant="caption" className={styles.muted}>
              Nenhuma com erro
            </Typography>
          )}
        </Card>
        <Card className={styles.kpi}>
          <Typography as="p" variant="caption" className={styles.kpiLabel}>
            Sincronização
          </Typography>
          <p className={styles.kpiValue}>{kpis.synchronization.syncedCompaniesLast24Hours}</p>
          <Typography as="p" variant="caption" className={styles.muted}>
            Empresas sincronizadas nas últimas {windows.syncFreshnessHours} horas
          </Typography>
          <Typography as="p" variant="caption" className={styles.muted}>
            {kpis.synchronization.failuresLast7Days} falhas nos últimos {windows.recentDays} dias
          </Typography>
        </Card>
        <Card className={styles.kpi}>
          <Typography as="p" variant="caption" className={styles.kpiLabel}>
            Lia
          </Typography>
          <p className={styles.kpiValue}>{kpis.ai.runsLast7Days}</p>
          <Typography as="p" variant="caption" className={styles.muted}>
            Execuções nos últimos {windows.recentDays} dias
          </Typography>
          <Typography as="p" variant="caption" className={styles.muted}>
            {kpis.ai.errorsLast7Days} erros no mesmo período
          </Typography>
        </Card>
        <Card className={styles.kpi}>
          <Typography as="p" variant="caption" className={styles.kpiLabel}>
            Auditoria
          </Typography>
          <p className={styles.kpiValue}>{kpis.audit.changesLast7Days}</p>
          <Typography as="p" variant="caption" className={styles.muted}>
            Alterações administrativas nos últimos {windows.recentDays} dias
          </Typography>
        </Card>
      </div>

      <section className={styles.section} aria-labelledby="operations-companies-title">
        <div className={styles.sectionHead}>
          <Typography as="h2" variant="heading" id="operations-companies-title">
            Visão por empresa
          </Typography>
          <Typography as="p" variant="caption" className={styles.muted}>
            Competência {month}. Fatos oficiais do caixa, no fuso America/Sao_Paulo. Traço significa
            dado indisponível.
          </Typography>
        </div>
        {overview.companies.data.length === 0 ? (
          <Typography as="p" variant="body">
            Nenhuma empresa para exibir.
          </Typography>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="operations-companies">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Integração</th>
                  <th>Última sincronização</th>
                  <th>Faturamento</th>
                  <th>Resultado</th>
                  <th>A receber</th>
                  <th>Contas a pagar</th>
                  <th>Vencidos</th>
                </tr>
              </thead>
              <tbody>
                {overview.companies.data.map((row) => (
                  <CompanyRow key={row.tenantId} row={row} formatWhen={formatWhen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="operations-alerts-title">
        <Typography as="h2" variant="heading" id="operations-alerts-title">
          Atividade dos últimos {windows.recentDays} dias
        </Typography>
        {alertsEmpty ? (
          <Typography as="p" variant="body" className={styles.muted}>
            Nenhuma falha de sincronização, erro da Lia ou alteração administrativa nesse período.
          </Typography>
        ) : (
          <div className={styles.alertGrid}>
            <AlertList
              title="Falhas de sincronização"
              empty="Nenhuma falha de sincronização."
              items={overview.alerts.failures.map((row) => ({
                id: row.id,
                text: `${row.tenantDisplayName} · ${formatWhen(row.startedAt)} · ${syncErrorLabel(row.errorCode)}`,
              }))}
            />
            <AlertList
              title="Erros da Lia"
              empty="Nenhum erro de execução."
              items={overview.alerts.aiErrors.map((row) => ({
                id: row.id,
                text: `${row.tenantDisplayName} · ${formatWhen(row.createdAt)} · ${row.status}`,
              }))}
            />
            <AlertList
              title="Alterações administrativas"
              empty="Nenhuma alteração administrativa."
              items={overview.alerts.audit.map((row) => ({
                id: row.id,
                text: `${formatWhen(row.createdAt)} · ${row.operatorName} · ${labelOf(row.action)}`,
              }))}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function CompanyRow({
  row,
  formatWhen,
}: {
  readonly row: OperationsCompanyRow;
  readonly formatWhen: (iso: string | null) => string;
}) {
  const integration = integrationLabel(row.integrationState);
  const overdue =
    row.financials.overdueReceivables === null && row.financials.overduePayables === null
      ? '—'
      : `A receber ${moneyOrDash(row.financials.overdueReceivables)} · A pagar ${moneyOrDash(row.financials.overduePayables)}`;
  return (
    <tr>
      <td>{row.tenantDisplayName}</td>
      <td>
        <Badge variant={integration.variant}>{integration.label}</Badge>
      </td>
      <td>{formatWhen(row.integration?.lastSuccessfulSyncAt ?? null)}</td>
      <td>{moneyOrDash(row.financials.billing)}</td>
      <td>{moneyOrDash(row.financials.result)}</td>
      <td>{moneyOrDash(row.financials.receivables)}</td>
      <td>{moneyOrDash(row.financials.payables)}</td>
      <td>{overdue}</td>
    </tr>
  );
}

function AlertList({
  title,
  empty,
  items,
}: {
  readonly title: string;
  readonly empty: string;
  readonly items: readonly { readonly id: string; readonly text: string }[];
}) {
  return (
    <Card className={styles.alertCard}>
      <Typography as="h3" variant="body">
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography as="p" variant="caption" className={styles.muted}>
          {empty}
        </Typography>
      ) : (
        <ul className={styles.alertList}>
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
