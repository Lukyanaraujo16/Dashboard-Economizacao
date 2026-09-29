import { useEffect, useId, useRef, type ChangeEvent, type FormEvent } from 'react';

import {
  formatKnowledgeDocumentSize,
  knowledgeDocumentKindLabel,
  knowledgeDocumentProcessingErrorMessage,
  knowledgeDocumentProcessingLabel,
} from '../../services/admin/consultant';
import {
  CONSULTANT_FIELD_LIMITS,
  CONSULTANT_KNOWLEDGE_DOCUMENT_ACCEPT,
  CONSULTANT_KNOWLEDGE_DOCUMENT_MAX_BYTES,
  type ConsultantKnowledgeDocument,
} from '../../services/admin/consultant.types';
import { Badge, Button, FormField, Input, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import styles from './companies.module.css';
import localStyles from './company-consultant.module.css';

export type KnowledgeDocumentUploadDraft = {
  readonly file: File | null;
  readonly title: string;
};

export const EMPTY_DOCUMENT_UPLOAD_DRAFT: KnowledgeDocumentUploadDraft = {
  file: null,
  title: '',
};

type ConsultantKnowledgeDocumentsPanelProps = {
  readonly documents: readonly ConsultantKnowledgeDocument[];
  readonly uploadDraft: KnowledgeDocumentUploadDraft;
  readonly uploading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly success: string | null;
  readonly loadError: string | null;
  readonly pendingDeleteId: string | null;
  readonly composerOpen: boolean;
  readonly onComposerOpenChange: (open: boolean) => void;
  readonly onUploadDraftChange: (draft: KnowledgeDocumentUploadDraft) => void;
  readonly onUpload: (event: FormEvent<HTMLFormElement>) => void;
  readonly onToggle: (document: ConsultantKnowledgeDocument) => void;
  readonly onAskDelete: (documentId: string | null) => void;
  readonly onConfirmDelete: (documentId: string) => void;
  readonly onRefresh: () => void;
  readonly onDismissSuccess?: () => void;
};

function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function processingBadgeVariant(
  status: ConsultantKnowledgeDocument['processingStatus'],
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'READY':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'PROCESSING':
    case 'UPLOADED':
      return 'warning';
  }
}

export function ConsultantKnowledgeDocumentsPanel({
  documents,
  uploadDraft,
  uploading,
  busy,
  error,
  success,
  loadError,
  pendingDeleteId,
  composerOpen,
  onComposerOpenChange,
  onUploadDraftChange,
  onUpload,
  onToggle,
  onAskDelete,
  onConfirmDelete,
  onRefresh,
  onDismissSuccess,
}: ConsultantKnowledgeDocumentsPanelProps) {
  const fileInputId = useId();
  const titleInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionsLocked = busy || uploading;
  const hasPending = documents.some(
    (doc) => doc.processingStatus === 'UPLOADED' || doc.processingStatus === 'PROCESSING',
  );

  useEffect(() => {
    if (!success || !onDismissSuccess) {
      return;
    }
    const timer = window.setTimeout(() => onDismissSuccess(), 2800);
    return () => window.clearTimeout(timer);
  }, [onDismissSuccess, success]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      onUploadDraftChange({ file: null, title: uploadDraft.title });
      return;
    }
    const suggested =
      uploadDraft.title.trim().length > 0
        ? uploadDraft.title
        : file.name
            .replace(/^.*[/\\]/, '')
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    const title =
      suggested.length > 0
        ? suggested.charAt(0).toUpperCase() + suggested.slice(1)
        : uploadDraft.title;
    onUploadDraftChange({ file, title: title.slice(0, CONSULTANT_FIELD_LIMITS.knowledgeTitle) });
  }

  return (
    <section className={localStyles.knowledgeDocumentsSection} data-testid="consultant-knowledge-documents">
      <div className={localStyles.knowledgeSectionHeader}>
        <div>
          <Typography as="h4" variant="label">
            Arquivos
          </Typography>
          <Typography as="p" variant="caption" className={styles.pageDescription}>
            Documentos de referência do Consultor. Formatos aceitos: Markdown (.md) e PDF textual.
            Máximo 5 MB por arquivo.
          </Typography>
        </div>
        <div className={localStyles.knowledgeSectionHeaderActions}>
          {hasPending ? (
            <Button
              type="button"
              variant="ghost"
              disabled={actionsLocked}
              onClick={onRefresh}
              data-testid="knowledge-documents-refresh"
            >
              Atualizar status
            </Button>
          ) : null}
          {!composerOpen ? (
            <Button
              type="button"
              variant="primary"
              disabled={actionsLocked}
              onClick={() => onComposerOpenChange(true)}
              data-testid="knowledge-documents-open-upload"
            >
              Enviar arquivo
            </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {loadError}
        </Typography>
      ) : null}

      {composerOpen ? (
        <form
          className={localStyles.knowledgeComposer}
          data-testid="consultant-knowledge-document-form"
          onSubmit={onUpload}
          noValidate
        >
          <Typography as="h5" variant="label">
            Novo arquivo
          </Typography>
          <FormField
            label="Arquivo"
            htmlFor={fileInputId}
            hint="Selecione um arquivo .md ou .pdf de até 5 MB."
          >
            <input
              ref={fileInputRef}
              id={fileInputId}
              name="knowledgeDocumentFile"
              type="file"
              accept={CONSULTANT_KNOWLEDGE_DOCUMENT_ACCEPT}
              className={cx(localStyles.control, localStyles.fileInput)}
              disabled={actionsLocked}
              onChange={handleFileChange}
            />
          </FormField>
          {uploadDraft.file ? (
            <Typography as="p" variant="caption" className={styles.pageDescription}>
              Selecionado: {uploadDraft.file.name} ·{' '}
              {formatKnowledgeDocumentSize(uploadDraft.file.size)}
              {uploadDraft.file.size > CONSULTANT_KNOWLEDGE_DOCUMENT_MAX_BYTES
                ? ' · acima do limite de 5 MB'
                : ''}
            </Typography>
          ) : null}
          <FormField
            label="Título"
            htmlFor={titleInputId}
            hint="Nome amigável exibido na Base de Conhecimento."
          >
            <Input
              id={titleInputId}
              name="knowledgeDocumentTitle"
              value={uploadDraft.title}
              maxLength={CONSULTANT_FIELD_LIMITS.knowledgeTitle}
              placeholder="Ex.: Base de conhecimento do consultor"
              disabled={actionsLocked}
              onChange={(event) =>
                onUploadDraftChange({ ...uploadDraft, title: event.target.value })
              }
            />
          </FormField>
          <div className={styles.formActions}>
            <Button
              type="submit"
              variant="primary"
              loading={uploading}
              disabled={actionsLocked || !uploadDraft.file}
              data-testid="knowledge-documents-submit"
            >
              Enviar
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={actionsLocked}
              onClick={() => {
                onComposerOpenChange(false);
                onUploadDraftChange(EMPTY_DOCUMENT_UPLOAD_DRAFT);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <Typography as="p" variant="body" className={styles.formError} role="alert">
          {error}
        </Typography>
      ) : null}

      {success ? (
        <p className={localStyles.knowledgeFeedback} role="status" aria-live="polite">
          <span>{success}</span>
        </p>
      ) : null}

      {documents.length === 0 && !composerOpen ? (
        <div className={localStyles.documentsEmpty} data-testid="knowledge-documents-empty">
          <Typography as="p" variant="body" className={styles.pageDescription}>
            Nenhum arquivo anexado. Envie um Markdown ou PDF textual para enriquecer a Base de
            Conhecimento.
          </Typography>
          <Button
            type="button"
            variant="primary"
            disabled={actionsLocked}
            onClick={() => onComposerOpenChange(true)}
          >
            Enviar arquivo
          </Button>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className={localStyles.knowledgeList} data-testid="knowledge-documents-list">
          {documents.map((document) => {
            const kind = knowledgeDocumentKindLabel(document.mimeType, document.originalFileName);
            const canActivate = document.processingStatus === 'READY';
            const showOriginal =
              document.originalFileName.trim().toLowerCase() !==
              `${document.title.trim().toLowerCase()}.md` &&
              document.originalFileName.trim().toLowerCase() !==
                `${document.title.trim().toLowerCase()}.pdf`;

            return (
              <article
                key={document.id}
                className={localStyles.knowledgeItem}
                data-testid={`knowledge-document-${document.id}`}
              >
                <div className={localStyles.knowledgeHeader}>
                  <div className={localStyles.documentTitleBlock}>
                    <Typography as="p" variant="label" className={localStyles.documentTitle}>
                      {document.title}
                    </Typography>
                    {showOriginal ? (
                      <Typography
                        as="p"
                        variant="caption"
                        className={cx(styles.pageDescription, localStyles.documentFileName)}
                      >
                        {document.originalFileName}
                      </Typography>
                    ) : null}
                  </div>
                  <div className={localStyles.documentBadges}>
                    <Badge variant={processingBadgeVariant(document.processingStatus)}>
                      {knowledgeDocumentProcessingLabel(document.processingStatus)}
                    </Badge>
                    <Badge variant={document.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {document.status === 'ACTIVE' ? 'Ativo' : 'Desativado'}
                    </Badge>
                  </div>
                </div>

                <Typography as="p" variant="caption" className={styles.pageDescription}>
                  {kind} · {formatKnowledgeDocumentSize(document.sizeBytes)} ·{' '}
                  {formatDocumentDate(document.updatedAt)}
                </Typography>

                {document.processingStatus === 'FAILED' ? (
                  <Typography as="p" variant="body" className={styles.formError} role="status">
                    {knowledgeDocumentProcessingErrorMessage(document.processingErrorCode)}
                  </Typography>
                ) : null}

                {document.processingStatus === 'READY' ? (
                  <Typography as="p" variant="caption" className={styles.pageDescription}>
                    Arquivos ativos poderão ser utilizados pelo Consultor quando disponíveis para
                    consulta.
                  </Typography>
                ) : null}

                {document.processingStatus === 'UPLOADED' ||
                document.processingStatus === 'PROCESSING' ? (
                  <Typography as="p" variant="caption" className={styles.pageDescription} role="status">
                    Processando arquivo…
                  </Typography>
                ) : null}

                {pendingDeleteId === document.id ? (
                  <div className={styles.confirmPanel} role="group" aria-label="Confirmar exclusão">
                    <Typography as="p" variant="body">
                      Excluir este arquivo da Base de Conhecimento?
                    </Typography>
                    <div className={styles.confirmActions}>
                      <Button
                        type="button"
                        variant="danger"
                        loading={busy}
                        onClick={() => onConfirmDelete(document.id)}
                      >
                        Confirmar exclusão
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onAskDelete(null)}
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
                      disabled={
                        actionsLocked ||
                        (document.status === 'DISABLED' && !canActivate)
                      }
                      title={
                        document.status === 'DISABLED' && !canActivate
                          ? 'Somente documentos prontos podem ser ativados.'
                          : undefined
                      }
                      onClick={() => onToggle(document)}
                    >
                      {document.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={actionsLocked}
                      onClick={() => onAskDelete(document.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
