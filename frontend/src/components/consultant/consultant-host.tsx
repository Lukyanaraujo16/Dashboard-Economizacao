'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useAuth } from '../../auth';
import {
  createConsultantConversation,
  deleteConsultantConversation,
  getConsultantConversation,
  getConsultantStatus,
  listConsultantConversations,
  sendConsultantMessage,
  ConsultantRequestError,
  type ConsultantConversation,
  type ConsultantConversationDetail,
  type ConsultantUserStatus,
} from '../../services/consultant';
import { ConsultantFab } from './consultant-fab';
import { ConsultantPanel } from './consultant-panel';
import {
  resolveConsultantReferenceMonth,
  resolveOperationalConsultantTenantId,
  shouldShowConsultantHost,
  type ConsultantUiState,
} from './consultant-surface';

function toEmptyDetail(conversation: ConsultantConversation): ConsultantConversationDetail {
  return { ...conversation, messages: [] };
}

/**
 * Integração do chat do Consultor no shell autenticado.
 * O host decide sozinho se o FAB aparece — o AppShell só monta `<ConsultantHost />`.
 */
export function ConsultantHost() {
  const { user, support, status } = useAuth();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const visible = status === 'authenticated' && shouldShowConsultantHost(pathname, user, support);
  const operationalTenantId = resolveOperationalConsultantTenantId(user, support);
  const supportActive = support.active;
  const sessionKey = `${user?.id ?? ''}|${operationalTenantId ?? ''}|${supportActive ? '1' : '0'}`;

  const [uiState, setUiState] = useState<ConsultantUiState>('CLOSED');
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const [availability, setAvailability] = useState<ConsultantUserStatus>({
    status: 'NOT_CONFIGURED',
    consultantName: 'Consultor',
  });
  const [conversations, setConversations] = useState<readonly ConsultantConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState<ConsultantConversationDetail | null>(
    null,
  );
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const requestGenRef = useRef(0);
  const statusGenRef = useRef(0);

  const resetChatState = useCallback(() => {
    requestGenRef.current += 1;
    setUiState('CLOSED');
    setAvailabilityReady(false);
    setAvailability({ status: 'NOT_CONFIGURED', consultantName: 'Consultor' });
    setConversations([]);
    setHistoryOpen(false);
    setActiveConversation(null);
    setLoadingMessages(false);
    setSending(false);
    setDraft('');
    setSendError(null);
  }, []);

  useEffect(() => {
    resetChatState();
  }, [resetChatState, sessionKey]);

  useEffect(() => {
    if (!visible) {
      resetChatState();
    }
  }, [resetChatState, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const requestId = ++statusGenRef.current;
    void getConsultantStatus()
      .then((status) => {
        if (requestId !== statusGenRef.current) {
          return;
        }
        setAvailability(status);
        setAvailabilityReady(true);
      })
      .catch(() => {
        if (requestId !== statusGenRef.current) {
          return;
        }
        setAvailability({ status: 'UNAVAILABLE', consultantName: 'Consultor' });
        setAvailabilityReady(true);
      });
  }, [visible, sessionKey]);

  const month = resolveConsultantReferenceMonth(searchParams);

  const openPanel = useCallback(async () => {
    const requestId = ++requestGenRef.current;
    setUiState('LOADING');
    setActiveConversation(null);
    setDraft('');
    setSendError(null);
    try {
      const consultantStatus = await getConsultantStatus();
      if (requestId !== requestGenRef.current) {
        return;
      }
      setAvailability(consultantStatus);
      if (consultantStatus.status !== 'ACTIVE') {
        setConversations([]);
        setUiState('UNAVAILABLE');
        return;
      }

      const nextConversations = await listConsultantConversations();
      if (requestId !== requestGenRef.current) {
        return;
      }
      setConversations(nextConversations);
      setUiState('OPEN');
    } catch {
      if (requestId !== requestGenRef.current) {
        return;
      }
      setConversations([]);
      setUiState('ERROR');
    }
  }, []);

  const closePanel = useCallback(() => {
    setUiState('CLOSED');
    setHistoryOpen(false);
    setLoadingMessages(false);
    setSending(false);
  }, []);

  const selectConversation = useCallback(async (conversationId: string) => {
    const requestId = ++requestGenRef.current;
    setLoadingMessages(true);
    try {
      const detail = await getConsultantConversation(conversationId);
      if (requestId !== requestGenRef.current) {
        return;
      }
      setActiveConversation(detail);
    } catch {
      if (requestId !== requestGenRef.current) {
        return;
      }
      setUiState('ERROR');
      setActiveConversation(null);
    } finally {
      if (requestId === requestGenRef.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    const requestId = ++requestGenRef.current;
    try {
      await deleteConsultantConversation(conversationId);
      if (requestId !== requestGenRef.current) {
        return;
      }
      const remaining = conversations.filter((item) => item.id !== conversationId);
      setConversations(remaining);
      if (activeConversation?.id === conversationId) {
        if (remaining[0]) {
          await selectConversation(remaining[0].id);
        } else {
          setActiveConversation(null);
        }
      }
    } catch {
      if (requestId !== requestGenRef.current) {
        return;
      }
      setSendError('Não foi possível excluir a conversa.');
    }
  }, [activeConversation?.id, conversations, selectConversation]);

  const startNewConversation = useCallback(async () => {
    const requestId = ++requestGenRef.current;
    setLoadingMessages(true);
    try {
      const created = await createConsultantConversation();
      if (requestId !== requestGenRef.current) {
        return;
      }
      setHistoryOpen(false);
      setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setActiveConversation(toEmptyDetail(created));
    } catch {
      if (requestId !== requestGenRef.current) {
        return;
      }
      setUiState('ERROR');
    } finally {
      if (requestId === requestGenRef.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (content === '' || sending || uiState !== 'OPEN') {
      return;
    }

    const requestId = requestGenRef.current;
    setSending(true);
    setSendError(null);
    try {
      let conversation = activeConversation;
      if (!conversation) {
        const created = await createConsultantConversation();
        if (requestId !== requestGenRef.current) {
          return;
        }
        conversation = toEmptyDetail(created);
        setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setActiveConversation(conversation);
      }

      const result = await sendConsultantMessage(conversation.id, {
        content,
        ...(month ? { month } : {}),
      });
      if (requestId !== requestGenRef.current) {
        return;
      }

      setDraft('');
      if (result.conversation) {
        setConversations((current) => {
          const next = current.filter((item) => item.id !== result.conversation!.id);
          return [result.conversation!, ...next];
        });
      }
      setActiveConversation((current) => {
        const base = current ?? conversation;
        const existingIds = new Set(base.messages.map((message) => message.id));
        const nextMessages = [...base.messages];
        if (!existingIds.has(result.userMessage.id)) {
          nextMessages.push(result.userMessage);
        }
        if (!existingIds.has(result.consultantMessage.id)) {
          nextMessages.push(result.consultantMessage);
        }
        return {
          ...base,
          ...(result.conversation ?? {}),
          messages: nextMessages,
          lastMessageAt: result.consultantMessage.createdAt,
        };
      });
    } catch (error) {
      if (requestId !== requestGenRef.current) {
        return;
      }
      if (error instanceof ConsultantRequestError && error.kind === 'rate_limited') {
        setSendError(error.message);
        return;
      }
      if (error instanceof ConsultantRequestError) {
        setSendError(error.message);
        return;
      }
      setSendError('O Consultor está temporariamente indisponível.');
    } finally {
      if (requestId === requestGenRef.current) {
        setSending(false);
      }
    }
  }, [activeConversation, draft, month, sending, uiState]);

  if (!visible) {
    return null;
  }

  const showFab =
    availabilityReady &&
    (availability.status === 'ACTIVE' || availability.status === 'UNAVAILABLE');

  return (
    <>
      {uiState === 'CLOSED' && showFab ? (
        <ConsultantFab
          onOpen={() => void openPanel()}
          available={availability.status === 'ACTIVE'}
          consultantName={availability.consultantName}
        />
      ) : null}
      {uiState !== 'CLOSED' ? (
        <ConsultantPanel
          uiState={uiState}
          consultantName={availability.consultantName}
          available={availability.status === 'ACTIVE'}
          conversations={conversations}
          activeConversation={activeConversation}
          historyOpen={historyOpen}
          loadingMessages={loadingMessages}
          sending={sending}
          sendError={sendError}
          draft={draft}
          onDraftChange={setDraft}
          onClose={closePanel}
          onToggleHistory={() => setHistoryOpen((current) => !current)}
          onSelectConversation={(conversationId) => {
            setHistoryOpen(false);
            void selectConversation(conversationId);
          }}
          onNewConversation={() => void startNewConversation()}
          onDeleteConversation={(conversationId) => void deleteConversation(conversationId)}
          onSend={() => void sendMessage()}
        />
      ) : null}
    </>
  );
}
