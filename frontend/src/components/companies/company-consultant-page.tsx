'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import {
  createTenantConsultantKnowledge,
  defaultModelForProvider,
  deleteTenantConsultantKnowledge,
  getConsultantOptions,
  getTenantConsultant,
  isValidProviderModel,
  listTenantConsultantKnowledge,
  modelsForProvider,
  updateTenantConsultant,
  updateTenantConsultantKnowledge,
} from '../../services/admin/consultant';
import {
  CONSULTANT_FIELD_LIMITS,
  ConsultantRequestError,
  type ConsultantKnowledgeEntry,
  type ConsultantOptions,
  type ConsultantProviderId,
  type ConsultantSettings,
  type ConsultantStatus,
  type ConsultantTonePreset,
} from '../../services/admin/consultant.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Badge, Button, FormField, Input, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import { CompanySectionNav } from './company-section-nav';
import { formatCompanyDate } from './company-utils';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

type CompanyConsultantPageProps = {
  readonly companyId: string;
};

type KnowledgeDraft = {
  readonly title: string;
  readonly content: string;
};

const EMPTY_KNOWLEDGE_DRAFT: KnowledgeDraft = { title: '', content: '' };

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function firstProvider(options: ConsultantOptions): ConsultantProviderId {
  return options.providers[0]?.id ?? 'OPENAI';
}

function resolveDraftFromSettings(
  settings: ConsultantSettings,
  options: ConsultantOptions,
): {
  status: ConsultantStatus;
  provider: ConsultantProviderId;
  model: string;
  consultantName: string;
  businessSegment: string;
  businessDescription: string;
  adminPrompt: string;
  tonePreset: ConsultantTonePreset;
  tone: string;
} {
  const provider =
    settings.provider && options.providers.some((item) => item.id === settings.provider)
      ? settings.provider
      : firstProvider(options);
  const model =
    settings.model && isValidProviderModel(options, provider, settings.model)
      ? settings.model
      : defaultModelForProvider(options, provider);

  return {
    status: settings.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED',
    provider,
    model,
    consultantName: settings.consultantName ?? '',
    businessSegment: settings.businessSegment ?? '',
    businessDescription: settings.businessDescription ?? '',
    adminPrompt: settings.adminPrompt ?? '',
    tonePreset: settings.tonePreset ?? 'PROFISSIONAL_OBJETIVO',
    tone: settings.tone ?? '',
  };
}

function NativeSelect({
  invalid = false,
  className,
  ...rest
}: { readonly invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(localStyles.control, invalid && localStyles.controlInvalid, className)}
    />
  );
}

function NativeTextarea({
  invalid = false,
  className,
  ...rest
}: { readonly invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(
        localStyles.control,
        localStyles.textarea,
        invalid && localStyles.controlInvalid,
        className,
      )}
    />
  );
}

export function CompanyConsultantPage({ companyId }: CompanyConsultantPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [options, setOptions] = useState<ConsultantOptions | null>(null);
  const [settings, setSettings] = useState<ConsultantSettings | null>(null);
  const [knowledge, setKnowledge] = useState<readonly ConsultantKnowledgeEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading');
  const [knowledgeLoadError, setKnowledgeLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<ConsultantStatus>('DISABLED');
  const [provider, setProvider] = useState<ConsultantProviderId>('OPENAI');
  const [model, setModel] = useState('');
  const [consultantName, setConsultantName] = useState('');
  const [businessSegment, setBusinessSegment] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [adminPrompt, setAdminPrompt] = useState('');
  const [tonePreset, setTonePreset] = useState<ConsultantTonePreset>('PROFISSIONAL_OBJETIVO');
  const [tone, setTone] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(EMPTY_KNOWLEDGE_DRAFT);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const applySettings = useCallback((next: ConsultantSettings, catalog: ConsultantOptions) => {
    const draft = resolveDraftFromSettings(next, catalog);
    setSettings(next);
    setStatus(draft.status);
    setProvider(draft.provider);
    setModel(draft.model);
    setConsultantName(draft.consultantName);
    setBusinessSegment(draft.businessSegment);
    setBusinessDescription(draft.businessDescription);
    setAdminPrompt(draft.adminPrompt);
    setTonePreset(draft.tonePreset);
    setTone(draft.tone);
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    setKnowledgeLoadError(null);
    try {
      const [company, catalog, current] = await Promise.all([
        getCompany(companyId),
        getConsultantOptions(),
        getTenantConsultant(companyId),
      ]);
      setCompanyName(company.displayName);
      setOptions(catalog);
      applySettings(current, catalog);

      try {
        const entries = await listTenantConsultantKnowledge(companyId);
        setKnowledge(entries);
      } catch {
        setKnowledge([]);
        setKnowledgeLoadError('Não foi possível carregar o conhecimento desta empresa.');
      }

      setLoadState('ready');
    } catch (error) {
      if (
        (error instanceof CompaniesRequestError || error instanceof ConsultantRequestError) &&
        error.kind === 'not_found'
      ) {
        setLoadState('not_found');
        return;
      }
      setLoadState('error');
    }
  }, [applySettings, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerModels = useMemo(
    () => (options ? modelsForProvider(options, provider) : []),
    [options, provider],
  );

  function handleProviderChange(nextProvider: ConsultantProviderId) {
    if (!options) {
      return;
    }
    setProvider(nextProvider);
    setModel(defaultModelForProvider(options, nextProvider));
    setFormError(null);
    setSuccessMessage(null);
  }

  function handleModelChange(nextModel: string) {
    if (!options || !isValidProviderModel(options, provider, nextModel)) {
      return;
    }
    setModel(nextModel);
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !options) {
      return;
    }
    if (!isValidProviderModel(options, provider, model)) {
      setFormError('Selecione um modelo válido para o provedor.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const saved = await updateTenantConsultant(companyId, {
        status,
        provider,
        model,
        consultantName: emptyToNull(consultantName),
        businessSegment: emptyToNull(businessSegment),
        businessDescription: emptyToNull(businessDescription),
        adminPrompt: emptyToNull(adminPrompt),
        tonePreset,
        tone: tonePreset === 'PERSONALIZADO' ? emptyToNull(tone) : null,
      });
      applySettings(saved, options);
      setSuccessMessage('Configuração do consultor salva.');
    } catch (error) {
      setFormError(
        error instanceof ConsultantRequestError
          ? error.message
          : 'Não foi possível salvar a configuração do consultor.',
      );
    } finally {
      setSaving(false);
    }
  }

  function startCreateKnowledge() {
    setEditingEntryId(null);
    setKnowledgeDraft(EMPTY_KNOWLEDGE_DRAFT);
    setPendingDeleteId(null);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
  }

  function startEditKnowledge(entry: ConsultantKnowledgeEntry) {
    setEditingEntryId(entry.id);
    setKnowledgeDraft({ title: entry.title, content: entry.content });
    setPendingDeleteId(null);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
  }

  async function handleSaveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (knowledgeBusy) {
      return;
    }

    const title = knowledgeDraft.title.trim();
    const content = knowledgeDraft.content.trim();
    if (!title || !content) {
      setKnowledgeError('Informe título e conteúdo do conhecimento.');
      return;
    }

    setKnowledgeBusy(true);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);

    try {
      if (editingEntryId) {
        const updated = await updateTenantConsultantKnowledge(companyId, editingEntryId, {
          title,
          content,
        });
        setKnowledge((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setKnowledgeSuccess('Conhecimento atualizado.');
      } else {
        const created = await createTenantConsultantKnowledge(companyId, {
          title,
          content,
          contentType: 'TEXT',
          status: 'ACTIVE',
        });
        setKnowledge((current) => [created, ...current]);
        setKnowledgeSuccess('Conhecimento criado para esta empresa.');
      }
      setEditingEntryId(null);
      setKnowledgeDraft(EMPTY_KNOWLEDGE_DRAFT);
    } catch (error) {
      setKnowledgeError(
        error instanceof ConsultantRequestError
          ? error.message
          : 'Não foi possível salvar o conhecimento.',
      );
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function handleToggleKnowledge(entry: ConsultantKnowledgeEntry) {
    if (knowledgeBusy) {
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
    setPendingDeleteId(null);
    try {
      const updated = await updateTenantConsultantKnowledge(companyId, entry.id, {
        status: entry.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      });
      setKnowledge((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setKnowledgeSuccess(
        updated.status === 'ACTIVE' ? 'Conhecimento ativado.' : 'Conhecimento desativado.',
      );
    } catch (error) {
      setKnowledgeError(
        error instanceof ConsultantRequestError
          ? error.message
          : 'Não foi possível atualizar o conhecimento.',
      );
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function handleDeleteKnowledge(entryId: string) {
    if (knowledgeBusy) {
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
    try {
      await deleteTenantConsultantKnowledge(companyId, entryId);
      setKnowledge((current) => current.filter((item) => item.id !== entryId));
      if (editingEntryId === entryId) {
        setEditingEntryId(null);
        setKnowledgeDraft(EMPTY_KNOWLEDGE_DRAFT);
      }
      setPendingDeleteId(null);
      setKnowledgeSuccess('Conhecimento excluído.');
    } catch (error) {
      setKnowledgeError(
        error instanceof ConsultantRequestError
          ? error.message
          : 'Não foi possível excluir o conhecimento.',
      );
    } finally {
      setKnowledgeBusy(false);
    }
  }

  const wrapperState =
    loadState === 'ready' ? 'ready' : loadState === 'loading' ? 'loading' : 'error';
  const errorMessage =
    loadState === 'not_found'
      ? 'Empresa não encontrada.'
      : 'Não foi possível carregar o consultor.';
  const canSave = Boolean(options && model && isValidProviderModel(options, provider, model));

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      {loadState !== 'ready' || !options || !settings ? (
        <StateWrapper
          state={wrapperState === 'ready' ? 'error' : wrapperState}
          errorMessage={errorMessage}
          loadingLabel="Carregando consultor"
          onRetry={loadState === 'not_found' ? undefined : () => void load()}
          align="start"
        />
      ) : (
        <div className={localStyles.page}>
          <div className={styles.formIntro}>
            <Typography as="h2" variant="heading">
              Consultor Financeiro
            </Typography>
            <Typography as="p" variant="body" className={styles.formDescription}>
              OpenAI e Anthropic são provedores do mesmo consultor. A troca de provedor não cria
              outro agente — apenas altera o motor usado por este consultor nesta empresa.
            </Typography>
          </div>

          <form
            className={styles.formCard}
            data-testid="consultant-settings-form"
            onSubmit={(event) => void handleSaveSettings(event)}
            noValidate
          >
            <FormField label="Status" htmlFor="consultant-status">
              <NativeSelect
                id="consultant-status"
                name="status"
                value={status}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'ACTIVE' || value === 'DISABLED') {
                    setStatus(value);
                    setSuccessMessage(null);
                  }
                }}
              >
                <option value="ACTIVE">Habilitado</option>
                <option value="DISABLED">Desabilitado</option>
              </NativeSelect>
            </FormField>

            <FormField
              label="Provedor"
              htmlFor="consultant-provider"
              hint="OpenAI e Anthropic alimentam o mesmo consultor."
            >
              <NativeSelect
                id="consultant-provider"
                name="provider"
                value={provider}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'OPENAI' || value === 'ANTHROPIC') {
                    handleProviderChange(value);
                  }
                }}
              >
                {options.providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Modelo" htmlFor="consultant-model">
              <NativeSelect
                id="consultant-model"
                name="model"
                value={model}
                onChange={(event) => handleModelChange(event.target.value)}
              >
                {providerModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField
              label="Nome do consultor"
              htmlFor="consultant-name"
              hint="Aparece no chat desta empresa. Vazio usa “Consultor”."
            >
              <Input
                id="consultant-name"
                name="consultantName"
                value={consultantName}
                maxLength={CONSULTANT_FIELD_LIMITS.consultantName}
                placeholder="Consultor"
                onChange={(event) => setConsultantName(event.target.value)}
              />
            </FormField>

            <FormField label="Ramo" htmlFor="consultant-segment">
              <Input
                id="consultant-segment"
                name="businessSegment"
                value={businessSegment}
                maxLength={CONSULTANT_FIELD_LIMITS.businessSegment}
                onChange={(event) => setBusinessSegment(event.target.value)}
              />
            </FormField>

            <FormField label="Descrição" htmlFor="consultant-description">
              <NativeTextarea
                id="consultant-description"
                name="businessDescription"
                value={businessDescription}
                maxLength={CONSULTANT_FIELD_LIMITS.businessDescription}
                onChange={(event) => setBusinessDescription(event.target.value)}
              />
            </FormField>

            <FormField
              label="Prompt administrativo"
              htmlFor="consultant-admin-prompt"
              hint="Instrução interna do consultor desta empresa. Não é visível para o usuário final."
            >
              <NativeTextarea
                id="consultant-admin-prompt"
                name="adminPrompt"
                value={adminPrompt}
                maxLength={CONSULTANT_FIELD_LIMITS.adminPrompt}
                onChange={(event) => setAdminPrompt(event.target.value)}
              />
            </FormField>

            <FormField
              label="Tom"
              htmlFor="consultant-tone-preset"
              hint="O texto de cada tom é definido pelo servidor. Personalizado aceita instrução própria."
            >
              <NativeSelect
                id="consultant-tone-preset"
                name="tonePreset"
                value={tonePreset}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === 'PROFISSIONAL_OBJETIVO' ||
                    value === 'CONSULTIVO' ||
                    value === 'DIDATICO' ||
                    value === 'AMIGAVEL' ||
                    value === 'EXECUTIVO' ||
                    value === 'PERSONALIZADO'
                  ) {
                    setTonePreset(value);
                    setSuccessMessage(null);
                  }
                }}
              >
                {(options.tonePresets.length > 0
                  ? options.tonePresets
                  : [
                      { id: 'PROFISSIONAL_OBJETIVO' as const, label: 'Profissional e objetivo' },
                      { id: 'CONSULTIVO' as const, label: 'Consultivo' },
                      { id: 'DIDATICO' as const, label: 'Didático' },
                      { id: 'AMIGAVEL' as const, label: 'Amigável' },
                      { id: 'EXECUTIVO' as const, label: 'Executivo' },
                      { id: 'PERSONALIZADO' as const, label: 'Personalizado' },
                    ]
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            {tonePreset === 'PERSONALIZADO' ? (
              <FormField label="Tom personalizado" htmlFor="consultant-tone">
                <NativeTextarea
                  id="consultant-tone"
                  name="tone"
                  value={tone}
                  maxLength={CONSULTANT_FIELD_LIMITS.tone}
                  onChange={(event) => setTone(event.target.value)}
                />
              </FormField>
            ) : null}

            {formError ? (
              <Typography as="p" variant="body" className={styles.formError} role="alert">
                {formError}
              </Typography>
            ) : null}

            {successMessage ? (
              <Typography as="p" variant="body" className={styles.formSuccess} role="status">
                {successMessage}
              </Typography>
            ) : null}

            <div className={styles.formActions}>
              <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
                Salvar configuração
              </Button>
            </div>
          </form>

          <section className={styles.appearanceSection} data-testid="consultant-knowledge">
            <div className={styles.appearanceSectionHeader}>
              <Typography as="h3" variant="heading">
                Conhecimento da empresa
              </Typography>
              <Typography as="p" variant="body" className={styles.pageDescription}>
                Conhecimento textual ativo só nesta empresa. Arquivos (PDF, DOCX, TXT) ficam
                para a próxima subfase — não há upload nem busca semântica agora.
                É válido deixar a lista vazia.
              </Typography>
            </div>

            {knowledgeLoadError ? (
              <Typography as="p" variant="body" className={styles.formError} role="alert">
                {knowledgeLoadError}
              </Typography>
            ) : null}

            <form
              className={styles.formCard}
              data-testid="consultant-knowledge-form"
              onSubmit={(event) => void handleSaveKnowledge(event)}
              noValidate
            >
              <Typography as="h4" variant="label">
                {editingEntryId ? 'Editar conhecimento' : 'Novo conhecimento'}
              </Typography>
              <FormField label="Título" htmlFor="consultant-knowledge-title">
                <Input
                  id="consultant-knowledge-title"
                  name="knowledgeTitle"
                  value={knowledgeDraft.title}
                  maxLength={CONSULTANT_FIELD_LIMITS.knowledgeTitle}
                  onChange={(event) =>
                    setKnowledgeDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Conteúdo" htmlFor="consultant-knowledge-content">
                <NativeTextarea
                  id="consultant-knowledge-content"
                  name="knowledgeContent"
                  value={knowledgeDraft.content}
                  maxLength={CONSULTANT_FIELD_LIMITS.knowledgeContent}
                  onChange={(event) =>
                    setKnowledgeDraft((current) => ({ ...current, content: event.target.value }))
                  }
                />
              </FormField>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" loading={knowledgeBusy}>
                  {editingEntryId ? 'Salvar conhecimento' : 'Adicionar conhecimento'}
                </Button>
                {editingEntryId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={knowledgeBusy}
                    onClick={startCreateKnowledge}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>

            {knowledgeError ? (
              <Typography as="p" variant="body" className={styles.formError} role="alert">
                {knowledgeError}
              </Typography>
            ) : null}

            {knowledgeSuccess ? (
              <Typography as="p" variant="body" className={styles.formSuccess} role="status">
                {knowledgeSuccess}
              </Typography>
            ) : null}

            {knowledge.length === 0 ? (
              <Typography as="p" variant="body" className={styles.pageDescription}>
                Nenhum conhecimento cadastrado para esta empresa.
              </Typography>
            ) : (
              <div className={localStyles.knowledgeList}>
                {knowledge.map((entry) => (
                  <article key={entry.id} className={styles.companyCard} data-testid={`knowledge-${entry.id}`}>
                    <div className={localStyles.knowledgeHeader}>
                      <div>
                        <Typography as="p" variant="label">
                          {entry.title}
                        </Typography>
                        <Typography as="p" variant="caption" className={styles.pageDescription}>
                          Atualizado em {formatCompanyDate(entry.updatedAt)}
                        </Typography>
                      </div>
                      <Badge variant={entry.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {entry.status === 'ACTIVE' ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </div>
                    <Typography as="p" variant="body" className={localStyles.knowledgeExcerpt}>
                      {entry.content}
                    </Typography>
                    {pendingDeleteId === entry.id ? (
                      <div className={styles.confirmPanel} role="group" aria-label="Confirmar exclusão">
                        <Typography as="p" variant="body">
                          Excluir este conhecimento desta empresa?
                        </Typography>
                        <div className={styles.confirmActions}>
                          <Button
                            type="button"
                            variant="danger"
                            loading={knowledgeBusy}
                            onClick={() => void handleDeleteKnowledge(entry.id)}
                          >
                            Confirmar exclusão
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={knowledgeBusy}
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={knowledgeBusy}
                          onClick={() => startEditKnowledge(entry)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={knowledgeBusy}
                          onClick={() => void handleToggleKnowledge(entry)}
                        >
                          {entry.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={knowledgeBusy}
                          onClick={() => setPendingDeleteId(entry.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </CompanySectionNav>
  );
}
