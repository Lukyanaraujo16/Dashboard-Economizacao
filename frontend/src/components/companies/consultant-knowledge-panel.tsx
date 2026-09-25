import { useEffect, type FormEvent, type TextareaHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

import { CONSULTANT_FIELD_LIMITS, type ConsultantKnowledgeEntry } from '../../services/admin/consultant.types';
import { Badge, Button, FormField, Input, Typography } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import { excerptKnowledge } from './consultant-setup-copy';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

export type KnowledgeDraft = {
  readonly title: string;
  readonly content: string;
};

export const EMPTY_KNOWLEDGE_DRAFT: KnowledgeDraft = { title: '', content: '' };

type ConsultantKnowledgePanelProps = {
  readonly draft: KnowledgeDraft;
  readonly editingEntryId: string | null;
  readonly entries: readonly ConsultantKnowledgeEntry[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly success: string | null;
  readonly loadError: string | null;
  readonly pendingDeleteId: string | null;
  readonly onDraftChange: (draft: KnowledgeDraft) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onStartCreate: () => void;
  readonly onStartEdit: (entry: ConsultantKnowledgeEntry) => void;
  readonly onToggle: (entry: ConsultantKnowledgeEntry) => void;
  readonly onAskDelete: (entryId: string | null) => void;
  readonly onConfirmDelete: (entryId: string) => void;
  readonly onDismissSuccess?: () => void;
};

function NativeTextarea({
  invalid = false,
  className,
  ...rest
}: { readonly invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(localStyles.control, localStyles.textarea, invalid && localStyles.controlInvalid, className)}
    />
  );
}

export function ConsultantKnowledgePanel({
  draft,
  editingEntryId,
  entries,
  busy,
  error,
  success,
  loadError,
  pendingDeleteId,
  onDraftChange,
  onSubmit,
  onStartCreate,
  onStartEdit,
  onToggle,
  onAskDelete,
  onConfirmDelete,
  onDismissSuccess,
}: ConsultantKnowledgePanelProps) {
  useEffect(() => {
    if (!success || !onDismissSuccess) {
      return;
    }
    const timer = window.setTimeout(() => {
      onDismissSuccess();
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [onDismissSuccess, success]);

  return (
    <section className={styles.appearanceSection} data-testid="consultant-knowledge">
      {loadError ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {loadError}
        </Typography>
      ) : null}

      <form
        className={localStyles.knowledgeComposer}
        data-testid="consultant-knowledge-form"
        onSubmit={onSubmit}
        noValidate
      >
        <Typography as="h4" variant="label">
          {editingEntryId ? 'Editar conhecimento' : 'Adicionar conhecimento'}
        </Typography>
        <FormField
          label="Título"
          htmlFor="consultant-knowledge-title"
          hint="Dê um nome curto para identificar essa informação."
        >
          <Input
            id="consultant-knowledge-title"
            name="knowledgeTitle"
            value={draft.title}
            maxLength={CONSULTANT_FIELD_LIMITS.knowledgeTitle}
            placeholder="Ex.: Meta mensal de faturamento"
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
          />
        </FormField>
        <FormField
          label="Informação"
          htmlFor="consultant-knowledge-content"
          hint="Adicione o que o Consultor não encontra nos dados financeiros."
        >
          <NativeTextarea
            id="consultant-knowledge-content"
            name="knowledgeContent"
            value={draft.content}
            maxLength={CONSULTANT_FIELD_LIMITS.knowledgeContent}
            placeholder="Ex.: Nossa meta mensal de faturamento é de R$ 250.000,00."
            onChange={(event) => onDraftChange({ ...draft, content: event.target.value })}
          />
        </FormField>
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" loading={busy}>
            {editingEntryId ? 'Salvar conhecimento' : 'Adicionar conhecimento'}
          </Button>
          {editingEntryId ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={onStartCreate}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      {error ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {error}
        </Typography>
      ) : null}

      {success ? (
        <p className={localStyles.knowledgeFeedback} role="status" aria-live="polite">
          <Check size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
          <span>{success}</span>
        </p>
      ) : null}

      {entries.length === 0 ? (
        <Typography as="p" variant="body" className={styles.pageDescription}>
          Nenhum conhecimento cadastrado para esta empresa.
        </Typography>
      ) : (
        <div className={localStyles.knowledgeList}>
          {entries.map((entry) => (
            <article key={entry.id} className={localStyles.knowledgeItem} data-testid={`knowledge-${entry.id}`}>
              <div className={localStyles.knowledgeHeader}>
                <Typography as="p" variant="label">
                  {entry.title}
                </Typography>
                <Badge variant={entry.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {entry.status === 'ACTIVE' ? 'Ativo' : 'Desativado'}
                </Badge>
              </div>
              <Typography as="p" variant="body" className={localStyles.knowledgeExcerpt}>
                {excerptKnowledge(entry.content)}
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
                      loading={busy}
                      onClick={() => onConfirmDelete(entry.id)}
                    >
                      Confirmar exclusão
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => onAskDelete(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => onStartEdit(entry)}>
                    Editar
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => onToggle(entry)}>
                    {entry.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => onAskDelete(entry.id)}>
                    Excluir
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
