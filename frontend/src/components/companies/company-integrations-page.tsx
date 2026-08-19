'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import {
  connectContaAzul,
  disconnectContaAzul,
  getContaAzulIntegration,
  getCurrentContaAzulSync,
  startContaAzulSync,
  verifyContaAzul,
} from '../../services/admin/conta-azul';
import {
  ContaAzulRequestError,
  contaAzulErrorMessage,
  contaAzulSyncErrorMessage,
} from '../../services/admin/conta-azul.types';
import type { ContaAzulIntegration, ContaAzulSyncRun } from '../../services/admin/conta-azul.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Badge, Button, Card, Typography } from '../ui';
import { CompanySectionNav } from './company-section-nav';
import { formatCompanyDate } from './company-utils';
import styles from './companies.module.css';

type CompanyIntegrationsPageProps = {
  readonly companyId: string;
  readonly oauthResult?: string | null;
};

function callbackMessage(
  signal: string | null | undefined,
): { text: string; tone: 'success' | 'danger' } | null {
  switch (signal) {
    case 'connected':
      return { text: 'Conta Azul conectada com sucesso.', tone: 'success' };
    case 'denied':
      return { text: 'A autorização na Conta Azul foi recusada.', tone: 'danger' };
    case 'expired':
      return { text: 'A sessão expirou. Inicie a conexão novamente.', tone: 'danger' };
    case 'replay':
    case 'invalid':
      return {
        text: 'Esta autorização não é mais válida. Inicie a conexão novamente.',
        tone: 'danger',
      };
    case 'error':
      return { text: 'Não foi possível concluir a autorização da Conta Azul.', tone: 'danger' };
    default:
      return null;
  }
}

function statusLabel(status: ContaAzulIntegration['status']): {
  readonly label: string;
  readonly variant: 'neutral' | 'success' | 'warning' | 'danger';
} {
  if (status === 'CONNECTED') {
    return { label: 'Conectada', variant: 'success' };
  }
  if (status === 'ERROR') {
    return { label: 'Atenção necessária', variant: 'warning' };
  }
  return { label: 'Não conectada', variant: 'neutral' };
}

function autoSyncStatusLabel(integration: ContaAzulIntegration): string {
  if (integration.status !== 'CONNECTED') {
    return 'Sincronização automática indisponível.';
  }
  if (!integration.autoSyncEligible) {
    return 'A sincronização automática será ativada após a primeira sincronização manual.';
  }
  return 'Sincronização automática: Ativa';
}

function autoSyncFrequencyLabel(integration: ContaAzulIntegration): string | null {
  if (integration.status !== 'CONNECTED' || !integration.autoSyncEligible) {
    return null;
  }
  return `Frequência: a cada ${integration.autoSyncIntervalMinutes} minutos`;
}

function syncLabel(lastSuccessfulSyncAt: string | null): string {
  if (!lastSuccessfulSyncAt) {
    return 'Nunca sincronizado';
  }
  return formatCompanyDate(lastSuccessfulSyncAt);
}

function isActiveSync(run: ContaAzulSyncRun | null): boolean {
  return run?.status === 'PENDING' || run?.status === 'RUNNING';
}

function countsSummary(run: ContaAzulSyncRun | null): string | null {
  // Counts são processed (upsert), não inserted/updated.
  if (!run?.counts || run.status !== 'SUCCESS') {
    return null;
  }
  const counts = run.counts;
  return `Categorias: ${counts.categories} · Contas: ${counts.financialAccounts} · Pessoas: ${counts.parties} · A receber: ${counts.receivables} · A pagar: ${counts.payables}`;
}

export function CompanyIntegrationsPage({ companyId, oauthResult }: CompanyIntegrationsPageProps) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [integration, setIntegration] = useState<ContaAzulIntegration | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>(
    'loading',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState(callbackMessage(oauthResult));
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncRun, setSyncRun] = useState<ContaAzulSyncRun | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [company, status, currentRun] = await Promise.all([
        getCompany(companyId),
        getContaAzulIntegration(companyId),
        getCurrentContaAzulSync(companyId).catch(() => null),
      ]);
      setCompanyName(company.displayName);
      setIntegration(status);
      setSyncRun(currentRun);
      setLoadState('ready');
    } catch (error) {
      if (
        (error instanceof CompaniesRequestError || error instanceof ContaAzulRequestError) &&
        error.kind === 'not_found'
      ) {
        setLoadState('not_found');
        return;
      }
      setLoadState('error');
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!oauthResult) {
      return;
    }
    router.replace(`/empresas/${companyId}/integracoes`);
  }, [companyId, oauthResult, router]);

  useEffect(() => {
    if (!isActiveSync(syncRun)) {
      return;
    }
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const current = await getCurrentContaAzulSync(companyId);
          setSyncRun(current);
          if (current?.status === 'SUCCESS') {
            const status = await getContaAzulIntegration(companyId);
            setIntegration(status);
            setFlash({ text: 'Sincronização concluída.', tone: 'success' });
            setSyncing(false);
          } else if (current?.status === 'FAILED') {
            setActionError(contaAzulSyncErrorMessage(current.errorCode));
            setSyncing(false);
          }
        } catch {
          setActionError('Não foi possível acompanhar a sincronização.');
          setSyncing(false);
        }
      })();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [companyId, syncRun?.status]);

  async function handleConnect() {
    setActionError(null);
    setConnecting(true);
    try {
      const result = await connectContaAzul(companyId);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setConnecting(false);
      setActionError(
        error instanceof ContaAzulRequestError
          ? error.message
          : 'Não foi possível iniciar a conexão com a Conta Azul.',
      );
    }
  }

  async function handleVerify() {
    setActionError(null);
    setVerifying(true);
    try {
      const status = await verifyContaAzul(companyId);
      setIntegration(status);
      if (status.status === 'ERROR') {
        setFlash(null);
      } else {
        setFlash({ text: 'Conexão com a Conta Azul verificada.', tone: 'success' });
      }
    } catch (error) {
      setActionError(
        error instanceof ContaAzulRequestError
          ? error.message
          : 'Não foi possível verificar a conexão com a Conta Azul.',
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleSync() {
    setActionError(null);
    setFlash(null);
    setSyncing(true);
    try {
      const accepted = await startContaAzulSync(companyId);
      setSyncRun({
        id: accepted.syncRunId,
        status: 'PENDING',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        counts: null,
        errorCode: null,
      });
    } catch (error) {
      setSyncing(false);
      if (error instanceof ContaAzulRequestError && error.kind === 'conflict') {
        setActionError('Já existe uma sincronização em andamento.');
        const current = await getCurrentContaAzulSync(companyId).catch(() => null);
        setSyncRun(current);
        return;
      }
      setActionError(
        error instanceof ContaAzulRequestError
          ? error.message
          : 'Não foi possível iniciar a sincronização.',
      );
    }
  }

  async function handleDisconnect() {
    setActionError(null);
    setDisconnecting(true);
    try {
      const status = await disconnectContaAzul(companyId);
      setIntegration(status);
      setConfirmDisconnect(false);
      setFlash({ text: 'A sincronização com a Conta Azul foi interrompida.', tone: 'success' });
    } catch (error) {
      setActionError(
        error instanceof ContaAzulRequestError
          ? error.message
          : 'Não foi possível desconectar a Conta Azul.',
      );
    } finally {
      setDisconnecting(false);
    }
  }

  const wrapperState =
    loadState === 'ready' ? 'ready' : loadState === 'loading' ? 'loading' : 'error';
  const errorMessage =
    loadState === 'not_found'
      ? 'Empresa não encontrada.'
      : 'Não foi possível carregar as integrações.';
  const canManageConnection = integration && integration.status !== 'DISCONNECTED';
  const syncInProgress = isActiveSync(syncRun);
  const connected = integration?.status === 'CONNECTED';
  const summary = countsSummary(syncRun);

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      {loadState !== 'ready' || !integration ? (
        <StateWrapper
          state={wrapperState === 'ready' ? 'error' : wrapperState}
          errorMessage={errorMessage}
          loadingLabel="Carregando integrações"
          onRetry={loadState === 'not_found' ? undefined : () => void load()}
          align="start"
        />
      ) : (
        <Card className={styles.integrationCard} data-testid="conta-azul-card">
          <div className={styles.integrationHeader}>
            <div>
              <Typography as="h2" variant="heading">
                Conta Azul
              </Typography>
              <Typography as="p" variant="body" className={styles.pageDescription}>
                Conecte esta empresa ao Conta Azul para sincronizar os dados financeiros.
              </Typography>
            </div>
            <Badge variant={statusLabel(integration.status).variant}>
              {statusLabel(integration.status).label}
            </Badge>
          </div>

          {flash ? (
            <Typography
              as="p"
              variant="body"
              className={styles.integrationStatusMessage}
              data-tone={flash.tone}
              role="status"
            >
              {flash.text}
            </Typography>
          ) : null}

          {actionError ? (
            <Typography as="p" variant="body" className={styles.formError} role="alert">
              {actionError}
            </Typography>
          ) : null}

          {integration.status === 'DISCONNECTED' ? (
            <Typography as="p" variant="body" className={styles.pageDescription}>
              {autoSyncStatusLabel(integration)}
            </Typography>
          ) : null}

          {canManageConnection ? (
            <div className={styles.integrationMeta}>
              {integration.externalCompanyName ? (
                <Typography as="p" variant="body">
                  Empresa conectada: {integration.externalCompanyName}
                </Typography>
              ) : null}
              {integration.externalAccountId ? (
                <Typography as="p" variant="body" className={styles.pageDescription}>
                  Identificador: {integration.externalAccountId}
                </Typography>
              ) : null}
              {integration.connectedAt ? (
                <Typography as="p" variant="body" className={styles.pageDescription}>
                  Conectada em: {formatCompanyDate(integration.connectedAt)}
                </Typography>
              ) : null}
              <Typography as="p" variant="body" className={styles.pageDescription}>
                Última sincronização: {syncLabel(integration.lastSuccessfulSyncAt)}
              </Typography>
              <Typography as="p" variant="body" className={styles.pageDescription}>
                {autoSyncStatusLabel(integration)}
              </Typography>
              {autoSyncFrequencyLabel(integration) ? (
                <Typography as="p" variant="body" className={styles.pageDescription}>
                  {autoSyncFrequencyLabel(integration)}
                </Typography>
              ) : null}
              {syncInProgress ? (
                <Typography as="p" variant="body" className={styles.pageDescription} role="status">
                  Sincronização em andamento
                </Typography>
              ) : null}
              {summary ? (
                <Typography as="p" variant="body" className={styles.pageDescription}>
                  {summary}
                </Typography>
              ) : null}
            </div>
          ) : null}

          {integration.status === 'ERROR' ? (
            <Typography as="p" variant="body" className={styles.pageDescription}>
              {contaAzulErrorMessage(integration.lastErrorCode)}
              {integration.lastErrorAt
                ? ` Último erro em ${formatCompanyDate(integration.lastErrorAt)}.`
                : ''}
            </Typography>
          ) : null}

          {confirmDisconnect ? (
            <div
              className={styles.appearanceConfirm}
              role="group"
              aria-label="Confirmar desconexão"
            >
              <Typography as="p" variant="body">
                A sincronização com a Conta Azul será interrompida.
              </Typography>
              <div className={styles.integrationActions}>
                <Button
                  type="button"
                  variant="danger"
                  loading={disconnecting}
                  onClick={() => void handleDisconnect()}
                >
                  Confirmar desconexão
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disconnecting}
                  onClick={() => setConfirmDisconnect(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.integrationActions}>
              <Button
                type="button"
                variant="primary"
                loading={connecting}
                onClick={() => void handleConnect()}
              >
                {integration.status === 'DISCONNECTED' ? 'Conectar Conta Azul' : 'Reconectar'}
              </Button>
              {canManageConnection ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={verifying}
                  disabled={connecting || syncInProgress}
                  onClick={() => void handleVerify()}
                >
                  Verificar conexão
                </Button>
              ) : null}
              {connected ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={syncing || syncInProgress}
                  disabled={connecting || verifying || syncInProgress}
                  onClick={() => void handleSync()}
                >
                  Sincronizar agora
                </Button>
              ) : null}
              {canManageConnection ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={connecting || syncInProgress}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Desconectar
                </Button>
              ) : null}
            </div>
          )}
        </Card>
      )}
    </CompanySectionNav>
  );
}
