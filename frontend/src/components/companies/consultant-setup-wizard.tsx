import { useState, type FormEvent, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import {
  BookOpen,
  Building2,
  Calendar,
  Check,
  Compass,
  ListChecks,
  MessageCircle,
  Settings2,
  Target,
  User,
} from 'lucide-react';

import {
  CONSULTANT_FIELD_LIMITS,
  type ConsultantEmojiPreference,
  type ConsultantKnowledgeEntry,
  type ConsultantOptions,
  type ConsultantProviderId,
  type ConsultantTonePreset,
} from '../../services/admin/consultant.types';
import { Button, FormField, Input, Typography } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import {
  ConsultantKnowledgePanel,
  type KnowledgeDraft,
} from './consultant-knowledge-panel';
import {
  CONSULTANT_WIZARD_STEPS,
  EMOJI_PREFERENCE_DESCRIPTIONS,
  EMOJI_PREFERENCE_HELPERS,
  INSTRUCTION_CHIPS,
  KNOWLEDGE_EXAMPLES,
  SEGMENT_EXAMPLES,
  TONE_PRESET_DESCRIPTIONS,
  appendInstructionChip,
  emojiDisplayName,
  providerDisplayName,
  resolveDisplayedConsultantName,
  toneDisplayName,
  wizardProgressPercent,
  wizardStepCopy,
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
  readonly onKnowledgeDismissSuccess?: () => void;
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

const STEP_ICONS: Record<ConsultantWizardStepId, typeof User> = {
  1: User,
  2: Building2,
  3: MessageCircle,
  4: Compass,
  5: BookOpen,
};

const EXAMPLE_ICONS = {
  'Meta interna': Target,
  'Regra do negócio': ListChecks,
  'Estrutura da empresa': Building2,
  Sazonalidade: Calendar,
  Estratégia: Compass,
} as const;

function ChoiceCard({
  selected,
  label,
  description,
  onSelect,
}: {
  readonly selected: boolean;
  readonly label: string;
  readonly description?: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-selected={selected}
      className={localStyles.choiceCard}
      onClick={onSelect}
    >
      {selected ? (
        <span className={localStyles.choiceCheck} aria-hidden="true">
          <Check size={16} strokeWidth={UI_ICON_STROKE} />
        </span>
      ) : null}
      <Typography as="span" variant="label">
        {label}
      </Typography>
      {description ? (
        <Typography as="span" variant="caption" className={styles.pageDescription}>
          {description}
        </Typography>
      ) : null}
    </button>
  );
}

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
  onKnowledgeDismissSuccess,
}: ConsultantSetupWizardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canAdvancePersonality = draft.tonePreset !== 'PERSONALIZADO' || draft.tone.trim().length > 0;
  const percent = wizardProgressPercent(step, reviewing);
  const stepMeta = reviewing
    ? { title: 'Revise seu Consultor', description: 'Confira os dados antes de salvar.' }
    : wizardStepCopy(step, draft.consultantName);
  const StepIcon = reviewing ? Check : STEP_ICONS[step];
  const displayedName = resolveDisplayedConsultantName(draft.consultantName);
  const activeKnowledge = knowledge.filter((entry) => entry.status === 'ACTIVE').length;
  const instructionsConfigured = draft.adminPrompt.trim().length > 0;
  const currentStepLabel = reviewing
    ? 'Revisão'
    : CONSULTANT_WIZARD_STEPS.find((item) => item.id === step)?.label ?? 'Identidade';

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
    <div className={localStyles.experience}>
      <div className={cx(localStyles.experienceCard, localStyles.wizard)} data-testid="consultant-wizard">
        <header className={localStyles.wizardHeader}>
          <div className={localStyles.wizardHeaderTop}>
            <span className={localStyles.stepIcon} aria-hidden="true">
              <StepIcon size={20} strokeWidth={UI_ICON_STROKE} />
            </span>
            <div className={localStyles.wizardMeta}>
              <Typography as="p" variant="caption" className={localStyles.wizardMetaPrimary}>
                Etapa {reviewing ? 5 : step} de 5
              </Typography>
              <Typography as="p" variant="caption" className={localStyles.wizardPercent}>
                {percent}%
              </Typography>
            </div>
          </div>
          <Typography as="p" variant="caption" className={localStyles.wizardStepName}>
            {currentStepLabel}
          </Typography>
          <ol className={localStyles.srOnly}>
            {CONSULTANT_WIZARD_STEPS.map((item) => (
              <li key={item.id} aria-current={!reviewing && step === item.id ? 'step' : undefined}>
                {item.label}
              </li>
            ))}
          </ol>
          <div
            className={localStyles.progressTrack}
            role="progressbar"
            aria-label="Progresso da configuração"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            data-testid="consultant-wizard-progress"
          >
            <div className={localStyles.progressFill} style={{ width: `${percent}%` }} />
          </div>
          <div className={localStyles.wizardIntro}>
            <Typography as="h2" variant="heading">
              {stepMeta.title}
            </Typography>
            <Typography as="p" variant="body" className={styles.pageDescription}>
              {stepMeta.description}
            </Typography>
          </div>
        </header>

        {reviewing ? (
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-review"
          >
            <div className={localStyles.reviewLead}>
              <Typography as="p" variant="label">
                {displayedName}
              </Typography>
              <Typography as="p" variant="body" className={styles.pageDescription}>
                Consultora financeira · {companyName}
              </Typography>
            </div>
            <dl className={localStyles.reviewList}>
              <dt>Identidade</dt>
              <dd>{draft.businessSegment.trim() || 'Não informado'}</dd>
              <dt>Personalidade</dt>
              <dd>{toneDisplayName(draft.tonePreset)}</dd>
              <dt>Emojis</dt>
              <dd>{emojiDisplayName(draft.emojiPreference)}</dd>
              <dt>Conhecimento</dt>
              <dd>
                {activeKnowledge === 1
                  ? '1 informação ativa'
                  : `${activeKnowledge} informações ativas`}
              </dd>
              <dt>Tecnologia</dt>
              <dd>
                {providerDisplayName(draft.provider)} · {draft.model}
              </dd>
              <dt>Instruções</dt>
              <dd>{instructionsConfigured ? 'Configuradas' : 'Não definidas'}</dd>
            </dl>
          </section>
        ) : null}

        {!reviewing && step === 1 ? (
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-step-1"
            key="step-1"
          >
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
            <div>
              <button
                type="button"
                className={localStyles.advancedToggle}
                aria-expanded={advancedOpen}
                aria-controls="consultant-advanced-settings"
                data-testid="consultant-advanced-toggle"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <Settings2 size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
                Configurações avançadas
              </button>
              {advancedOpen ? (
                <div
                  id="consultant-advanced-settings"
                  className={localStyles.advancedPanel}
                  data-testid="consultant-advanced-settings"
                >
                  <FormField
                    label="Motor de IA"
                    htmlFor="consultant-provider"
                    hint="Define a tecnologia usada pelo Consultor."
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
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!reviewing && step === 2 ? (
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-step-2"
            key="step-2"
          >
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
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-step-3"
            key="step-3"
          >
            <div role="radiogroup" aria-label="Tom do Consultor" className={localStyles.choiceGrid}>
              {TONE_ORDER.map((preset) => {
                const option = options.tonePresets.find((item) => item.id === preset);
                return (
                  <ChoiceCard
                    key={preset}
                    selected={draft.tonePreset === preset}
                    label={option?.label ?? toneDisplayName(preset)}
                    description={TONE_PRESET_DESCRIPTIONS[preset]}
                    onSelect={() => onDraftChange({ ...draft, tonePreset: preset })}
                  />
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
                <ChoiceCard
                  key={preference}
                  selected={draft.emojiPreference === preference}
                  label={EMOJI_PREFERENCE_DESCRIPTIONS[preference]}
                  description={EMOJI_PREFERENCE_HELPERS[preference]}
                  onSelect={() => onDraftChange({ ...draft, emojiPreference: preference })}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!reviewing && step === 4 ? (
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-step-4"
            key="step-4"
          >
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
                <button
                  key={chip.id}
                  type="button"
                  className={localStyles.chip}
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      adminPrompt: appendInstructionChip(draft.adminPrompt, chip.text),
                    })
                  }
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!reviewing && step === 5 ? (
          <section
            className={cx(localStyles.stepBody, localStyles.stepEnter)}
            data-testid="consultant-wizard-step-5"
            key="step-5"
          >
            <div className={localStyles.exampleGrid}>
              {KNOWLEDGE_EXAMPLES.map((example) => {
                const Icon = EXAMPLE_ICONS[example.title];
                return (
                  <article key={example.title} className={localStyles.exampleCard}>
                    <div className={localStyles.exampleCardHeader}>
                      {Icon ? <Icon size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" /> : null}
                      <Typography as="p" variant="label">
                        {example.title}
                      </Typography>
                    </div>
                    <Typography as="p" variant="caption" className={styles.pageDescription}>
                      {example.text}
                    </Typography>
                  </article>
                );
              })}
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
              onDismissSuccess={onKnowledgeDismissSuccess}
            />
          </section>
        ) : null}

        {formError ? (
          <Typography as="p" variant="body" className={styles.formError} role="alert">
            {formError}
          </Typography>
        ) : null}

        <div className={localStyles.wizardActions}>
          <div className={localStyles.wizardActionsStart}>
            <Button type="button" variant="ghost" onClick={goBack} disabled={!reviewing && step === 1}>
              Voltar
            </Button>
          </div>
          <div className={localStyles.wizardActionsCenter}>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {mode === 'create' ? 'Sair' : 'Voltar ao resumo'}
            </Button>
          </div>
          <div className={localStyles.wizardActionsEnd}>
            {reviewing ? (
              mode === 'create' ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={saving}
                    onClick={() => onSave('DISABLED')}
                  >
                    Salvar desativado
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={saving}
                    onClick={() => onSave('ACTIVE')}
                  >
                    Salvar e ativar
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
              <Button
                type="button"
                variant="primary"
                onClick={goNext}
                disabled={step === 3 && !canAdvancePersonality}
              >
                {step === 5 ? 'Revisar configuração' : 'Continuar'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
