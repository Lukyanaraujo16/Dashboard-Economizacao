'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { History, Plus, X } from 'lucide-react';

import type {
  ConsultantConversation,
  ConsultantConversationDetail,
  ConsultantMessage,
} from '../../services/consultant';
import { Button, IconButton, Spinner, Typography } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import {
  CONSULTANT_UNAVAILABLE_MESSAGE,
  type ConsultantUiState,
} from './consultant-surface';
import styles from './consultant.module.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ConsultantPanelProps = {
  readonly uiState: Exclude<ConsultantUiState, 'CLOSED'>;
  readonly consultantName: string;
  readonly available: boolean;
  readonly conversations: readonly ConsultantConversation[];
  readonly activeConversation: ConsultantConversationDetail | null;
  readonly historyOpen: boolean;
  readonly loadingMessages: boolean;
  readonly sending: boolean;
  readonly sendError?: string | null;
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onToggleHistory: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onNewConversation: () => void;
  readonly onDeleteConversation: (conversationId: string) => void;
  readonly onSend: () => void;
};

function conversationLabel(conversation: ConsultantConversation): string {
  const title = conversation.title?.trim();
  return title || 'Nova conversa';
}

function senderClass(senderType: ConsultantMessage['senderType']): string {
  if (senderType === 'USER') {
    return styles.messageUser ?? '';
  }
  if (senderType === 'CONSULTANT') {
    return styles.messageConsultant ?? '';
  }
  return styles.messageSystem ?? '';
}

export function ConsultantPanel({
  uiState,
  consultantName,
  available,
  conversations,
  activeConversation,
  historyOpen,
  loadingMessages,
  sending,
  sendError,
  draft,
  onDraftChange,
  onClose,
  onToggleHistory,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onSend,
}: ConsultantPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const canCompose = uiState === 'OPEN' && !sending;
  const showDesktopBackdrop =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 768px)').matches;

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      if (pendingDeleteId) {
        setPendingDeleteId(null);
        return;
      }
      if (historyOpen) {
        onToggleHistory();
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [historyOpen, onClose, onToggleHistory, pendingDeleteId]);

  const handleTabTrap = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) {
      return;
    }
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCompose) {
      return;
    }
    onSend();
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canCompose) {
        onSend();
      }
    }
  }

  const statusMessage =
    uiState === 'ERROR' || uiState === 'UNAVAILABLE' ? CONSULTANT_UNAVAILABLE_MESSAGE : null;

  const panel = (
    <>
      {showDesktopBackdrop ? (
        <div className={styles.backdrop} onMouseDown={onClose} aria-hidden="true" />
      ) : null}
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleTabTrap}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span
              className={cx(styles.headerStatus, available && styles.headerStatusAvailable)}
              aria-hidden="true"
            />
            <Typography as="h2" variant="title" id={titleId} className={styles.title}>
              {consultantName}
            </Typography>
          </div>
          <div className={styles.headerActions}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Histórico de conversas"
              aria-expanded={historyOpen}
              onClick={onToggleHistory}
              disabled={uiState !== 'OPEN'}
            >
              <History size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Nova conversa"
              onClick={onNewConversation}
              disabled={uiState !== 'OPEN' || sending}
            >
              <Plus size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" variant="ghost" aria-label="Fechar o Consultor" onClick={onClose}>
              <X size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
          </div>
        </header>

        <div className={styles.body}>
          {historyOpen ? (
            <>
              <div
                className={styles.historyBackdrop}
                onMouseDown={onToggleHistory}
                aria-hidden="true"
              />
              <aside className={styles.historyPanel} aria-label="Conversas">
                {conversations.length === 0 ? (
                  <p className={styles.statusText}>Nenhuma conversa ainda.</p>
                ) : (
                  <ul className={styles.conversationList}>
                    {conversations.map((conversation) => (
                      <li key={conversation.id}>
                        {pendingDeleteId === conversation.id ? (
                          <div className={styles.confirmDelete} role="group" aria-label="Confirmar exclusão">
                            <Typography as="p" variant="caption">
                              Excluir esta conversa?
                            </Typography>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                onDeleteConversation(conversation.id);
                                setPendingDeleteId(null);
                              }}
                            >
                              Excluir conversa
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPendingDeleteId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className={styles.conversationRow}>
                            <button
                              type="button"
                              className={styles.conversationButton}
                              aria-current={
                                activeConversation?.id === conversation.id ? 'true' : undefined
                              }
                              onClick={() => onSelectConversation(conversation.id)}
                            >
                              {conversationLabel(conversation)}
                            </button>
                            <button
                              type="button"
                              className={styles.menuButton}
                              aria-label={`Ações de ${conversationLabel(conversation)}`}
                              onClick={() => setPendingDeleteId(conversation.id)}
                            >
                              ⋯
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </>
          ) : null}

          <div className={styles.thread}>
            {uiState === 'LOADING' ? (
              <div className={styles.statusBlock}>
                <Spinner label={`Carregando ${consultantName}`} />
              </div>
            ) : null}

            {statusMessage ? (
              <div className={styles.statusBlock} role="status">
                <p className={styles.statusText}>{statusMessage}</p>
              </div>
            ) : null}

            {uiState === 'OPEN' && sendError ? (
              <div className={styles.statusBlock} role="alert">
                <p className={styles.statusText}>{sendError}</p>
              </div>
            ) : null}

            {uiState === 'OPEN' && loadingMessages ? (
              <div className={styles.statusBlock}>
                <Spinner label="Carregando mensagens" />
              </div>
            ) : null}

            {uiState === 'OPEN' && !loadingMessages && !activeConversation ? (
              <div className={styles.statusBlock} data-empty-state="true">
                <p className={styles.statusText}>
                  Envie a primeira pergunta ou abra o histórico para continuar uma conversa.
                </p>
              </div>
            ) : null}

            {uiState === 'OPEN' && !loadingMessages && activeConversation ? (
              <div className={styles.messages} aria-live="polite">
                {activeConversation.messages.length === 0 ? (
                  <div className={styles.statusBlock} data-empty-state="true">
                    <p className={styles.statusText}>Nenhuma mensagem ainda. Envie a primeira pergunta.</p>
                  </div>
                ) : (
                  activeConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cx(styles.message, senderClass(message.senderType))}
                      data-sender={message.senderType}
                    >
                      <Typography as="p" variant="caption" className={styles.messageMeta}>
                        {message.senderType === 'USER'
                          ? 'Você'
                          : message.senderType === 'CONSULTANT'
                            ? consultantName
                            : 'Sistema'}
                      </Typography>
                      <Typography as="p" variant="body">
                        {message.content}
                      </Typography>
                    </div>
                  ))
                )}
                {sending ? (
                  <div className={cx(styles.message, styles.messageConsultant)} aria-live="polite">
                    <Spinner size="sm" label={`O ${consultantName} está respondendo`} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label className={styles.srOnly} htmlFor={`${titleId}-composer`}>
            Mensagem para o {consultantName}
          </label>
          <textarea
            id={`${titleId}-composer`}
            className={styles.composerField}
            rows={2}
            value={draft}
            disabled={!canCompose}
            placeholder="Pergunte sobre o caixa e os resultados…"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          <Button type="submit" size="md" loading={sending} disabled={!canCompose || draft.trim() === ''}>
            Enviar
          </Button>
        </form>
      </div>
    </>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(panel, document.body);
}
