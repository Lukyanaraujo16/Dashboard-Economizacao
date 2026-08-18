'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import {
  connectContaAzul,
  disconnectContaAzul,
  getContaAzulIntegration,
} from '../../services/admin/conta-azul';
import { ContaAzulRequestError } from '../../services/admin/conta-azul.types';
import type { ContaAzulIntegration } from '../../services/admin/conta-azul.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Badge, Button, Card, Typography } from '../ui';
import { CompanySectionNav } from './company-section-nav';
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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [company, status] = await Promise.all([
        getCompany(companyId),
        getContaAzulIntegration(companyId),
      ]);
      setCompanyName(company.displayName);
      setIntegration(status);
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

          {integration.status === 'ERROR' ? (
            <Typography as="p" variant="body" className={styles.pageDescription}>
              A autorização precisa ser renovada. Reconecte a empresa para continuar.
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
              {integration.status !== 'DISCONNECTED' ? (
                <Button
                  type="button"
                  variant="secondary"
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
