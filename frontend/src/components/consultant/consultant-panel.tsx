'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, History, Plus, Sparkles, X } from 'lucide-react';

import type {
  ConsultantConversation,
  ConsultantConversationDetail,
  ConsultantMessage,
} from '../../services/consultant';
import { Button, IconButton, Spinner, Typography } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import { isNearChatBottom } from './consultant-chat-scroll';
import { groupConversations, conversationTimeLabel } from './consultant-history-groups';
import { ConsultantMarkdown } from './consultant-markdown';
import { ConsultantPresence } from './consultant-presence';
import {
  CONSULTANT_UNAVAILABLE_MESSAGE,
  type ConsultantUiState,
} from './consultant-surface';
import styles from './consultant.module.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EMPTY_SUGGESTIONS = [
  'Como está meu faturamento este mês?',
  'Tenho valores vencidos?',
  'Como estão minhas despesas?',
] as const;

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
  readonly onRetry?: () => void;
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

function emptyGreeting(consultantName: string): string {
  return consultantName.trim() === 'Consultor' || consultantName.trim().length === 0
    ? 'Olá, sou o Consultor'
    : `Olá, sou a ${consultantName}`;
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
  onRetry,
}: ConsultantPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const followRef = useRef(true);
  const titleId = useId();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const canCompose = uiState === 'OPEN' && !sending;
  const showDesktopBackdrop =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 768px)').matches;
  const historyGroups = groupConversations(conversations);
  const messages = activeConversation?.messages ?? [];
  const showEmpty =
    uiState === 'OPEN' && !loadingMessages && (activeConversation === null || messages.length === 0);

  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    const node = threadRef.current;
    if (!node) {
      return;
    }
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ top: node.scrollHeight, behavior });
      return;
    }
    try {
      node.scrollTop = node.scrollHeight;
    } catch {
      // jsdom may expose a read-only scrollTop in tests
    }
  }, []);

  const jumpToLatest = useCallback(() => {
    followRef.current = true;
    setShowJumpToLatest(false);
    scrollToLatest('smooth');
  }, [scrollToLatest]);

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

  useEffect(() => {
    followRef.current = true;
    setShowJumpToLatest(false);
    const frame = window.requestAnimationFrame(() => scrollToLatest('auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversation?.id, scrollToLatest]);

  useEffect(() => {
    if (!followRef.current) {
      return;
    }
    scrollToLatest('smooth');
  }, [messages.length, sending, scrollToLatest]);

  const handleThreadScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const near = isNearChatBottom({
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    });
    followRef.current = near;
    setShowJumpToLatest(!near);
  }, []);

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
            <ConsultantPresence available={available} />
            <Typography as="h2" variant="title" id={titleId} className={styles.title}>
              {consultantName}
            </Typography>
          </div>
          <div className={styles.headerActions}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Histórico de conversas"
              title="Histórico de conversas"
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
              title="Nova conversa"
              onClick={onNewConversation}
              disabled={uiState !== 'OPEN'}
            >
              <Plus size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Fechar o Consultor"
              title="Fechar o Consultor"
              onClick={onClose}
            >
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
                  historyGroups.map((group) => (
                    <div key={group.label}>
                      <p className={styles.historyGroupLabel}>{group.label}</p>
                      <ul className={styles.historyGroup}>
                        {group.items.map((conversation) => (
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
                                  title={conversationLabel(conversation)}
                                  onClick={() => onSelectConversation(conversation.id)}
                                >
                                  <span className={styles.conversationTitle}>
                                    {conversationLabel(conversation)}
                                  </span>
                                  <span className={styles.conversationMeta}>
                                    {conversationTimeLabel(conversation.lastMessageAt)}
                                  </span>
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
                    </div>
                  ))
                )}
              </aside>
            </>
          ) : null}

          <div
            ref={threadRef}
            className={styles.thread}
            data-testid="consultant-thread"
            onScroll={handleThreadScroll}
          >
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

            {uiState === 'OPEN' && loadingMessages ? (
              <div className={styles.statusBlock}>
                <Spinner label="Carregando mensagens" />
              </div>
            ) : null}

            {showEmpty ? (
              <div className={styles.emptyState} data-empty-state="true" data-testid="consultant-empty">
                <span className={styles.emptyMark} aria-hidden="true">
                  <Sparkles size={18} strokeWidth={UI_ICON_STROKE} />
                </span>
                <Typography as="h3" variant="title">
                  {emptyGreeting(consultantName)}
                </Typography>
                <Typography as="p" variant="body" className={styles.statusText}>
                  Posso ajudar você a entender seus números e tomar decisões com mais contexto.
                </Typography>
                <ul className={styles.emptySuggestions}>
                  {EMPTY_SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        className={styles.suggestionChip}
                        disabled={!canCompose}
                        onClick={() => onDraftChange(suggestion)}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {uiState === 'OPEN' && !loadingMessages && messages.length > 0 ? (
              <div className={styles.messages} aria-live="polite">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cx(styles.message, senderClass(message.senderType))}
                    data-sender={message.senderType}
                    data-optimistic={message.id.startsWith('optimistic-') ? 'true' : undefined}
                  >
                    <Typography as="p" variant="caption" className={styles.messageMeta}>
                      {message.senderType === 'USER'
                        ? 'Você'
                        : message.senderType === 'CONSULTANT'
                          ? consultantName
                          : 'Sistema'}
                    </Typography>
                    {message.senderType === 'CONSULTANT' ? (
                      <ConsultantMarkdown text={message.content} className={styles.markdown} />
                    ) : (
                      <Typography as="p" variant="body">
                        {message.content}
                      </Typography>
                    )}
                  </div>
                ))}
                {sending ? (
                  <div
                    className={cx(styles.message, styles.messageConsultant)}
                    data-testid="consultant-thinking"
                  >
                    <Typography as="p" variant="caption" className={styles.messageMeta}>
                      {consultantName}
                    </Typography>
                    <div
                      className={styles.thinking}
                      role="status"
                      aria-label={`${consultantName} está analisando`}
                    >
                      <span className={styles.thinkingDot} />
                      <span className={styles.thinkingDot} />
                      <span className={styles.thinkingDot} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showJumpToLatest && messages.length > 0 ? (
              <button
                type="button"
                className={styles.scrollBottom}
                aria-label="Ir para as mensagens recentes"
                data-testid="consultant-scroll-latest"
                onClick={jumpToLatest}
              >
                <ChevronDown size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {uiState === 'OPEN' && sendError ? (
          <div className={styles.composerError} role="alert">
            <p className={styles.statusText}>{sendError}</p>
            {onRetry ? (
              <button type="button" className={styles.retryButton} onClick={onRetry}>
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

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
