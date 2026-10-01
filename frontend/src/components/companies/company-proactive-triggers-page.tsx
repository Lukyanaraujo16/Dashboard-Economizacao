'use client';

import { useCallback, useEffect, useState, type FormEvent, type SelectHTMLAttributes } from 'react';

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
import { StateWrapper } from '../financial/state-wrapper';
import { Button, FormField, Input, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import { CompanySectionNav } from './company-section-nav';
import styles from './companies.module.css';
import localStyles from './company-proactive-triggers.module.css';

const TRIGGER_LABELS: Record<string, string> = {
  REVENUE_GOAL_PERCENTAGE: 'META DE FATURAMENTO',
  EXPENSE_CEILING_PERCENTAGE: 'TETO DE GASTOS — PERCENTUAL',
  EXPENSE_CEILING_EXCEEDED: 'TETO DE GASTOS — ULTRAPASSADO',
  TITLE_DUE_SOON: 'TÍTULO PRÓXIMO DO VENCIMENTO',
};

const COPY = {
  revenue: 'Avise quando o faturamento atingir X% da meta mensal.',
  expense: 'Avise quando as despesas atingirem X% do teto mensal.',
  exceeded: 'Avise quando as despesas ultrapassarem o teto mensal.',
  title: 'Avise quando um título a pagar/a receber de pelo menos R$ X vencer nos próximos N dias.',
  notice:
    'Os gatilhos determinam quando a Lia poderá avisar. A comunicação da Lia vem depois. Configurar não altera os dados financeiros. Gatilho inativo não gera novas ocorrências.',
} as const;

type TriggerDraft = {
  triggerType: string;
  percentage: string;
  daysAhead: string;
  minimumAmount: string;
  titleKind: '' | ProactiveTitleKind;
};

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

function formatBrl(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return amount;
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function summarize(item: ProactiveTriggerConfiguration): string {
  if (item.triggerType === 'REVENUE_GOAL_PERCENTAGE') {
    return `Avise quando o faturamento atingir ${item.percentage ?? 'X'}% da meta mensal.`;
  }
  if (item.triggerType === 'EXPENSE_CEILING_PERCENTAGE') {
    return `Avise quando as despesas atingirem ${item.percentage ?? 'X'}% do teto mensal.`;
  }
  if (item.triggerType === 'EXPENSE_CEILING_EXCEEDED') {
    return COPY.exceeded;
  }
  if (item.triggerType === 'TITLE_DUE_SOON') {
    const kind =
      item.titleKind === 'RECEIVABLE' ? 'a receber' : item.titleKind === 'PAYABLE' ? 'a pagar' : 'a pagar/a receber';
    const amount = item.minimumAmount ? formatBrl(item.minimumAmount) : 'R$ X';
    const days = item.daysAhead ?? 'N';
    return `Avise quando um título ${kind} de pelo menos ${amount} vencer nos próximos ${days} dias.`;
  }
  return 'Gatilho configurado para esta empresa.';
}

function normalizeMinimumAmount(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(normalized) || Number(normalized) <= 0) {
    return null;
  }
  return normalized;
}

function validateDraft(definition: CertifiedProactiveTriggerType, draft: TriggerDraft): string | null {
  for (const field of definition.parameters) {
    if (field.name === 'percentage') {
      if (!/^\d+$/.test(draft.percentage.trim())) {
        return 'Informe um percentual inteiro de 1 a 100.';
      }
      const value = Number(draft.percentage.trim());
      if (value < 1 || value > 100) {
        return 'Informe um percentual inteiro de 1 a 100.';
      }
    }
    if (field.name === 'daysAhead') {
      if (!/^\d+$/.test(draft.daysAhead.trim()) || Number(draft.daysAhead.trim()) < 1) {
        return 'Informe a antecedência em dias, no mínimo 1.';
      }
    }
    if (field.name === 'minimumAmount' && normalizeMinimumAmount(draft.minimumAmount) === null) {
      return 'Informe um valor mínimo maior que zero.';
    }
    if (field.name === 'titleKind' && draft.titleKind !== 'RECEIVABLE' && draft.titleKind !== 'PAYABLE') {
      return 'Selecione se o título é a receber ou a pagar.';
    }
  }
  return null;
}

function buildParameters(
  definition: CertifiedProactiveTriggerType,
  draft: TriggerDraft,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const field of definition.parameters) {
    if (field.name === 'percentage') {
      parameters.percentage = Number(draft.percentage.trim());
    }
    if (field.name === 'daysAhead') {
      parameters.daysAhead = Number(draft.daysAhead.trim());
    }
    if (field.name === 'minimumAmount') {
      parameters.minimumAmount = normalizeMinimumAmount(draft.minimumAmount);
    }
    if (field.name === 'titleKind') {
      parameters.titleKind = draft.titleKind;
    }
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
    minimumAmount: item.minimumAmount ?? '',
    titleKind: item.titleKind ?? '',
  };
}

type ParameterFieldsProps = {
  readonly definition: CertifiedProactiveTriggerType;
  readonly draft: TriggerDraft;
  readonly idPrefix: string;
  readonly onChange: (draft: TriggerDraft) => void;
};

function ParameterFields({ definition, draft, idPrefix, onChange }: ParameterFieldsProps) {
  if (definition.parameters.length === 0) {
    return (
      <Typography as="p" variant="body" className={styles.formDescription}>
        {definition.type === 'EXPENSE_CEILING_EXCEEDED'
          ? COPY.exceeded
          : 'Este tipo não tem parâmetro adicional.'}
      </Typography>
    );
  }

  return (
    <>
      {definition.parameters.map((field) => {
        if (field.name === 'percentage') {
          return (
            <FormField key={field.name} label="Percentual" htmlFor={`${idPrefix}-percentage`} required>
              <Input
                id={`${idPrefix}-percentage`}
                name="percentage"
                inputMode="numeric"
                value={draft.percentage}
                onChange={(event) => onChange({ ...draft, percentage: event.target.value })}
              />
            </FormField>
          );
        }
        if (field.name === 'daysAhead') {
          return (
            <FormField
              key={field.name}
              label="Antecedência em dias"
              htmlFor={`${idPrefix}-days`}
              required
            >
              <Input
                id={`${idPrefix}-days`}
                name="daysAhead"
                inputMode="numeric"
                value={draft.daysAhead}
                onChange={(event) => onChange({ ...draft, daysAhead: event.target.value })}
              />
            </FormField>
          );
        }
        if (field.name === 'minimumAmount') {
          return (
            <FormField key={field.name} label="Valor mínimo" htmlFor={`${idPrefix}-amount`} required>
              <Input
                id={`${idPrefix}-amount`}
                name="minimumAmount"
                inputMode="decimal"
                value={draft.minimumAmount}
                onChange={(event) => onChange({ ...draft, minimumAmount: event.target.value })}
              />
            </FormField>
          );
        }
        if (field.name === 'titleKind') {
          return (
            <FormField key={field.name} label="Tipo de título" htmlFor={`${idPrefix}-kind`} required>
              <NativeSelect
                id={`${idPrefix}-kind`}
                name="titleKind"
                value={draft.titleKind}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange({
                    ...draft,
                    titleKind: value === 'RECEIVABLE' || value === 'PAYABLE' ? value : '',
                  });
                }}
              >
                <option value="">Selecione</option>
                <option value="RECEIVABLE">A receber</option>
                <option value="PAYABLE">A pagar</option>
              </NativeSelect>
            </FormField>
          );
        }
        return null;
      })}
    </>
  );
}

export function CompanyProactiveTriggersPage({ companyId }: CompanyProactiveTriggersPageProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ProactiveTriggerCatalog | null>(null);
  const [configurations, setConfigurations] = useState<readonly ProactiveTriggerConfiguration[]>([]);
  const [draft, setDraft] = useState<TriggerDraft>(emptyDraft(''));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TriggerDraft | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

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
      setDraft(emptyDraft(nextCatalog.types[0]?.type ?? ''));
      setEditingId(null);
      setEditDraft(null);
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

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const definition = definitionFor(draft.triggerType);
    if (!definition) {
      setCreateError('Escolha um tipo de gatilho.');
      return;
    }
    const validation = validateDraft(definition, draft);
    if (validation) {
      setCreateError(validation);
      setCreateSuccess(null);
      return;
    }
    setSaving(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await createProactiveTrigger(companyId, definition.type, buildParameters(definition, draft));
      await refreshConfigurations();
      setDraft(emptyDraft(catalog?.types[0]?.type ?? ''));
      setCreateSuccess('Gatilho salvo.');
    } catch (error) {
      setCreateError(failureMessage(error, 'Não foi possível salvar o gatilho.'));
    } finally {
      setSaving(false);
    }
  }

  function applySuggestion(next: TriggerDraft) {
    setDraft(next);
    setCreateError(null);
    setCreateSuccess(null);
  }

  async function handleEdit(item: ProactiveTriggerConfiguration) {
    if (!editDraft) {
      return;
    }
    const definition = definitionFor(item.triggerType);
    if (!definition) {
      setItemErrors((current) => ({ ...current, [item.id]: 'Este tipo de gatilho não está disponível.' }));
      return;
    }
    const validation = validateDraft(definition, editDraft);
    if (validation) {
      setItemErrors((current) => ({ ...current, [item.id]: validation }));
      return;
    }
    setSaving(true);
    try {
      await updateProactiveTrigger(companyId, item.id, buildParameters(definition, editDraft));
      await refreshConfigurations();
      setEditingId(null);
      setEditDraft(null);
      setItemErrors((current) => ({ ...current, [item.id]: '' }));
    } catch (error) {
      setItemErrors((current) => ({
        ...current,
        [item.id]: failureMessage(error, 'Não foi possível salvar o gatilho.'),
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: ProactiveTriggerConfiguration) {
    setSaving(true);
    try {
      await setProactiveTriggerActive(companyId, item.id, !item.active);
      await refreshConfigurations();
      setItemErrors((current) => ({ ...current, [item.id]: '' }));
    } catch (error) {
      setItemErrors((current) => ({
        ...current,
        [item.id]: failureMessage(error, 'Não foi possível atualizar o gatilho.'),
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ProactiveTriggerConfiguration) {
    setSaving(true);
    try {
      await deleteProactiveTrigger(companyId, item.id);
      await refreshConfigurations();
      if (editingId === item.id) {
        setEditingId(null);
        setEditDraft(null);
      }
      setItemErrors((current) => ({ ...current, [item.id]: '' }));
    } catch (error) {
      const message =
        error instanceof ProactiveTriggerRequestError && error.kind === 'conflict'
          ? 'Este gatilho já tem histórico. Só é possível desativá-lo.'
          : failureMessage(error, 'Não foi possível excluir o gatilho.');
      setItemErrors((current) => ({ ...current, [item.id]: message }));
    } finally {
      setSaving(false);
    }
  }

  const wrapperState = loadState === 'ready' ? 'ready' : loadState === 'loading' ? 'loading' : 'error';
  const selected = definitionFor(draft.triggerType);

  return (
    <CompanySectionNav companyId={companyId} companyName={companyName}>
      {loadState !== 'ready' || !catalog ? (
        <StateWrapper
          state={wrapperState === 'ready' ? 'error' : wrapperState}
          errorMessage={
            loadState === 'not_found'
              ? 'Empresa não encontrada.'
              : 'Não foi possível carregar os gatilhos.'
          }
          loadingLabel="Carregando gatilhos"
          onRetry={loadState === 'not_found' ? undefined : () => void load()}
          align="start"
        />
      ) : (
        <div className={styles.formPage}>
          <div className={styles.formIntro}>
            <Typography as="h2" variant="heading">
              Gatilhos da Lia
            </Typography>
            <Typography as="p" variant="body" className={styles.formDescription}>
              {COPY.notice}
            </Typography>
            <ul className={localStyles.copyList}>
              <li>{COPY.revenue}</li>
              <li>{COPY.expense}</li>
              <li>{COPY.exceeded}</li>
              <li>{COPY.title}</li>
            </ul>
          </div>

          <section aria-label="Gatilhos configurados">
            <Typography as="h3" variant="title">
              Gatilhos configurados
            </Typography>
            {configurations.length === 0 ? (
              <Typography as="p" variant="body" className={styles.formDescription}>
                Nenhum gatilho configurado. Ver esta tela não cria gatilho.
              </Typography>
            ) : (
              <ul className={localStyles.list}>
                {configurations.map((item) => {
                  const definition = definitionFor(item.triggerType);
                  const editing = editingId === item.id && editDraft !== null;
                  return (
                    <li key={item.id} className={styles.formCard} data-testid="proactive-trigger-item">
                      <div className={localStyles.itemHeader}>
                        <Typography as="h3" variant="title" className={localStyles.itemTitle}>
                          {triggerLabel(item.triggerType)}
                        </Typography>
                        <Typography as="span" variant="label">
                          {item.active ? 'Ativo' : 'Inativo'}
                        </Typography>
                      </div>
                      <Typography
                        as="p"
                        variant="body"
                        data-trigger-type={item.triggerType}
                        data-configuration-id={item.id}
                      >
                        {summarize(item)}
                      </Typography>
                      {editing && definition && editDraft ? (
                        <form
                          className={styles.formCard}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleEdit(item);
                          }}
                          noValidate
                        >
                          <ParameterFields
                            definition={definition}
                            draft={editDraft}
                            idPrefix={`proactive-edit-${item.id}`}
                            onChange={(next) => setEditDraft(next)}
                          />
                          {itemErrors[item.id] ? (
                            <Typography as="p" variant="body" className={styles.formError} role="alert">
                              {itemErrors[item.id]}
                            </Typography>
                          ) : null}
                          <div className={styles.formActions}>
                            <Button type="submit" variant="primary" size="sm" loading={saving}>
                              Salvar alterações
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft(null);
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {itemErrors[item.id] ? (
                            <Typography as="p" variant="body" className={styles.formError} role="alert">
                              {itemErrors[item.id]}
                            </Typography>
                          ) : null}
                          <div className={styles.formActions}>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={saving}
                              onClick={() => {
                                setEditingId(item.id);
                                setEditDraft(draftFromConfiguration(item));
                                setItemErrors((current) => ({ ...current, [item.id]: '' }));
                              }}
                            >
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
                              onClick={() => void handleDelete(item)}
                            >
                              Excluir
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Sugestões" data-testid="proactive-trigger-suggestions">
            <Typography as="h3" variant="title">
              Sugestões
            </Typography>
            <Typography as="p" variant="body" className={styles.formDescription}>
              Clique para preencher o formulário de criação. Nada é gravado até salvar.
            </Typography>
            <div className={localStyles.suggestionRow}>
              {catalog.types.some((item) => item.type === 'REVENUE_GOAL_PERCENTAGE')
                ? catalog.suggestedDefaults.revenueGoalPercentages.map((percentage) => (
                    <Button
                      key={`revenue-${percentage}`}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        applySuggestion({
                          ...emptyDraft('REVENUE_GOAL_PERCENTAGE'),
                          percentage: String(percentage),
                        })
                      }
                    >
                      {`Meta ${percentage}%`}
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
                        applySuggestion({
                          ...emptyDraft('EXPENSE_CEILING_PERCENTAGE'),
                          percentage: String(percentage),
                        })
                      }
                    >
                      {`Teto ${percentage}%`}
                    </Button>
                  ))
                : null}
              {catalog.suggestedDefaults.expenseCeilingExceeded &&
              catalog.types.some((item) => item.type === 'EXPENSE_CEILING_EXCEEDED') ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applySuggestion(emptyDraft('EXPENSE_CEILING_EXCEEDED'))}
                >
                  Estouro do teto
                </Button>
              ) : null}
              {catalog.types.some((item) => item.type === 'TITLE_DUE_SOON') ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    applySuggestion({
                      ...emptyDraft('TITLE_DUE_SOON'),
                      daysAhead: String(catalog.suggestedDefaults.titleDueSoon.daysAhead),
                      minimumAmount: catalog.suggestedDefaults.titleDueSoon.minimumAmount,
                      titleKind: catalog.suggestedDefaults.titleDueSoon.titleKind,
                    })
                  }
                >
                  {`Título em ${catalog.suggestedDefaults.titleDueSoon.daysAhead} dias`}
                </Button>
              ) : null}
            </div>
          </section>

          <form className={styles.formCard} onSubmit={(event) => void handleCreate(event)} noValidate>
            <Typography as="h3" variant="title">
              Novo gatilho
            </Typography>
            <FormField label="Tipo do gatilho" htmlFor="proactive-create-type" required>
              <NativeSelect
                id="proactive-create-type"
                name="triggerType"
                value={draft.triggerType}
                onChange={(event) => {
                  setDraft(emptyDraft(event.target.value));
                  setCreateError(null);
                  setCreateSuccess(null);
                }}
              >
                {catalog.types.map((item) => (
                  <option key={item.type} value={item.type}>
                    {triggerLabel(item.type)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {selected ? (
              <ParameterFields
                definition={selected}
                draft={draft}
                idPrefix="proactive-create"
                onChange={(next) => setDraft(next)}
              />
            ) : null}
            {createError ? (
              <Typography as="p" variant="body" className={styles.formError} role="alert">
                {createError}
              </Typography>
            ) : null}
            {createSuccess ? (
              <Typography as="p" variant="body" className={styles.formSuccess}>
                {createSuccess}
              </Typography>
            ) : null}
            <div className={styles.formActions}>
              <Button type="submit" variant="primary" loading={saving}>
                Salvar gatilho
              </Button>
            </div>
          </form>
        </div>
      )}
    </CompanySectionNav>
  );
}
