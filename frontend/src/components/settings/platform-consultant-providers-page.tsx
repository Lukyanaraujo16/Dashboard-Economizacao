'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  deleteConsultantProviderCredential,
  listConsultantProviders,
  putConsultantProviderCredential,
} from '../../services/admin/consultant';
import {
  ConsultantRequestError,
  type ConsultantProviderId,
  type ConsultantProviderStatus,
} from '../../services/admin/consultant.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Badge, Button, FormField, Input, Typography } from '../ui';
import companyStyles from '../companies/companies.module.css';

const PROVIDER_LABEL: Record<ConsultantProviderId, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
};

const PROVIDER_ORDER: readonly ConsultantProviderId[] = ['OPENAI', 'ANTHROPIC'];

function mergeStatuses(
  current: readonly ConsultantProviderStatus[],
): readonly ConsultantProviderStatus[] {
  return PROVIDER_ORDER.map((provider) => {
    const found = current.find((item) => item.provider === provider);
    return found ?? { provider, configured: false };
  });
}

export function PlatformConsultantProvidersPage() {
  const [providers, setProviders] = useState<readonly ConsultantProviderStatus[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [drafts, setDrafts] = useState<Record<ConsultantProviderId, string>>({
    OPENAI: '',
    ANTHROPIC: '',
  });
  const [busyProvider, setBusyProvider] = useState<ConsultantProviderId | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConsultantProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const list = await listConsultantProviders();
      setProviders(mergeStatuses(list));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(provider: ConsultantProviderId, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const credential = drafts[provider].trim();
    if (credential.length === 0 || busyProvider) {
      return;
    }

    setBusyProvider(provider);
    setError(null);
    setSuccess(null);
    try {
      const next = await putConsultantProviderCredential(provider, credential);
      setProviders((current) =>
        mergeStatuses(current.map((item) => (item.provider === next.provider ? next : item))),
      );
      setDrafts((current) => ({ ...current, [provider]: '' }));
      setSuccess(`${PROVIDER_LABEL[provider]} atualizado.`);
    } catch (cause) {
      setError(
        cause instanceof ConsultantRequestError
          ? cause.message
          : 'Não foi possível salvar a credencial.',
      );
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleDelete(provider: ConsultantProviderId) {
    if (busyProvider) {
      return;
    }
    setBusyProvider(provider);
    setError(null);
    setSuccess(null);
    try {
      await deleteConsultantProviderCredential(provider);
      const list = await listConsultantProviders();
      setProviders(mergeStatuses(list));
      setPendingDelete(null);
      setSuccess(`Credencial de ${PROVIDER_LABEL[provider]} removida.`);
    } catch (cause) {
      setError(
        cause instanceof ConsultantRequestError
          ? cause.message
          : 'Não foi possível remover a credencial.',
      );
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <div className={companyStyles.page}>
      <div className={companyStyles.formIntro}>
        <Typography as="h1" variant="heading">
          Credenciais do Consultor
        </Typography>
        <Typography as="p" variant="body" className={companyStyles.formDescription}>
          Chaves globais da plataforma para OpenAI e Anthropic. Elas não pertencem a uma empresa.
          A interface nunca mostra o valor armazenado.
        </Typography>
      </div>

      {loadState !== 'ready' ? (
        <StateWrapper
          state={loadState === 'loading' ? 'loading' : 'error'}
          errorMessage="Não foi possível carregar os provedores de IA."
          loadingLabel="Carregando provedores"
          onRetry={() => void load()}
          align="start"
        />
      ) : (
        <div>
          {providers.map((item) => (
            <section
              key={item.provider}
              className={companyStyles.formCard}
              data-testid={`provider-${item.provider}`}
            >
              <div className={companyStyles.appearanceSectionHeader}>
                <Typography as="h2" variant="heading">
                  {PROVIDER_LABEL[item.provider]}
                </Typography>
                <Badge variant={item.configured ? 'success' : 'neutral'}>
                  {item.configured ? 'Configurado' : 'Não configurado'}
                </Badge>
              </div>

              <form
                onSubmit={(event) => void handleSave(item.provider, event)}
                noValidate
              >
                <FormField
                  label={item.configured ? 'Substituir chave' : 'Cadastrar chave'}
                  htmlFor={`credential-${item.provider}`}
                  hint="O valor digitado some após salvar. Não há botão para mostrar a chave."
                >
                  <Input
                    id={`credential-${item.provider}`}
                    name="credential"
                    type="password"
                    autoComplete="off"
                    value={drafts[item.provider]}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.provider]: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <div className={companyStyles.formActions}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busyProvider === item.provider}
                    disabled={drafts[item.provider].trim().length === 0}
                  >
                    {item.configured ? 'Substituir chave' : 'Salvar chave'}
                  </Button>
                  {item.configured ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busyProvider !== null}
                      onClick={() => setPendingDelete(item.provider)}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>
              </form>

              {pendingDelete === item.provider ? (
                <div className={companyStyles.confirmPanel} role="group" aria-label="Confirmar remoção">
                  <Typography as="p" variant="body">
                    Remover a credencial armazenada de {PROVIDER_LABEL[item.provider]}?
                  </Typography>
                  <div className={companyStyles.confirmActions}>
                    <Button
                      type="button"
                      variant="danger"
                      loading={busyProvider === item.provider}
                      onClick={() => void handleDelete(item.provider)}
                    >
                      Confirmar remoção
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyProvider !== null}
                      onClick={() => setPendingDelete(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ))}

          {error ? (
            <Typography as="p" variant="body" className={companyStyles.formError} role="alert">
              {error}
            </Typography>
          ) : null}
          {success ? (
            <Typography as="p" variant="body" className={companyStyles.formSuccess} role="status">
              {success}
            </Typography>
          ) : null}
        </div>
      )}
    </div>
  );
}
