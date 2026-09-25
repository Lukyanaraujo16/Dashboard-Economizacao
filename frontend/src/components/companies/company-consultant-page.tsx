'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import {
  consultantKnowledgeUserMessage,
  createTenantConsultantKnowledge,
  defaultModelForProvider,
  deleteTenantConsultantKnowledge,
  getConsultantOptions,
  getTenantConsultant,
  isValidProviderModel,
  listConsultantProviders,
  listTenantConsultantKnowledge,
  modelsForProvider,
  updateTenantConsultant,
  updateTenantConsultantKnowledge,
} from '../../services/admin/consultant';
import {
  ConsultantRequestError,
  type ConsultantKnowledgeEntry,
  type ConsultantOptions,
  type ConsultantProviderId,
  type ConsultantProviderStatus,
  type ConsultantSettings,
  type ConsultantStatus,
} from '../../services/admin/consultant.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, Typography } from '../ui';
import { CompanySectionNav } from './company-section-nav';
import { ConsultantManagementOverview } from './consultant-management-overview';
import { EMPTY_KNOWLEDGE_DRAFT, type KnowledgeDraft } from './consultant-knowledge-panel';
import { ConsultantSetupEmpty } from './consultant-setup-empty';
import { ConsultantSetupSuccess } from './consultant-setup-success';
import {
  ConsultantSetupWizard,
  type ConsultantWizardDraft,
} from './consultant-setup-wizard';
import {
  isWizardDraftDirty,
  type ConsultantSuccessKind,
  type ConsultantWizardStepId,
} from './consultant-setup-copy';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

type CompanyConsultantPageProps = {
  readonly companyId: string;
};

type PageView = 'empty' | 'wizard' | 'overview' | 'success';

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function firstProvider(options: ConsultantOptions): ConsultantProviderId {
  return options.providers[0]?.id ?? 'OPENAI';
}

function draftFromSettings(
  settings: ConsultantSettings,
  options: ConsultantOptions,
): ConsultantWizardDraft {
  const provider =
    settings.provider && options.providers.some((item) => item.id === settings.provider)
      ? settings.provider
      : firstProvider(options);
  const model =
    settings.model && isValidProviderModel(options, provider, settings.model)
      ? settings.model
      : defaultModelForProvider(options, provider);

  return {
    provider,
    model,
    consultantName: settings.consultantName ?? '',
    businessSegment: settings.businessSegment ?? '',
    businessDescription: settings.businessDescription ?? '',
    adminPrompt: settings.adminPrompt ?? '',
    tonePreset: settings.tonePreset ?? 'PROFISSIONAL_OBJETIVO',
    tone: settings.tone ?? '',
    emojiPreference: settings.emojiPreference ?? 'MODERATE',
  };
}

function emptyDraft(options: ConsultantOptions): ConsultantWizardDraft {
  const provider = firstProvider(options);
  return {
    provider,
    model: defaultModelForProvider(options, provider),
    consultantName: '',
    businessSegment: '',
    businessDescription: '',
    adminPrompt: '',
    tonePreset: 'PROFISSIONAL_OBJETIVO',
    tone: '',
    emojiPreference: 'MODERATE',
  };
}

function activationCredentialMessage(provider: ConsultantProviderId): string {
  return provider === 'ANTHROPIC'
    ? 'Configure uma credencial da Anthropic antes de ativar este Consultor.'
    : 'Configure uma credencial da OpenAI antes de ativar este Consultor.';
}

export function CompanyConsultantPage({ companyId }: CompanyConsultantPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [options, setOptions] = useState<ConsultantOptions | null>(null);
  const [settings, setSettings] = useState<ConsultantSettings | null>(null);
  const [knowledge, setKnowledge] = useState<readonly ConsultantKnowledgeEntry[]>([]);
  const [providers, setProviders] = useState<readonly ConsultantProviderStatus[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading');
  const [knowledgeLoadError, setKnowledgeLoadError] = useState<string | null>(null);

  const [view, setView] = useState<PageView>('empty');
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create');
  const [step, setStep] = useState<ConsultantWizardStepId>(1);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<ConsultantWizardDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<ConsultantWizardDraft | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [successKind, setSuccessKind] = useState<ConsultantSuccessKind | null>(null);
  const [successName, setSuccessName] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(EMPTY_KNOWLEDGE_DRAFT);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const applyLoaded = useCallback((next: ConsultantSettings, catalog: ConsultantOptions) => {
    setSettings(next);
    setDraft(draftFromSettings(next, catalog));
    setBaselineDraft(null);
    setDiscardOpen(false);
    setSuccessKind(null);
    setView(next.configured ? 'overview' : 'empty');
    setWizardMode('create');
    setStep(1);
    setReviewing(false);
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    setKnowledgeLoadError(null);
    try {
      const [company, catalog, current, providerList] = await Promise.all([
        getCompany(companyId),
        getConsultantOptions(),
        getTenantConsultant(companyId),
        listConsultantProviders().catch(() => [] as readonly ConsultantProviderStatus[]),
      ]);
      setCompanyName(company.displayName);
      setOptions(catalog);
      setProviders(providerList);
      applyLoaded(current, catalog);

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
  }, [applyLoaded, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerModels = useMemo(() => {
    if (!options || !draft) {
      return [];
    }
    return modelsForProvider(options, draft.provider);
  }, [draft, options]);

  function handleDraftChange(next: ConsultantWizardDraft) {
    if (!options) {
      return;
    }
    if (next.provider !== draft?.provider) {
      const model = isValidProviderModel(options, next.provider, next.model)
        ? next.model
        : defaultModelForProvider(options, next.provider);
      setDraft({ ...next, model });
    } else {
      setDraft(next);
    }
    setFormError(null);
    setSuccessMessage(null);
  }

  function openCreateWizard() {
    if (!options) {
      return;
    }
    const nextDraft = emptyDraft(options);
    setWizardMode('create');
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setDiscardOpen(false);
    setSuccessKind(null);
    setStep(1);
    setReviewing(false);
    setFormError(null);
    setSuccessMessage(null);
    setView('wizard');
  }

  function openEditWizard(nextStep: ConsultantWizardStepId = 1) {
    if (!options || !settings) {
      return;
    }
    const nextDraft = draftFromSettings(settings, options);
    setWizardMode('edit');
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setDiscardOpen(false);
    setSuccessKind(null);
    setStep(nextStep);
    setReviewing(false);
    setFormError(null);
    setSuccessMessage(null);
    setView('wizard');
  }

  function closeWizard() {
    if (!settings || !options) {
      return;
    }
    applyLoaded(settings, options);
  }

  function requestCloseWizard() {
    if (draft && baselineDraft && isWizardDraftDirty(draft, baselineDraft)) {
      setDiscardOpen(true);
      return;
    }
    closeWizard();
  }

  function confirmDiscard() {
    setDiscardOpen(false);
    closeWizard();
  }

  async function persistSettings(
    status: ConsultantStatus,
    destination: 'success' | 'overview' = 'success',
  ) {
    if (saving || !options || !draft) {
      return;
    }
    if (!isValidProviderModel(options, draft.provider, draft.model)) {
      setFormError('Selecione um modelo válido para o provedor.');
      return;
    }
    if (status === 'ACTIVE') {
      const providerState = providers.find((item) => item.provider === draft.provider);
      if (providerState && !providerState.configured) {
        setFormError(activationCredentialMessage(draft.provider));
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);
    try {
      const saved = await updateTenantConsultant(companyId, {
        status,
        provider: draft.provider,
        model: draft.model,
        consultantName: emptyToNull(draft.consultantName),
        businessSegment: emptyToNull(draft.businessSegment),
        businessDescription: emptyToNull(draft.businessDescription),
        adminPrompt: emptyToNull(draft.adminPrompt),
        tonePreset: draft.tonePreset,
        tone: draft.tonePreset === 'PERSONALIZADO' ? emptyToNull(draft.tone) : null,
        emojiPreference: draft.emojiPreference,
      });
      setSettings(saved);
      const nextDraft = draftFromSettings(saved, options);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      setReviewing(false);
      setDiscardOpen(false);
      if (destination === 'success') {
        const kind: ConsultantSuccessKind =
          wizardMode === 'create'
            ? status === 'ACTIVE'
              ? 'created-active'
              : 'created-disabled'
            : status === 'ACTIVE'
              ? 'edited-active'
              : 'edited-disabled';
        setSuccessKind(kind);
        setSuccessName(saved.consultantName ?? draft.consultantName);
        setSuccessMessage(null);
        setView('success');
      } else {
        setSuccessKind(null);
        setView('overview');
        setSuccessMessage(
          status === 'ACTIVE' ? 'Consultor ativado.' : 'Configuração do consultor salva.',
        );
      }
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

  async function handleToggleStatus() {
    if (!settings || settings.status === 'NOT_CONFIGURED') {
      return;
    }
    if (!draft) {
      return;
    }
    await persistSettings(settings.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', 'overview');
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
        const created = await createTenantConsultantKnowledge(companyId, { title, content });
        setKnowledge((current) => [created, ...current]);
        setKnowledgeSuccess('Conhecimento adicionado');
      }
      setEditingEntryId(null);
      setKnowledgeDraft(EMPTY_KNOWLEDGE_DRAFT);
    } catch (error) {
      setKnowledgeError(
        error instanceof ConsultantRequestError
          ? consultantKnowledgeUserMessage(error, 'Não foi possível salvar o conhecimento.')
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
          ? consultantKnowledgeUserMessage(error, 'Não foi possível atualizar o conhecimento.')
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
          ? consultantKnowledgeUserMessage(error, 'Não foi possível excluir o conhecimento.')
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
  const selectedProvider =
    providers.find((item) => item.provider === (settings?.provider ?? draft?.provider)) ?? null;

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      {loadState !== 'ready' || !options || !settings || !draft ? (
        <StateWrapper
          state={wrapperState === 'ready' ? 'error' : wrapperState}
          errorMessage={errorMessage}
          loadingLabel="Carregando consultor"
          onRetry={loadState === 'not_found' ? undefined : () => void load()}
          align="start"
        />
      ) : (
        <div>
          {view === 'overview' ? (
            <div className={styles.formIntro}>
              <Typography as="h2" variant="heading">
                Consultor Financeiro
              </Typography>
            </div>
          ) : null}

          {view === 'empty' ? <ConsultantSetupEmpty onCreate={openCreateWizard} /> : null}

          {view === 'overview' ? (
            <ConsultantManagementOverview
              companyName={companyName ?? 'esta empresa'}
              settings={settings}
              knowledge={knowledge}
              providerStatus={selectedProvider}
              saving={saving}
              formError={formError}
              successMessage={successMessage}
              onEdit={openEditWizard}
              onToggleStatus={() => void handleToggleStatus()}
            />
          ) : null}

          {view === 'success' && successKind ? (
            <ConsultantSetupSuccess
              kind={successKind}
              consultantName={successName}
              companyName={companyName ?? 'esta empresa'}
              onGoToConsultant={() => {
                setSuccessKind(null);
                setView('overview');
              }}
              onReview={
                successKind === 'created-active' || successKind === 'edited-active'
                  ? () => openEditWizard()
                  : undefined
              }
            />
          ) : null}

          {view === 'wizard' ? (
            <ConsultantSetupWizard
              mode={wizardMode}
              companyName={companyName ?? 'esta empresa'}
              currentStatus={settings.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED'}
              step={step}
              reviewing={reviewing}
              draft={draft}
              options={options}
              providerModels={providerModels}
              knowledge={knowledge}
              knowledgeDraft={knowledgeDraft}
              editingEntryId={editingEntryId}
              knowledgeBusy={knowledgeBusy}
              knowledgeError={knowledgeError}
              knowledgeSuccess={knowledgeSuccess}
              knowledgeLoadError={knowledgeLoadError}
              pendingDeleteId={pendingDeleteId}
              saving={saving}
              formError={formError}
              onStepChange={(next) => {
                setStep(next);
                setReviewing(false);
              }}
              onDraftChange={handleDraftChange}
              onReview={() => setReviewing(true)}
              onBackFromReview={() => setReviewing(false)}
              onCancel={requestCloseWizard}
              onSave={(status) => void persistSettings(status)}
              onKnowledgeDraftChange={setKnowledgeDraft}
              onKnowledgeSubmit={(event) => void handleSaveKnowledge(event)}
              onKnowledgeStartCreate={startCreateKnowledge}
              onKnowledgeStartEdit={startEditKnowledge}
              onKnowledgeToggle={(entry) => void handleToggleKnowledge(entry)}
              onKnowledgeAskDelete={setPendingDeleteId}
              onKnowledgeConfirmDelete={(entryId) => void handleDeleteKnowledge(entryId)}
              onKnowledgeDismissSuccess={() => setKnowledgeSuccess(null)}
            />
          ) : null}

          {discardOpen ? (
            <div className={localStyles.discardBackdrop}>
              <div
                className={localStyles.discardDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="consultant-discard-title"
                data-testid="consultant-discard-dialog"
              >
                <div>
                  <Typography as="h2" variant="heading" id="consultant-discard-title">
                    Descartar alterações?
                  </Typography>
                  <Typography as="p" variant="body" className={styles.pageDescription}>
                    Você fez alterações que ainda não foram salvas.
                  </Typography>
                </div>
                <div className={localStyles.discardActions}>
                  <Button type="button" variant="ghost" onClick={() => setDiscardOpen(false)}>
                    Continuar editando
                  </Button>
                  <Button type="button" variant="primary" onClick={confirmDiscard}>
                    Descartar alterações
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </CompanySectionNav>
  );
}
