'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { listCompanies } from '../../services/admin/companies';
import {
  getOperationOverview,
  listOperationAiRuns,
  listOperationAuditLogs,
  listOperationFailures,
  listOperationSyncRuns,
  OperationsRequestError,
  type AiRunRow,
  type AuditLogRow,
  type OperationsOverview,
  type SyncRunRow,
} from '../../services/admin/operations';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, Typography } from '../ui';
import { OperationsExecutive } from './operations-executive';
import {
  failureProgressSummary,
  primarySyncCountSummary,
  summarizeAiPage,
  syncCountDetails,
  syncErrorLabel,
} from './operations-display';
import styles from './operations.module.css';

const PAGE_SIZE = 20;

type TabId = 'health' | 'sync' | 'failures' | 'ai' | 'audit';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'health', label: 'Saúde' },
  { id: 'sync', label: 'Sincronizações' },
  { id: 'failures', label: 'Falhas' },
  { id: 'ai', label: 'Execuções de IA' },
  { id: 'audit', label: 'Auditoria' },
];

const SYNC_STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'RUNNING', label: 'Em execução' },
  { value: 'SUCCESS', label: 'Concluída' },
  { value: 'FAILED', label: 'Falhou' },
];

const AI_STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'STARTED', label: 'Iniciada' },
  { value: 'SUCCEEDED', label: 'Concluída' },
  { value: 'FAILED', label: 'Falhou' },
  { value: 'TIMEOUT', label: 'Tempo esgotado' },
  { value: 'LIMIT_BLOCKED', label: 'Limite' },
];

const AUDIT_ACTION_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  { value: 'tenant.created', label: 'Empresa criada' },
  { value: 'tenant.updated', label: 'Empresa editada' },
  { value: 'tenant.disabled', label: 'Empresa desativada' },
  { value: 'tenant.reactivated', label: 'Empresa reativada' },
  { value: 'tenant.deleted', label: 'Empresa excluída' },
  { value: 'tenant_user.created', label: 'Usuário criado' },
  { value: 'tenant_user.updated', label: 'Usuário editado' },
  { value: 'tenant_user.password_reset', label: 'Senha de usuário alterada' },
  { value: 'tenant_user.disabled', label: 'Usuário desativado' },
  { value: 'tenant_user.enabled', label: 'Usuário reativado' },
  { value: 'tenant_user.blocked', label: 'Usuário bloqueado' },
  { value: 'tenant_user.unblocked', label: 'Usuário desbloqueado' },
  { value: 'tenant_user.removed', label: 'Usuário excluído' },
  { value: 'administrator.created', label: 'Administrador criado' },
  { value: 'administrator.updated', label: 'Administrador editado' },
  { value: 'administrator.password_reset', label: 'Senha de administrador alterada' },
  { value: 'administrator.disabled', label: 'Administrador desativado' },
  { value: 'administrator.enabled', label: 'Administrador reativado' },
  { value: 'administrator.blocked', label: 'Administrador bloqueado' },
  { value: 'administrator.unblocked', label: 'Administrador desbloqueado' },
  { value: 'tenant_branding.updated', label: 'Aparência da empresa' },
  { value: 'tenant_branding.reset', label: 'Aparência da empresa restaurada' },
  { value: 'tenant_branding.logo_updated', label: 'Logo da empresa' },
  { value: 'tenant_branding.logo_removed', label: 'Logo da empresa removida' },
  { value: 'tenant_branding.icon_updated', label: 'Ícone da empresa' },
  { value: 'tenant_branding.icon_removed', label: 'Ícone da empresa removido' },
  { value: 'platform_branding.updated', label: 'Aparência da plataforma' },
  { value: 'platform_branding.reset', label: 'Aparência da plataforma restaurada' },
  { value: 'platform_branding.logo_updated', label: 'Logo da plataforma' },
  { value: 'platform_branding.logo_removed', label: 'Logo da plataforma removida' },
  { value: 'platform_branding.icon_updated', label: 'Ícone da plataforma' },
  { value: 'platform_branding.icon_removed', label: 'Ícone da plataforma removido' },
  { value: 'platform_branding.favicon_updated', label: 'Favicon da plataforma' },
  { value: 'platform_branding.favicon_removed', label: 'Favicon da plataforma removido' },
  { value: 'consultant.settings_updated', label: 'Consultor configurado' },
  { value: 'consultant.provider_credential_set', label: 'Credencial do Consultor definida' },
  { value: 'consultant.provider_credential_removed', label: 'Credencial do Consultor removida' },
  { value: 'knowledge_entry.created', label: 'Conhecimento criado' },
  { value: 'knowledge_entry.updated', label: 'Conhecimento editado' },
  { value: 'knowledge_entry.deleted', label: 'Conhecimento excluído' },
  { value: 'knowledge_document.created', label: 'Documento de conhecimento criado' },
  { value: 'knowledge_document.updated', label: 'Documento de conhecimento editado' },
  { value: 'knowledge_document.deleted', label: 'Documento de conhecimento excluído' },
  { value: 'proactive_trigger.created', label: 'Gatilho criado' },
  { value: 'proactive_trigger.updated', label: 'Gatilho alterado' },
  { value: 'proactive_trigger.activated', label: 'Gatilho ativado' },
  { value: 'proactive_trigger.deleted', label: 'Gatilho excluído' },
  { value: 'integration.connect_started', label: 'Conexão iniciada' },
  { value: 'integration.connected', label: 'Integração conectada' },
  { value: 'integration.disconnected', label: 'Integração desconectada' },
  { value: 'integration.sync_triggered', label: 'Sincronização manual' },
];

const ACTION_LABELS = Object.fromEntries(
  AUDIT_ACTION_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]),
);

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  RUNNING: 'Em execução',
  SUCCESS: 'Concluída',
  FAILED: 'Falhou',
  DISCONNECTED: 'Desconectada',
  CONNECTED: 'Conectada',
  ERROR: 'Erro',
  STARTED: 'Iniciada',
  SUCCEEDED: 'Concluída',
  TIMEOUT: 'Tempo esgotado',
  LIMIT_BLOCKED: 'Limite',
  ACTIVE: 'Ativa',
  DISABLED: 'Desativada',
  MANUAL: 'Manual',
  SCHEDULED: 'Agendada',
  QUESTION_REPLY: 'Resposta',
  PROACTIVE_NARRATION: 'Narração',
};

function labelOf(value: string): string {
  return STATUS_LABELS[value] ?? ACTION_LABELS[value] ?? value;
}

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) {
    return '—';
  }
  return JSON.stringify(metadata);
}

function rangeLabel(offset: number, count: number, total: number): string {
  if (total === 0) {
    return '0 de 0';
  }
  return `${offset + 1}–${offset + count} de ${total}`;
}

type ListState = 'loading' | 'empty' | 'ready' | 'error';

export function OperationsPage() {
  const [tab, setTab] = useState<TabId>('health');
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [companies, setCompanies] = useState<ReadonlyArray<{ id: string; displayName: string }>>([]);
  const [state, setState] = useState<ListState>('loading');
  const [errorMessage, setErrorMessage] = useState('Não foi possível carregar a operação.');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [syncRows, setSyncRows] = useState<readonly SyncRunRow[]>([]);
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [aiRows, setAiRows] = useState<readonly AiRunRow[]>([]);
  const [auditRows, setAuditRows] = useState<readonly AuditLogRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void listCompanies({ limit: 100, offset: 0 })
      .then((result) => {
        if (!cancelled) {
          setCompanies(result.data.map((company) => ({ id: company.id, displayName: company.displayName })));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompanies([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setState('loading');
    const query = {
      limit: PAGE_SIZE,
      offset,
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status } : {}),
      ...(action ? { action } : {}),
    };
    try {
      if (tab === 'health') {
        const result = await getOperationOverview(query);
        if (current !== requestId.current) {
          return;
        }
        setOverview(result);
        setTotal(result.companies.pagination.total);
        setHasMore(result.companies.pagination.hasMore);
        setState('ready');
        return;
      }
      if (tab === 'sync' || tab === 'failures') {
        const result =
          tab === 'sync' ? await listOperationSyncRuns(query) : await listOperationFailures(query);
        if (current !== requestId.current) {
          return;
        }
        setSyncRows(result.data);
        setTotal(result.pagination.total);
        setHasMore(result.pagination.hasMore);
        setState(result.data.length === 0 ? 'empty' : 'ready');
        return;
      }
      if (tab === 'ai') {
        const result = await listOperationAiRuns(query);
        if (current !== requestId.current) {
          return;
        }
        setAiRows(result.data);
        setTotal(result.pagination.total);
        setHasMore(result.pagination.hasMore);
        setState(result.data.length === 0 ? 'empty' : 'ready');
        return;
      }
      const result = await listOperationAuditLogs(query);
      if (current !== requestId.current) {
        return;
      }
      setAuditRows(result.data);
      setTotal(result.pagination.total);
      setHasMore(result.pagination.hasMore);
      setState(result.data.length === 0 ? 'empty' : 'ready');
    } catch (error) {
      if (current !== requestId.current) {
        return;
      }
      setErrorMessage(
        error instanceof OperationsRequestError
          ? error.message
          : 'Não foi possível carregar a operação.',
      );
      setState('error');
    }
  }, [action, offset, status, tab, tenantId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const visibleCount =
    tab === 'health'
      ? (overview?.companies.data.length ?? 0)
      : tab === 'ai'
        ? aiRows.length
        : tab === 'audit'
          ? auditRows.length
          : syncRows.length;

  const emptyMessage =
    tab === 'health'
      ? 'Nenhuma empresa para exibir.'
      : tab === 'failures'
        ? 'Nenhuma falha de sincronização registrada.'
        : tab === 'ai'
          ? 'Nenhuma execução de IA registrada.'
          : tab === 'audit'
            ? 'Ainda não há alterações administrativas registradas. Elas aparecem aqui depois de mudanças feitas na plataforma, como empresas, usuários, aparência e integrações.'
            : 'Nenhuma sincronização registrada.';

  return (
    <section className={styles.page} data-testid="operations-page">
      <header className={styles.intro}>
        <Typography as="h1" variant="heading">
          Operação
        </Typography>
        <Typography as="p" variant="body" className={styles.description}>
          Visão administrativa da plataforma. As abas seguintes detalham sincronização, falhas,
          execuções da Lia e auditoria.
        </Typography>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Visões operacionais">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.tab}
            role="tab"
            aria-pressed={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setOffset(0);
              setStatus('');
              setAction('');
              setState('loading');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <Typography as="span" variant="caption" className={styles.fieldLabel}>
            Empresa
          </Typography>
          <select
            className={styles.select}
            value={tenantId}
            aria-label="Filtrar por empresa"
            onChange={(event) => {
              setTenantId(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.displayName}
              </option>
            ))}
          </select>
        </label>

        {tab === 'sync' || tab === 'ai' ? (
          <label className={styles.field}>
            <Typography as="span" variant="caption" className={styles.fieldLabel}>
              Status
            </Typography>
            <select
              className={styles.select}
              value={status}
              aria-label="Filtrar por status"
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              {(tab === 'sync' ? SYNC_STATUS_OPTIONS : AI_STATUS_OPTIONS).map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {tab === 'audit' ? (
          <label className={styles.field}>
            <Typography as="span" variant="caption" className={styles.fieldLabel}>
              Ação
            </Typography>
            <select
              className={styles.select}
              value={action}
              aria-label="Filtrar por ação"
              onChange={(event) => {
                setAction(event.target.value);
                setOffset(0);
              }}
            >
              {AUDIT_ACTION_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <StateWrapper
        state={state}
        loadingLabel="Carregando operação"
        errorMessage={errorMessage}
        emptyMessage={emptyMessage}
        onRetry={() => setReloadKey((current) => current + 1)}
      >
        {tab === 'health' && overview ? (
          <OperationsExecutive overview={overview} formatWhen={formatWhen} labelOf={labelOf} />
        ) : null}
        {tab === 'sync' ? <SyncTable rows={syncRows} /> : null}
        {tab === 'failures' ? <FailureTable rows={syncRows} /> : null}
        {tab === 'ai' ? <AiTable rows={aiRows} /> : null}
        {tab === 'audit' ? <AuditTable rows={auditRows} /> : null}
      </StateWrapper>

      {state === 'ready' || state === 'empty' ? (
        <div className={styles.pagination}>
          <Typography as="p" variant="caption" className={styles.muted}>
            {rangeLabel(offset, visibleCount, total)}
          </Typography>
          <div className={styles.paginationActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SyncCountsCell({
  counts,
  summary = true,
}: {
  readonly counts: SyncRunRow['counts'];
  readonly summary?: boolean;
}) {
  const details = syncCountDetails(counts);
  return (
    <div className={styles.countsCell}>
      {summary ? <span>{primarySyncCountSummary(counts)}</span> : null}
      {details.length > 0 ? (
        <details className={styles.details}>
          <summary>Ver detalhes</summary>
          <ul className={styles.detailList}>
            {details.map((item) => (
              <li key={item.key}>
                <span>{item.label}</span>
                <span className={styles.detailValue}>{item.value}</span>
                <span className={styles.detailKey}>{item.key}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function SyncTable({ rows }: { readonly rows: readonly SyncRunRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.muted}>Histórico de sincronizações</caption>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Início</th>
            <th>Fim</th>
            <th>Duração</th>
            <th>Heartbeat</th>
            <th>Erro</th>
            <th>Resumo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.tenantDisplayName}</td>
              <td>{labelOf(row.status)}</td>
              <td>{labelOf(row.triggerType)}</td>
              <td>{formatWhen(row.startedAt)}</td>
              <td>{formatWhen(row.finishedAt)}</td>
              <td>{formatDuration(row.durationMs)}</td>
              <td>{formatWhen(row.heartbeatAt)}</td>
              <td>{row.errorCode ? syncErrorLabel(row.errorCode) : '—'}</td>
              <td>
                <SyncCountsCell counts={row.counts} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureTable({ rows }: { readonly rows: readonly SyncRunRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.muted}>Falhas de sincronização</caption>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Quando</th>
            <th>Duração</th>
            <th>Origem</th>
            <th>Erro</th>
            <th>Andamento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.tenantDisplayName}</td>
              <td>{formatWhen(row.startedAt)}</td>
              <td>{formatDuration(row.durationMs)}</td>
              <td>{labelOf(row.triggerType)}</td>
              <td>
                <div className={styles.countsCell}>
                  <span>{syncErrorLabel(row.errorCode)}</span>
                  {row.errorCode ? (
                    <details className={styles.details}>
                      <summary>Ver código técnico</summary>
                      <p className={styles.detailKey}>{row.errorCode}</p>
                    </details>
                  ) : null}
                </div>
              </td>
              <td>
                <div className={styles.countsCell}>
                  <span>{failureProgressSummary(row.counts)}</span>
                  <SyncCountsCell counts={row.counts} summary={false} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiTable({ rows }: { readonly rows: readonly AiRunRow[] }) {
  const summary = summarizeAiPage(rows);
  return (
    <div className={styles.stack}>
      <div className={styles.aiSummary} data-testid="operations-ai-summary">
        <Typography as="p" variant="body">
          Nesta página: {summary.total} execuções, {summary.succeeded} concluídas, {summary.failed}{' '}
          falhas.
        </Typography>
        <Typography as="p" variant="caption" className={styles.muted}>
          Tempo médio das execuções com duração registrada:{' '}
          {summary.averageDurationMs === null ? '—' : formatDuration(summary.averageDurationMs)}. Sem
          estimativa de custo.
        </Typography>
      </div>
      <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.muted}>Execuções da IA</caption>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Usuário</th>
            <th>Tipo</th>
            <th>Provedor</th>
            <th>Modelo</th>
            <th>Status</th>
            <th>Tokens</th>
            <th>Duração</th>
            <th>Erro</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.tenantDisplayName}</td>
              <td>{row.userName ?? '—'}</td>
              <td>{labelOf(row.runType)}</td>
              <td>{row.provider}</td>
              <td>{row.model}</td>
              <td>{labelOf(row.status)}</td>
              <td>
                {row.inputTokens === null && row.outputTokens === null
                  ? '—'
                  : `${row.inputTokens ?? 0} / ${row.outputTokens ?? 0}`}
              </td>
              <td>{formatDuration(row.durationMs)}</td>
              <td>{row.errorCode ?? '—'}</td>
              <td>{formatWhen(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function AuditTable({ rows }: { readonly rows: readonly AuditLogRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.muted}>Auditoria administrativa</caption>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Operador</th>
            <th>Empresa</th>
            <th>Ação</th>
            <th>Alvo</th>
            <th>Resultado</th>
            <th>Detalhe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatWhen(row.createdAt)}</td>
              <td>{row.operatorName}</td>
              <td>{row.tenantDisplayName ?? '—'}</td>
              <td>{labelOf(row.action)}</td>
              <td>
                {row.targetType}
                {row.targetId ? ` · ${row.targetId}` : ''}
              </td>
              <td>{row.result === 'SUCCESS' ? 'Sucesso' : row.result === 'FAILURE' ? 'Falha' : row.result}</td>
              <td>{formatMetadata(row.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
