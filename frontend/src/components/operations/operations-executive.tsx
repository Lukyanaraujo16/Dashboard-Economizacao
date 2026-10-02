import type { ReactNode } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import type {
  OperationsCompanyRow,
  OperationsMoney,
  OperationsOverview,
} from '../../services/admin/operations';
import { Badge, Card, Typography } from '../ui';
import {
  IconActivity,
  IconBot,
  IconBuilding2,
  IconLink2,
  IconScrollText,
  IconTriangleAlert,
} from '../ui/icons';
import { formatOperationsMonth, syncErrorLabel } from './operations-display';
import styles from './operations.module.css';

type Tone = 'calm' | 'attention' | 'alert';

function moneyOrDash(value: OperationsMoney): string {
  if (value === null) {
    return '—';
  }
  return formatMoneyBrl(value);
}

function integrationLabel(state: string): {
  readonly label: string;
  readonly variant: 'success' | 'warning' | 'danger' | 'neutral';
} {
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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function OperationsExecutive({
  overview,
  formatWhen,
  labelOf,
  companiesFooter,
}: {
  readonly overview: OperationsOverview;
  readonly formatWhen: (iso: string | null) => string;
  readonly labelOf: (value: string) => string;
  readonly companiesFooter?: ReactNode;
}) {
  const { kpis, windows } = overview;
  const month = formatOperationsMonth(overview.referenceMonthKey);
  const integrationTone: Tone = kpis.integrations.withError > 0 ? 'alert' : 'calm';
  const syncTone: Tone = kpis.synchronization.failuresLast7Days > 0 ? 'alert' : 'calm';
  const aiTone: Tone = kpis.ai.errorsLast7Days > 0 ? 'alert' : 'calm';
  const disconnected = Math.max(0, kpis.integrations.total - kpis.integrations.connected);

  return (
    <div className={styles.executive} data-testid="operations-executive">
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Empresas"
          tone="calm"
          icon={<IconBuilding2 size={16} />}
          value={String(kpis.companies.total)}
          context="Cadastradas na plataforma"
        />
        <KpiCard
          label="Integrações"
          tone={integrationTone}
          icon={<IconLink2 size={16} />}
          value={String(kpis.integrations.connected)}
          valueSuffix={`/ ${kpis.integrations.total}`}
          context="conectadas"
          note={
            kpis.integrations.withError > 0
              ? plural(kpis.integrations.withError, 'com erro', 'com erro')
              : disconnected > 0
                ? plural(disconnected, 'sem conexão', 'sem conexão')
                : null
          }
          noteTone={kpis.integrations.withError > 0 ? 'alert' : 'calm'}
        />
        <KpiCard
          label="Sincronização"
          tone={syncTone}
          icon={<IconActivity size={16} />}
          value={String(kpis.synchronization.syncedCompaniesLast24Hours)}
          context={`nas últimas ${windows.syncFreshnessHours} horas`}
          note={plural(
            kpis.synchronization.failuresLast7Days,
            `falha em ${windows.recentDays} dias`,
            `falhas em ${windows.recentDays} dias`,
          )}
          noteTone={syncTone}
        />
        <KpiCard
          label="Lia"
          tone={aiTone}
          icon={<IconBot size={16} />}
          value={String(kpis.ai.runsLast7Days)}
          context={`execuções em ${windows.recentDays} dias`}
          note={plural(kpis.ai.errorsLast7Days, 'erro no período', 'erros no período')}
          noteTone={aiTone}
        />
        <KpiCard
          label="Auditoria"
          tone="calm"
          icon={<IconScrollText size={16} />}
          value={String(kpis.audit.changesLast7Days)}
          context={`alterações em ${windows.recentDays} dias`}
        />
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
          <Card className={styles.emptyPanel}>
            <Typography as="p" variant="body">
              Nenhuma empresa para exibir.
            </Typography>
          </Card>
        ) : (
          <div className={styles.companyList} data-testid="operations-companies">
            {overview.companies.data.map((row) => (
              <CompanyCard key={row.tenantId} row={row} formatWhen={formatWhen} month={month} />
            ))}
          </div>
        )}
        {companiesFooter}
      </section>

      <ActivityPanel overview={overview} formatWhen={formatWhen} labelOf={labelOf} />
    </div>
  );
}

function KpiCard({
  label,
  tone,
  icon,
  value,
  valueSuffix,
  context,
  note,
  noteTone = 'calm',
}: {
  readonly label: string;
  readonly tone: Tone;
  readonly icon: ReactNode;
  readonly value: string;
  readonly valueSuffix?: string;
  readonly context: string;
  readonly note?: string | null;
  readonly noteTone?: Tone;
}) {
  return (
    <Card className={styles.kpi} data-tone={tone}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiIcon} data-tone={tone}>
          {icon}
        </span>
        <Typography as="p" variant="caption" className={styles.kpiLabel}>
          {label}
        </Typography>
      </div>
      <p className={styles.kpiValue}>
        {value}
        {valueSuffix ? <span className={styles.kpiUnit}>{valueSuffix}</span> : null}
      </p>
      <Typography as="p" variant="caption" className={styles.kpiContext}>
        {context}
      </Typography>
      {note ? (
        <p className={styles.statusNote} data-tone={noteTone}>
          <span className={styles.statusDot} aria-hidden="true" />
          {note}
        </p>
      ) : (
        <p className={styles.statusNoteSpacer} aria-hidden="true" />
      )}
    </Card>
  );
}

function CompanyCard({
  row,
  formatWhen,
  month,
}: {
  readonly row: OperationsCompanyRow;
  readonly formatWhen: (iso: string | null) => string;
  readonly month: string;
}) {
  const integration = integrationLabel(row.integrationState);
  return (
    <article className={styles.companyCard} data-state={row.integrationState}>
      <header className={styles.companyHead}>
        <div className={styles.companyIdentity}>
          <Typography as="h3" variant="body" className={styles.companyName}>
            {row.tenantDisplayName}
          </Typography>
          <p className={styles.companyMeta}>
            Última sincronização: {formatWhen(row.integration?.lastSuccessfulSyncAt ?? null)}
            <span aria-hidden="true"> · </span>
            Competência {month}
          </p>
        </div>
        <Badge variant={integration.variant}>{integration.label}</Badge>
      </header>
      <div className={styles.metricGrid}>
        <Metric label="Faturamento" value={moneyOrDash(row.financials.billing)} emphasis />
        <Metric label="Resultado" value={moneyOrDash(row.financials.result)} emphasis />
        <Metric label="A receber" value={moneyOrDash(row.financials.receivables)} />
        <Metric label="Contas a pagar" value={moneyOrDash(row.financials.payables)} />
        <Metric label="Vencidos a receber" value={moneyOrDash(row.financials.overdueReceivables)} />
        <Metric label="Vencidos a pagar" value={moneyOrDash(row.financials.overduePayables)} />
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? styles.metricPrimary : styles.metric}>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.metricLabel}>{label}</p>
    </div>
  );
}

type ActivityItem = {
  readonly id: string;
  readonly at: number;
  readonly kind: 'failure' | 'ai' | 'audit';
  readonly title: string;
  readonly context: string;
  readonly when: string;
};

function ActivityPanel({
  overview,
  formatWhen,
  labelOf,
}: {
  readonly overview: OperationsOverview;
  readonly formatWhen: (iso: string | null) => string;
  readonly labelOf: (value: string) => string;
}) {
  const items: ActivityItem[] = [
    ...overview.alerts.failures.map((row) => ({
      id: `failure-${row.id}`,
      at: Date.parse(row.startedAt),
      kind: 'failure' as const,
      title: 'Falha de sincronização',
      context: `${row.tenantDisplayName} · ${syncErrorLabel(row.errorCode)}`,
      when: formatWhen(row.startedAt),
    })),
    ...overview.alerts.aiErrors.map((row) => ({
      id: `ai-${row.id}`,
      at: Date.parse(row.createdAt),
      kind: 'ai' as const,
      title: 'Erro da Lia',
      context: `${row.tenantDisplayName} · ${labelOf(row.status)}`,
      when: formatWhen(row.createdAt),
    })),
    ...overview.alerts.audit.map((row) => ({
      id: `audit-${row.id}`,
      at: Date.parse(row.createdAt),
      kind: 'audit' as const,
      title: 'Alteração administrativa',
      context: `${row.operatorName} · ${labelOf(row.action)}`,
      when: formatWhen(row.createdAt),
    })),
  ].sort((left, right) => {
    const leftAt = Number.isNaN(left.at) ? 0 : left.at;
    const rightAt = Number.isNaN(right.at) ? 0 : right.at;
    return rightAt - leftAt;
  });

  return (
    <section className={styles.section} aria-labelledby="operations-alerts-title">
      <Card className={styles.activityCard} data-testid="operations-activity">
        <Typography as="h2" variant="heading" id="operations-alerts-title">
          Atividade dos últimos {overview.windows.recentDays} dias
        </Typography>
        {items.length === 0 ? (
          <div className={styles.activityEmpty}>
            <span className={styles.activityEmptyIcon} aria-hidden="true">
              <IconTriangleAlert size={16} />
            </span>
            <div>
              <Typography as="p" variant="body">
                Nenhuma atividade nesse período.
              </Typography>
              <Typography as="p" variant="caption" className={styles.muted}>
                Falhas de sincronização, erros da Lia e alterações administrativas aparecem aqui.
              </Typography>
            </div>
          </div>
        ) : (
          <ol className={styles.timeline}>
            {items.map((item) => (
              <li key={item.id} className={styles.timelineItem}>
                <span className={styles.timelineIcon} data-kind={item.kind} aria-hidden="true">
                  {item.kind === 'failure' ? (
                    <IconActivity size={14} />
                  ) : item.kind === 'ai' ? (
                    <IconBot size={14} />
                  ) : (
                    <IconScrollText size={14} />
                  )}
                </span>
                <div className={styles.timelineBody}>
                  <p className={styles.timelineTitle}>{item.title}</p>
                  <p className={styles.timelineMeta}>{item.context}</p>
                </div>
                <time className={styles.timelineWhen}>{item.when}</time>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
