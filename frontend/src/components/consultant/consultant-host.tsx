'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useAuth } from '../../auth';
import { currentDashboardMonthKey } from '../../lib/dashboard-month';
import {
  createConsultantConversation,
  getConsultantConversation,
  getConsultantStatus,
  listConsultantConversations,
  sendConsultantMessage,
  type ConsultantConversation,
  type ConsultantConversationDetail,
} from '../../services/consultant';
import { ConsultantFab } from './consultant-fab';
import { ConsultantPanel } from './consultant-panel';
import {
  resolveOperationalConsultantTenantId,
  shouldShowConsultantHost,
  type ConsultantUiState,
} from './consultant-surface';

function resolveConsultantMonth(): string | undefined {
  return currentDashboardMonthKey();
}

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
  const visible = status === 'authenticated' && shouldShowConsultantHost(pathname, user, support);
  const operationalTenantId = resolveOperationalConsultantTenantId(user, support);
  const supportActive = support.active;
  const sessionKey = `${user?.id ?? ''}|${operationalTenantId ?? ''}|${supportActive ? '1' : '0'}`;

  const [uiState, setUiState] = useState<ConsultantUiState>('CLOSED');
  const [conversations, setConversations] = useState<readonly ConsultantConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConsultantConversationDetail | null>(
    null,
  );
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const requestGenRef = useRef(0);

  const resetChatState = useCallback(() => {
    requestGenRef.current += 1;
    setUiState('CLOSED');
    setConversations([]);
    setActiveConversation(null);
    setLoadingMessages(false);
    setSending(false);
    setDraft('');
  }, []);

  useEffect(() => {
    resetChatState();
  }, [resetChatState, sessionKey]);

  useEffect(() => {
    if (!visible) {
      resetChatState();
    }
  }, [resetChatState, visible]);

  const month = resolveConsultantMonth();

  const openPanel = useCallback(async () => {
    const requestId = ++requestGenRef.current;
    setUiState('LOADING');
    setActiveConversation(null);
    setDraft('');
    try {
      const consultantStatus = await getConsultantStatus();
      if (requestId !== requestGenRef.current) {
        return;
      }
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

  const startNewConversation = useCallback(async () => {
    const requestId = ++requestGenRef.current;
    setLoadingMessages(true);
    try {
      const created = await createConsultantConversation();
      if (requestId !== requestGenRef.current) {
        return;
      }
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
      setActiveConversation((current) => {
        if (result.conversation) {
          return result.conversation;
        }
        const base = current ?? conversation;
        const existingIds = new Set(base.messages.map((message) => message.id));
        const nextMessages = [...base.messages];
        if (!existingIds.has(result.userMessage.id)) {
          nextMessages.push(result.userMessage);
        }
        if (!existingIds.has(result.consultantMessage.id)) {
          nextMessages.push(result.consultantMessage);
        }
        return { ...base, messages: nextMessages, lastMessageAt: result.consultantMessage.createdAt };
      });
    } catch {
      if (requestId !== requestGenRef.current) {
        return;
      }
      setUiState('ERROR');
    } finally {
      if (requestId === requestGenRef.current) {
        setSending(false);
      }
    }
  }, [activeConversation, draft, month, sending, uiState]);

  if (!visible) {
    return null;
  }

  return (
    <>
      {uiState === 'CLOSED' ? <ConsultantFab onOpen={() => void openPanel()} /> : null}
      {uiState !== 'CLOSED' ? (
        <ConsultantPanel
          uiState={uiState}
          conversations={conversations}
          activeConversation={activeConversation}
          loadingMessages={loadingMessages}
          sending={sending}
          draft={draft}
          onDraftChange={setDraft}
          onClose={closePanel}
          onSelectConversation={(conversationId) => void selectConversation(conversationId)}
          onNewConversation={() => void startNewConversation()}
          onSend={() => void sendMessage()}
        />
      ) : null}
    </>
  );
}
