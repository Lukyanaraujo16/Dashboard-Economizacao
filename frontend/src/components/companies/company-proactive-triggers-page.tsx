'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type SelectHTMLAttributes } from 'react';

import { formatMoneyBrl } from '../../lib/format-money-brl';
import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import {
  createProactiveTrigger,
  deleteProactiveTrigger,
  getProactiveTriggerCatalog,
  listProactiveTriggers,
  setProactiveTriggerActive,
  updateProactiveTrigger,
} from '../../services/admin/proactive-triggers';
import {
  ProactiveTriggerRequestError,
  type CertifiedProactiveTriggerType,
  type ProactiveTitleKind,
  type ProactiveTriggerCatalog,
  type ProactiveTriggerConfiguration,
} from '../../services/admin/proactive-triggers.types';
import { EmptyState } from '../dashboard/empty-state';
import { WidgetExpandDialog } from '../dashboard/v2/widget-expand-dialog';
import { StateWrapper } from '../financial/state-wrapper';
import { Badge, Button, FormField, Input, Typography } from '../ui';
import { IconZap } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import { CompanySectionNav } from './company-section-nav';
import styles from './companies.module.css';
import localStyles from './company-proactive-triggers.module.css';

const TRIGGER_LABELS: Record<string, string> = {
  REVENUE_GOAL_PERCENTAGE: 'Meta de faturamento',
  EXPENSE_CEILING_PERCENTAGE: 'Teto de gastos — percentual',
  EXPENSE_CEILING_EXCEEDED: 'Teto de gastos — ultrapassado',
  TITLE_DUE_SOON: 'Título próximo do vencimento',
};

const HELPER = {
  revenue: 'A Lia poderá avisar quando o faturamento atingir esse percentual da meta mensal.',
  expense: 'A Lia poderá avisar quando as despesas atingirem esse percentual do teto mensal.',
  exceeded: 'A Lia poderá avisar quando as despesas ultrapassarem o teto mensal configurado.',
  title: 'A Lia poderá avisar quando um título em aberto, a partir desse valor, vencer dentro dessa antecedência.',
} as const;

type TriggerDraft = {
  triggerType: string;
  percentage: string;
  daysAhead: string;
  minimumAmount: string;
  titleKind: '' | ProactiveTitleKind;
};

type FieldErrors = {
  readonly percentage?: string;
  readonly daysAhead?: string;
  readonly minimumAmount?: string;
  readonly titleKind?: string;
};

type DialogState =
  | { readonly mode: 'create'; readonly draft: TriggerDraft }
  | { readonly mode: 'edit'; readonly configurationId: string; readonly draft: TriggerDraft };

type CompanyProactiveTriggersPageProps = {
  readonly companyId: string;
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
      className={cx(localStyles.control, className)}
    />
  );
}

function emptyDraft(triggerType: string): TriggerDraft {
  return {
    triggerType,
    percentage: '',
    daysAhead: '',
    minimumAmount: '',
    titleKind: '',
  };
}

function triggerLabel(type: string): string {
  return TRIGGER_LABELS[type] ?? 'Gatilho';
}

function listTitle(item: ProactiveTriggerConfiguration): string {
  if (item.triggerType === 'TITLE_DUE_SOON') {
    if (item.titleKind === 'RECEIVABLE') return 'Título a receber';
    if (item.titleKind === 'PAYABLE') return 'Título a pagar';
    return 'Título próximo do vencimento';
  }
  if (
    item.triggerType === 'EXPENSE_CEILING_PERCENTAGE' ||
    item.triggerType === 'EXPENSE_CEILING_EXCEEDED'
  ) {
    return 'Teto de gastos';
  }
  return triggerLabel(item.triggerType);
}

function amountForInput(raw: string | null): string {
  if (!raw) return '';
  try {
    return formatMoneyBrl(raw).replace(/^R\$\u00a0/, '');
  } catch {
    return raw;
  }
}

function formatListAmount(raw: string | null): string {
  if (!raw) return 'o valor informado';
  try {
    return formatMoneyBrl(raw);
  } catch {
    return raw;
  }
}

function summarize(item: ProactiveTriggerConfiguration): string {
  if (item.triggerType === 'REVENUE_GOAL_PERCENTAGE') {
    return `Avisar quando atingir ${item.percentage ?? 'o percentual'}% da meta mensal.`;
  }
  if (item.triggerType === 'EXPENSE_CEILING_PERCENTAGE') {
    return `Avisar quando atingir ${item.percentage ?? 'o percentual'}% do teto mensal.`;
  }
  if (item.triggerType === 'EXPENSE_CEILING_EXCEEDED') {
    return 'Avisar quando ultrapassar o teto mensal.';
  }
  if (item.triggerType === 'TITLE_DUE_SOON') {
    const days = item.daysAhead ?? 'alguns';
    return `A partir de ${formatListAmount(item.minimumAmount)} • vence em até ${days} dias.`;
  }
  return 'Gatilho configurado para esta empresa.';
}

function revenueSuggestionLabel(percentage: number): string {
  return `Meta em ${percentage}%`;
}

function ceilingSuggestionLabel(percentage: number): string {
  return `Teto em ${percentage}%`;
}

function helperFor(triggerType: string): string {
  if (triggerType === 'REVENUE_GOAL_PERCENTAGE') return HELPER.revenue;
  if (triggerType === 'EXPENSE_CEILING_PERCENTAGE') return HELPER.expense;
  if (triggerType === 'EXPENSE_CEILING_EXCEEDED') return HELPER.exceeded;
  if (triggerType === 'TITLE_DUE_SOON') return HELPER.title;
  return 'A Lia poderá avisar quando essa situação acontecer.';
}

function normalizeMinimumAmount(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace(/\u00a0/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(normalized) || Number(normalized) <= 0) {
    return null;
  }
  return normalized;
}

function validateDraft(definition: CertifiedProactiveTriggerType, draft: TriggerDraft): FieldErrors {
  const errors: {
    percentage?: string;
    daysAhead?: string;
    minimumAmount?: string;
    titleKind?: string;
  } = {};
  for (const field of definition.parameters) {
    if (field.name === 'percentage') {
      if (!/^\d+$/.test(draft.percentage.trim())) {
        errors.percentage = 'Informe um percentual inteiro de 1 a 100.';
      } else {
        const value = Number(draft.percentage.trim());
        if (value < 1 || value > 100) {
          errors.percentage = 'Informe um percentual inteiro de 1 a 100.';
        }
      }
    }
    if (field.name === 'daysAhead') {
      if (!/^\d+$/.test(draft.daysAhead.trim()) || Number(draft.daysAhead.trim()) < 1) {
        errors.daysAhead = 'Informe a antecedência em dias, no mínimo 1.';
      }
    }
    if (field.name === 'minimumAmount' && normalizeMinimumAmount(draft.minimumAmount) === null) {
      errors.minimumAmount = 'Informe um valor mínimo maior que zero.';
    }
    if (field.name === 'titleKind' && draft.titleKind !== 'RECEIVABLE' && draft.titleKind !== 'PAYABLE') {
      errors.titleKind = 'Selecione se o título é a receber ou a pagar.';
    }
  }
  return errors;
}

function buildParameters(
  definition: CertifiedProactiveTriggerType,
  draft: TriggerDraft,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const field of definition.parameters) {
    if (field.name === 'percentage') parameters.percentage = Number(draft.percentage.trim());
    if (field.name === 'daysAhead') parameters.daysAhead = Number(draft.daysAhead.trim());
    if (field.name === 'minimumAmount') parameters.minimumAmount = normalizeMinimumAmount(draft.minimumAmount);
    if (field.name === 'titleKind') parameters.titleKind = draft.titleKind;
  }
  return parameters;
}

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof ProactiveTriggerRequestError) {
    return error.message || fallback;
  }
  return fallback;
}

function draftFromConfiguration(item: ProactiveTriggerConfiguration): TriggerDraft {
  return {
    triggerType: item.triggerType,
    percentage: item.percentage === null ? '' : String(item.percentage),
    daysAhead: item.daysAhead === null ? '' : String(item.daysAhead),
    minimumAmount: amountForInput(item.minimumAmount),
    titleKind: item.titleKind ?? '',
  };
}

type ParameterFieldsProps = {
  readonly definition: CertifiedProactiveTriggerType;
  readonly draft: TriggerDraft;
  readonly idPrefix: string;
  readonly errors: FieldErrors;
  readonly disabled: boolean;
  readonly onChange: (draft: TriggerDraft) => void;
};

function ParameterFields({ definition, draft, idPrefix, errors, disabled, onChange }: ParameterFieldsProps) {
  if (definition.parameters.length === 0) {
    return (
      <Typography as="p" variant="body" className={localStyles.helper}>
        {helperFor(definition.type)}
      </Typography>
    );
  }

  const percentageLabel =
    definition.type === 'EXPENSE_CEILING_PERCENTAGE' ? 'Percentual do teto' : 'Percentual da meta';

  return (
    <>
      {definition.parameters.map((field) => {
        if (field.name === 'percentage') {
          return (
            <div key={field.name} className={localStyles.measureRow}>
              <FormField
                className={localStyles.measureField}
                label={percentageLabel}
                htmlFor={`${idPrefix}-percentage`}
                error={errors.percentage}
                required
              >
                <Input
                  id={`${idPrefix}-percentage`}
                  name="percentage"
                  inputMode="numeric"
                  value={draft.percentage}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...draft, percentage: event.target.value })}
                />
              </FormField>
              <span className={localStyles.measureSuffix} aria-hidden="true">
                %
              </span>
            </div>
          );
        }
        if (field.name === 'daysAhead') {
          return (
            <div key={field.name} className={localStyles.measureRow}>
              <FormField
                className={localStyles.measureField}
                label="Antecedência"
                htmlFor={`${idPrefix}-days`}
                error={errors.daysAhead}
                required
              >
                <Input
                  id={`${idPrefix}-days`}
                  name="daysAhead"
                  inputMode="numeric"
                  value={draft.daysAhead}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...draft, daysAhead: event.target.value })}
                />
              </FormField>
              <span className={localStyles.measureSuffix} aria-hidden="true">
                dias
              </span>
            </div>
          );
        }
        if (field.name === 'minimumAmount') {
          return (
            <div key={field.name} className={localStyles.amountRow}>
              <span className={localStyles.amountPrefix} aria-hidden="true">
                R$
              </span>
              <FormField
                className={localStyles.measureField}
                label="Valor mínimo"
                htmlFor={`${idPrefix}-amount`}
                error={errors.minimumAmount}
                required
              >
                <Input
                  id={`${idPrefix}-amount`}
                  name="minimumAmount"
                  inputMode="decimal"
                  value={draft.minimumAmount}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...draft, minimumAmount: event.target.value })}
                />
              </FormField>
            </div>
          );
        }
        if (field.name === 'titleKind') {
          return (
            <FormField
              key={field.name}
              label="Tipo do título"
              htmlFor={`${idPrefix}-kind`}
              error={errors.titleKind}
              required
            >
              <NativeSelect
                id={`${idPrefix}-kind`}
                name="titleKind"
                value={draft.titleKind}
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange({
                    ...draft,
                    titleKind: value === 'RECEIVABLE' || value === 'PAYABLE' ? value : '',
                  });
                }}
              >
                <option value="">Selecione</option>
                <option value="PAYABLE">A pagar</option>
                <option value="RECEIVABLE">A receber</option>
              </NativeSelect>
            </FormField>
          );
        }
        return null;
      })}
      <Typography as="p" variant="body" className={localStyles.helper}>
        {helperFor(definition.type)}
      </Typography>
    </>
  );
}

export function CompanyProactiveTriggersPage({ companyId }: CompanyProactiveTriggersPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ProactiveTriggerCatalog | null>(null);
  const [configurations, setConfigurations] = useState<readonly ProactiveTriggerConfiguration[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [company, nextCatalog, nextConfigurations] = await Promise.all([
        getCompany(companyId),
        getProactiveTriggerCatalog(),
        listProactiveTriggers(companyId),
      ]);
      setCompanyName(company.displayName);
      setCatalog(nextCatalog);
      setConfigurations(nextConfigurations);
      setDialog(null);
      setLoadState('ready');
    } catch (error) {
      if (
        (error instanceof CompaniesRequestError || error instanceof ProactiveTriggerRequestError) &&
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

  const refreshConfigurations = useCallback(async () => {
    const next = await listProactiveTriggers(companyId);
    setConfigurations(next);
  }, [companyId]);

  const definitionFor = useCallback(
    (triggerType: string) => catalog?.types.find((item) => item.type === triggerType) ?? null,
    [catalog],
  );

  function openCreate(draft?: TriggerDraft) {
    const triggerType = draft?.triggerType ?? catalog?.types[0]?.type ?? '';
    setDialog({ mode: 'create', draft: draft ?? emptyDraft(triggerType) });
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setPendingDeleteId(null);
  }

  function openEdit(item: ProactiveTriggerConfiguration) {
    setDialog({ mode: 'edit', configurationId: item.id, draft: draftFromConfiguration(item) });
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setPendingDeleteId(null);
    setItemErrors((current) => ({ ...current, [item.id]: '' }));
  }

  function closeDialog() {
    if (savingRef.current) return;
    setDialog(null);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!dialog || savingRef.current) return;
    const definition = definitionFor(dialog.draft.triggerType);
    if (!definition) {
      setFormError('Escolha um tipo de gatilho.');
      return;
    }
    const errors = validateDraft(definition, dialog.draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const parameters = buildParameters(definition, dialog.draft);
      if (dialog.mode === 'create') {
        await createProactiveTrigger(companyId, definition.type, parameters);
        setSuccess('Gatilho salvo.');
      } else {
        await updateProactiveTrigger(companyId, dialog.configurationId, parameters);
        setSuccess('Gatilho atualizado.');
      }
      await refreshConfigurations();
      savingRef.current = false;
      setSaving(false);
      setDialog(null);
    } catch (error) {
      setFormError(failureMessage(error, 'Não foi possível salvar o gatilho.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleToggle(item: ProactiveTriggerConfiguration) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setProactiveTriggerActive(companyId, item.id, !item.active);
      await refreshConfigurations();
      setItemErrors((current) => ({ ...current, [item.id]: '' }));
      setSuccess(item.active ? 'Gatilho desativado.' : 'Gatilho ativado.');
    } catch (error) {
      setItemErrors((current) => ({
        ...current,
        [item.id]: failureMessage(error, 'Não foi possível atualizar o gatilho.'),
      }));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete(item: ProactiveTriggerConfiguration) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await deleteProactiveTrigger(companyId, item.id);
      await refreshConfigurations();
      setPendingDeleteId(null);
      setItemErrors((current) => ({ ...current, [item.id]: '' }));
      setSuccess('Gatilho excluído.');
    } catch (error) {
      const message =
        error instanceof ProactiveTriggerRequestError && error.kind === 'conflict'
          ? 'Este gatilho já possui histórico e não pode ser excluído. Você pode desativá-lo.'
          : failureMessage(error, 'Não foi possível excluir o gatilho.');
      setPendingDeleteId(null);
      setItemErrors((current) => ({ ...current, [item.id]: message }));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const wrapperState = loadState === 'ready' ? 'ready' : loadState === 'loading' ? 'loading' : 'error';
  const selected = dialog ? definitionFor(dialog.draft.triggerType) : null;
  const hasConfigurations = configurations.length > 0;

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      {loadState !== 'ready' || !catalog ? (
        <StateWrapper
          state={wrapperState === 'ready' ? 'error' : wrapperState}
          errorMessage={
            loadState === 'not_found' ? 'Empresa não encontrada.' : 'Não foi possível carregar os gatilhos.'
          }
          loadingLabel="Carregando gatilhos"
          onRetry={loadState === 'not_found' ? undefined : () => void load()}
          align="start"
        />
      ) : (
        <div className={styles.formPage}>
          <header className={localStyles.header}>
            <div className={localStyles.headerCopy}>
              <Typography as="h2" variant="heading">
                Gatilhos da Lia
              </Typography>
              <Typography as="p" variant="body" className={localStyles.subtitle}>
                Defina quando a Lia deve avisar sobre situações financeiras importantes.
              </Typography>
            </div>
            <div className={localStyles.headerAction}>
              <Button type="button" variant="primary" onClick={() => openCreate()}>
                + Novo gatilho
              </Button>
            </div>
          </header>

          {success ? (
            <Typography as="p" variant="body" className={styles.formSuccess} role="status">
              {success}
            </Typography>
          ) : null}

          <section className={localStyles.section} aria-label="Gatilhos configurados">
            {hasConfigurations ? (
              <ul className={localStyles.list}>
                {configurations.map((item) => (
                  <li key={item.id} className={localStyles.item} data-testid="proactive-trigger-item">
                    <div className={localStyles.itemBody}>
                      <div className={localStyles.itemTitleRow}>
                        <Typography as="h3" variant="title" className={localStyles.itemTitle}>
                          {listTitle(item)}
                        </Typography>
                        <Badge variant={item.active ? 'success' : 'neutral'}>
                          {item.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <Typography as="p" variant="body" className={localStyles.itemSummary}>
                        {summarize(item)}
                      </Typography>
                      {itemErrors[item.id] ? (
                        <Typography as="p" variant="body" className={styles.formError} role="alert">
                          {itemErrors[item.id]}
                        </Typography>
                      ) : null}
                    </div>
                    {pendingDeleteId === item.id ? (
                      <div className={styles.confirmPanel} role="group" aria-label="Confirmar exclusão">
                        <Typography as="p" variant="body" className={styles.confirmMessage}>
                          Excluir este gatilho?
                        </Typography>
                        <div className={styles.confirmActions}>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            loading={saving}
                            onClick={() => void handleDelete(item)}
                          >
                            Confirmar exclusão
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={localStyles.itemActions}>
                        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => openEdit(item)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => void handleToggle(item)}
                        >
                          {item.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={saving}
                          onClick={() => {
                            setPendingDeleteId(item.id);
                            setItemErrors((current) => ({ ...current, [item.id]: '' }));
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                align="center"
                icon={<IconZap />}
                title="Nenhum gatilho configurado"
                description="Crie gatilhos para definir em quais situações financeiras a Lia deverá chamar a atenção do usuário."
              >
                <Button type="button" variant="primary" onClick={() => openCreate()}>
                  + Criar primeiro gatilho
                </Button>
              </EmptyState>
            )}
          </section>

          <section className={localStyles.section} aria-label="Sugestões rápidas" data-testid="proactive-trigger-suggestions">
            <div>
              <Typography as="h3" variant="title">
                Sugestões rápidas
              </Typography>
              <Typography as="p" variant="body" className={localStyles.subtitle}>
                Comece com algumas configurações comuns.
              </Typography>
            </div>
            <div className={localStyles.suggestionRow}>
              {catalog.types.some((item) => item.type === 'REVENUE_GOAL_PERCENTAGE')
                ? catalog.suggestedDefaults.revenueGoalPercentages.map((percentage) => (
                    <Button
                      key={`revenue-${percentage}`}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        openCreate({
                          ...emptyDraft('REVENUE_GOAL_PERCENTAGE'),
                          percentage: String(percentage),
                        })
                      }
                    >
                      {revenueSuggestionLabel(percentage)}
                    </Button>
                  ))
                : null}
              {catalog.types.some((item) => item.type === 'EXPENSE_CEILING_PERCENTAGE')
                ? catalog.suggestedDefaults.expenseCeilingPercentages.map((percentage) => (
                    <Button
                      key={`expense-${percentage}`}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        openCreate({
                          ...emptyDraft('EXPENSE_CEILING_PERCENTAGE'),
                          percentage: String(percentage),
                        })
                      }
                    >
                      {ceilingSuggestionLabel(percentage)}
                    </Button>
                  ))
                : null}
              {catalog.suggestedDefaults.expenseCeilingExceeded &&
              catalog.types.some((item) => item.type === 'EXPENSE_CEILING_EXCEEDED') ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openCreate(emptyDraft('EXPENSE_CEILING_EXCEEDED'))}
                >
                  Teto ultrapassado
                </Button>
              ) : null}
              {catalog.types.some((item) => item.type === 'TITLE_DUE_SOON') ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    openCreate({
                      ...emptyDraft('TITLE_DUE_SOON'),
                      daysAhead: String(catalog.suggestedDefaults.titleDueSoon.daysAhead),
                      minimumAmount: amountForInput(catalog.suggestedDefaults.titleDueSoon.minimumAmount),
                      titleKind: catalog.suggestedDefaults.titleDueSoon.titleKind,
                    })
                  }
                >
                  Título relevante vencendo
                </Button>
              ) : null}
            </div>
          </section>

          <WidgetExpandDialog
            open={dialog !== null}
            title={dialog?.mode === 'edit' ? 'Editar gatilho' : 'Novo gatilho'}
            onClose={closeDialog}
          >
            {dialog && selected ? (
              <form className={localStyles.form} onSubmit={(event) => void handleSave(event)} noValidate>
                {dialog.mode === 'edit' ? (
                  <Typography as="p" variant="body" className={localStyles.helper}>
                    {triggerLabel(dialog.draft.triggerType)}
                  </Typography>
                ) : (
                  <FormField label="Tipo de gatilho" htmlFor="proactive-create-type" required>
                    <NativeSelect
                      id="proactive-create-type"
                      name="triggerType"
                      value={dialog.draft.triggerType}
                      disabled={saving}
                      onChange={(event) => {
                        setDialog({ mode: 'create', draft: emptyDraft(event.target.value) });
                        setFieldErrors({});
                        setFormError(null);
                      }}
                    >
                      {catalog.types.map((item) => (
                        <option key={item.type} value={item.type}>
                          {triggerLabel(item.type)}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                )}
                <ParameterFields
                  definition={selected}
                  draft={dialog.draft}
                  idPrefix="proactive-form"
                  errors={fieldErrors}
                  disabled={saving}
                  onChange={(next) => setDialog({ ...dialog, draft: next })}
                />
                {formError ? (
                  <Typography as="p" variant="body" className={styles.formError} role="alert">
                    {formError}
                  </Typography>
                ) : null}
                <div className={localStyles.dialogActions}>
                  <Button type="button" variant="secondary" disabled={saving} onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" loading={saving}>
                    Salvar gatilho
                  </Button>
                </div>
              </form>
            ) : null}
          </WidgetExpandDialog>
        </div>
      )}
    </CompanySectionNav>
  );
}
