import type { FormEvent, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import {
  CONSULTANT_FIELD_LIMITS,
  type ConsultantEmojiPreference,
  type ConsultantKnowledgeEntry,
  type ConsultantOptions,
  type ConsultantProviderId,
  type ConsultantTonePreset,
} from '../../services/admin/consultant.types';
import { Button, FormField, Input, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import {
  ConsultantKnowledgePanel,
  type KnowledgeDraft,
} from './consultant-knowledge-panel';
import {
  CONSULTANT_WIZARD_STEPS,
  EMOJI_PREFERENCE_DESCRIPTIONS,
  INSTRUCTION_CHIPS,
  KNOWLEDGE_EXAMPLES,
  SEGMENT_EXAMPLES,
  TONE_PRESET_DESCRIPTIONS,
  appendInstructionChip,
  emojiDisplayName,
  providerDisplayName,
  resolveDisplayedConsultantName,
  toneDisplayName,
  type ConsultantWizardStepId,
} from './consultant-setup-copy';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

export type ConsultantWizardDraft = {
  provider: ConsultantProviderId;
  model: string;
  consultantName: string;
  businessSegment: string;
  businessDescription: string;
  adminPrompt: string;
  tonePreset: ConsultantTonePreset;
  tone: string;
  emojiPreference: ConsultantEmojiPreference;
};

type ConsultantSetupWizardProps = {
  readonly mode: 'create' | 'edit';
  readonly companyName: string;
  readonly step: ConsultantWizardStepId;
  readonly reviewing: boolean;
  readonly draft: ConsultantWizardDraft;
  readonly options: ConsultantOptions;
  readonly providerModels: ConsultantOptions['providers'][number]['models'];
  readonly knowledge: readonly ConsultantKnowledgeEntry[];
  readonly knowledgeDraft: KnowledgeDraft;
  readonly editingEntryId: string | null;
  readonly knowledgeBusy: boolean;
  readonly knowledgeError: string | null;
  readonly knowledgeSuccess: string | null;
  readonly knowledgeLoadError: string | null;
  readonly pendingDeleteId: string | null;
  readonly saving: boolean;
  readonly formError: string | null;
  readonly successMessage: string | null;
  readonly onStepChange: (step: ConsultantWizardStepId) => void;
  readonly onDraftChange: (draft: ConsultantWizardDraft) => void;
  readonly onReview: () => void;
  readonly onBackFromReview: () => void;
  readonly onCancel: () => void;
  readonly currentStatus: 'ACTIVE' | 'DISABLED';
  readonly onSave: (status: 'ACTIVE' | 'DISABLED') => void;
  readonly onKnowledgeDraftChange: (draft: KnowledgeDraft) => void;
  readonly onKnowledgeSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onKnowledgeStartCreate: () => void;
  readonly onKnowledgeStartEdit: (entry: ConsultantKnowledgeEntry) => void;
  readonly onKnowledgeToggle: (entry: ConsultantKnowledgeEntry) => void;
  readonly onKnowledgeAskDelete: (entryId: string | null) => void;
  readonly onKnowledgeConfirmDelete: (entryId: string) => void;
};

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

const TONE_ORDER: readonly ConsultantTonePreset[] = [
  'PROFISSIONAL_OBJETIVO',
  'CONSULTIVO',
  'DIDATICO',
  'AMIGAVEL',
  'EXECUTIVO',
  'PERSONALIZADO',
];

const EMOJI_ORDER: readonly ConsultantEmojiPreference[] = ['NONE', 'MODERATE', 'FREE'];

export function ConsultantSetupWizard({
  mode,
  companyName,
  step,
  reviewing,
  draft,
  options,
  providerModels,
  knowledge,
  knowledgeDraft,
  editingEntryId,
  knowledgeBusy,
  knowledgeError,
  knowledgeSuccess,
  knowledgeLoadError,
  pendingDeleteId,
  saving,
  formError,
  successMessage,
  onStepChange,
  onDraftChange,
  onReview,
  onBackFromReview,
  currentStatus,
  onCancel,
  onSave,
  onKnowledgeDraftChange,
  onKnowledgeSubmit,
  onKnowledgeStartCreate,
  onKnowledgeStartEdit,
  onKnowledgeToggle,
  onKnowledgeAskDelete,
  onKnowledgeConfirmDelete,
}: ConsultantSetupWizardProps) {
  const canAdvancePersonality =
    draft.tonePreset !== 'PERSONALIZADO' || draft.tone.trim().length > 0;

  function goNext() {
    if (step === 3 && !canAdvancePersonality) {
      return;
    }
    if (step === 5) {
      onReview();
      return;
    }
    onStepChange((step + 1) as ConsultantWizardStepId);
  }

  function goBack() {
    if (reviewing) {
      onBackFromReview();
      return;
    }
    if (step > 1) {
      onStepChange((step - 1) as ConsultantWizardStepId);
    }
  }

  return (
    <div className={localStyles.wizard} data-testid="consultant-wizard">
      <ol className={localStyles.progress} aria-label="Progresso da configuração">
        {CONSULTANT_WIZARD_STEPS.map((item) => (
          <li key={item.id} className={localStyles.progressItem}>
            <button
              type="button"
              className={localStyles.progressButton}
              data-current={!reviewing && step === item.id}
              aria-current={!reviewing && step === item.id ? 'step' : undefined}
              onClick={() => onStepChange(item.id)}
            >
              {item.id} {item.label}
            </button>
          </li>
        ))}
      </ol>

      {reviewing ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-review">
          <Typography as="h2" variant="heading">
            Seu Consultor está pronto
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            {resolveDisplayedConsultantName(draft.consultantName)} · Consultora financeira da{' '}
            {companyName}
          </Typography>
          <dl className={localStyles.reviewList}>
            <dt>Tom</dt>
            <dd>{toneDisplayName(draft.tonePreset)}</dd>
            <dt>Emojis</dt>
            <dd>{emojiDisplayName(draft.emojiPreference)}</dd>
            <dt>Conhecimentos</dt>
            <dd>
              {knowledge.length} adicionado{knowledge.length === 1 ? '' : 's'}
            </dd>
            <dt>Motor de IA</dt>
            <dd>
              {providerDisplayName(draft.provider)} · {draft.model}
            </dd>
          </dl>
        </section>
      ) : null}

      {!reviewing && step === 1 ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-step-1">
          <Typography as="h2" variant="heading">
            Vamos criar seu Consultor
          </Typography>
          <FormField
            label="Nome do Consultor"
            htmlFor="consultant-name"
            hint="Esse nome aparecerá para os usuários no chat."
          >
            <Input
              id="consultant-name"
              name="consultantName"
              value={draft.consultantName}
              maxLength={CONSULTANT_FIELD_LIMITS.consultantName}
              placeholder="Ex.: Lia"
              onChange={(event) => onDraftChange({ ...draft, consultantName: event.target.value })}
            />
          </FormField>
          <FormField
            label="Segmento da empresa"
            htmlFor="consultant-segment"
            hint="Informe a principal área de atuação da empresa."
          >
            <Input
              id="consultant-segment"
              name="businessSegment"
              value={draft.businessSegment}
              maxLength={CONSULTANT_FIELD_LIMITS.businessSegment}
              placeholder="Ex.: Clínica multidisciplinar"
              onChange={(event) => onDraftChange({ ...draft, businessSegment: event.target.value })}
            />
          </FormField>
          <Typography as="p" variant="caption" className={localStyles.examples}>
            {SEGMENT_EXAMPLES}
          </Typography>
          <FormField
            label="Motor de IA"
            htmlFor="consultant-provider"
            hint="Define qual tecnologia será usada pelo Consultor."
          >
            <NativeSelect
              id="consultant-provider"
              name="provider"
              value={draft.provider}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'OPENAI' || value === 'ANTHROPIC') {
                  onDraftChange({ ...draft, provider: value });
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
              value={draft.model}
              onChange={(event) => onDraftChange({ ...draft, model: event.target.value })}
            >
              {providerModels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </section>
      ) : null}

      {!reviewing && step === 2 ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-step-2">
          <Typography as="h2" variant="heading">
            Conte um pouco sobre a empresa
          </Typography>
          <FormField
            label="Sobre a empresa"
            htmlFor="consultant-description"
            hint="Explique o que a empresa faz, quais produtos ou serviços oferece, quem atende e outras características importantes do negócio."
          >
            <NativeTextarea
              id="consultant-description"
              name="businessDescription"
              className={localStyles.textareaComfortable}
              value={draft.businessDescription}
              maxLength={CONSULTANT_FIELD_LIMITS.businessDescription}
              placeholder="Ex.: Somos uma clínica multidisciplinar que atende crianças e adultos. Trabalhamos com Fonoaudiologia, Psicologia, Psicopedagogia e Terapia Ocupacional. Possuímos duas unidades e atendemos principalmente famílias da região."
              onChange={(event) =>
                onDraftChange({ ...draft, businessDescription: event.target.value })
              }
            />
          </FormField>
          <Typography as="p" variant="caption" className={localStyles.charCount}>
            {draft.businessDescription.length}/{CONSULTANT_FIELD_LIMITS.businessDescription}
          </Typography>
        </section>
      ) : null}

      {!reviewing && step === 3 ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-step-3">
          <Typography as="h2" variant="heading">
            Como o Consultor deve se comunicar?
          </Typography>
          <div role="radiogroup" aria-label="Tom do Consultor" className={localStyles.choiceGrid}>
            {TONE_ORDER.map((preset) => {
              const option = options.tonePresets.find((item) => item.id === preset);
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={draft.tonePreset === preset}
                  data-selected={draft.tonePreset === preset}
                  className={localStyles.choiceCard}
                  onClick={() => onDraftChange({ ...draft, tonePreset: preset })}
                >
                  <Typography as="span" variant="label">
                    {option?.label ?? toneDisplayName(preset)}
                  </Typography>
                  <Typography as="span" variant="caption" className={styles.pageDescription}>
                    {TONE_PRESET_DESCRIPTIONS[preset]}
                  </Typography>
                </button>
              );
            })}
          </div>
          {draft.tonePreset === 'PERSONALIZADO' ? (
            <FormField
              label="Descreva o estilo desejado"
              htmlFor="consultant-tone"
              hint="Explique como você quer que o Consultor se comunique."
              error={
                canAdvancePersonality ? undefined : 'Descreva o estilo personalizado para avançar.'
              }
            >
              <NativeTextarea
                id="consultant-tone"
                name="tone"
                value={draft.tone}
                maxLength={CONSULTANT_FIELD_LIMITS.tone}
                onChange={(event) => onDraftChange({ ...draft, tone: event.target.value })}
              />
            </FormField>
          ) : null}

          <Typography as="h3" variant="label">
            Preferência de emojis
          </Typography>
          <div role="radiogroup" aria-label="Preferência de emojis" className={localStyles.choiceGrid}>
            {EMOJI_ORDER.map((preference) => (
              <button
                key={preference}
                type="button"
                role="radio"
                aria-checked={draft.emojiPreference === preference}
                data-selected={draft.emojiPreference === preference}
                className={localStyles.choiceCard}
                onClick={() => onDraftChange({ ...draft, emojiPreference: preference })}
              >
                <Typography as="span" variant="label">
                  {EMOJI_PREFERENCE_DESCRIPTIONS[preference]}
                </Typography>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!reviewing && step === 4 ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-step-4">
          <Typography as="h2" variant="heading">
            Como o Consultor deve agir?
          </Typography>
          <FormField
            label="Instruções do Consultor"
            htmlFor="consultant-admin-prompt"
            hint="Defina regras específicas de comportamento para este Consultor. Essas instruções complementam as regras da plataforma e os dados financeiros da empresa."
          >
            <NativeTextarea
              id="consultant-admin-prompt"
              name="adminPrompt"
              className={localStyles.textareaComfortable}
              value={draft.adminPrompt}
              maxLength={CONSULTANT_FIELD_LIMITS.adminPrompt}
              placeholder="Ex.: Ao analisar os dados financeiros, considere que somos uma clínica. Explique os impactos em linguagem simples para gestores. Priorize fluxo de caixa, faturamento e inadimplência. Quando identificar um problema, explique primeiro o que aconteceu e depois apresente possíveis ações."
              onChange={(event) => onDraftChange({ ...draft, adminPrompt: event.target.value })}
            />
          </FormField>
          <div className={localStyles.chipRow} role="group" aria-label="Sugestões de instruções">
            {INSTRUCTION_CHIPS.map((chip) => (
              <Button
                key={chip.id}
                type="button"
                variant="secondary"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    adminPrompt: appendInstructionChip(draft.adminPrompt, chip.text),
                  })
                }
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {!reviewing && step === 5 ? (
        <section className={localStyles.stepBody} data-testid="consultant-wizard-step-5">
          <Typography as="h2" variant="heading">
            Ensine o Consultor sobre sua empresa
          </Typography>
          <Typography as="p" variant="body" className={styles.pageDescription}>
            Adicione informações que o Consultor não consegue descobrir apenas pelos dados
            financeiros.
          </Typography>
          <div className={localStyles.exampleGrid}>
            {KNOWLEDGE_EXAMPLES.map((example) => (
              <article key={example.title} className={localStyles.exampleCard}>
                <Typography as="p" variant="label">
                  {example.title}
                </Typography>
                <Typography as="p" variant="caption" className={styles.pageDescription}>
                  {example.text}
                </Typography>
              </article>
            ))}
          </div>
          <ConsultantKnowledgePanel
            draft={knowledgeDraft}
            editingEntryId={editingEntryId}
            entries={knowledge}
            busy={knowledgeBusy}
            error={knowledgeError}
            success={knowledgeSuccess}
            loadError={knowledgeLoadError}
            pendingDeleteId={pendingDeleteId}
            onDraftChange={onKnowledgeDraftChange}
            onSubmit={onKnowledgeSubmit}
            onStartCreate={onKnowledgeStartCreate}
            onStartEdit={onKnowledgeStartEdit}
            onToggle={onKnowledgeToggle}
            onAskDelete={onKnowledgeAskDelete}
            onConfirmDelete={onKnowledgeConfirmDelete}
          />
        </section>
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

      <div className={localStyles.wizardActions}>
        {reviewing ? (
          mode === 'create' ? (
            <>
              <Button type="button" variant="primary" loading={saving} onClick={() => onSave('ACTIVE')}>
                Ativar Consultor
              </Button>
              <Button type="button" variant="secondary" loading={saving} onClick={() => onSave('DISABLED')}>
                Salvar desativado
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              loading={saving}
              onClick={() => onSave(currentStatus)}
            >
              Salvar alterações
            </Button>
          )
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={goBack} disabled={step === 1}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={goNext}
              disabled={step === 3 && !canAdvancePersonality}
            >
              {step === 5 ? 'Revisar' : 'Continuar'}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          {mode === 'create' ? 'Cancelar' : 'Voltar ao resumo'}
        </Button>
        {reviewing ? (
          <Button type="button" variant="ghost" onClick={onBackFromReview}>
            Voltar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
