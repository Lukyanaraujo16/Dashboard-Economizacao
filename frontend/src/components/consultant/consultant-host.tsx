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
  type ConsultantMessage,
  type ConsultantUserStatus,
} from '../../services/consultant';
import {
  clearActiveConversationId,
  isSafeConversationId,
  readActiveConversationId,
  writeActiveConversationId,
} from './consultant-active-conversation';
import { ConsultantFab } from './consultant-fab';
import { ConsultantPanel } from './consultant-panel';
import {
  resolveConsultantReferenceMonth,
  resolveOperationalConsultantTenantId,
  shouldShowConsultantHost,
  type ConsultantUiState,
} from './consultant-surface';

function isOptimisticId(id: string): boolean {
  return id.startsWith('optimistic-') || id === 'pending';
}

function mergeSentMessages(
  current: ConsultantConversationDetail,
  userMessage: ConsultantMessage,
  consultantMessage: ConsultantMessage,
  conversation?: ConsultantConversation,
): ConsultantConversationDetail {
  const persisted = current.messages.filter((message) => !isOptimisticId(message.id));
  const ids = new Set(persisted.map((message) => message.id));
  const nextMessages = [...persisted];
  if (!ids.has(userMessage.id)) {
    nextMessages.push(userMessage);
  }
  if (!ids.has(consultantMessage.id)) {
    nextMessages.push(consultantMessage);
  }
  return {
    ...current,
    ...(conversation ?? {}),
    messages: nextMessages,
    lastMessageAt: consultantMessage.createdAt,
  };
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
  const userId = user?.id ?? '';
  const sessionKey = `${userId}|${operationalTenantId ?? ''}|${supportActive ? '1' : '0'}`;

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
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const panelGenRef = useRef(0);
  const sendGenRef = useRef(0);
  const statusGenRef = useRef(0);

  const persistActiveId = useCallback(
    (conversationId: string | null) => {
      if (!userId || !operationalTenantId) {
        return;
      }
      if (conversationId && isSafeConversationId(conversationId)) {
        writeActiveConversationId(userId, operationalTenantId, conversationId);
        return;
      }
      clearActiveConversationId(userId, operationalTenantId);
    },
    [operationalTenantId, userId],
  );

  const resetChatState = useCallback(() => {
    panelGenRef.current += 1;
    sendGenRef.current += 1;
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
    setRetryContent(null);
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
      .then((nextStatus) => {
        if (requestId !== statusGenRef.current) {
          return;
        }
        setAvailability(nextStatus);
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

  const restoreConversation = useCallback(
    async (conversationId: string, requestId: number) => {
      if (!isSafeConversationId(conversationId)) {
        persistActiveId(null);
        setActiveConversation(null);
        return;
      }
      setLoadingMessages(true);
      try {
        const detail = await getConsultantConversation(conversationId);
        if (requestId !== panelGenRef.current) {
          return;
        }
        setActiveConversation(detail);
        persistActiveId(detail.id);
      } catch (error) {
        if (requestId !== panelGenRef.current) {
          return;
        }
        persistActiveId(null);
        setActiveConversation(null);
        if (
          !(error instanceof ConsultantRequestError) ||
          (error.kind !== 'not_found' && error.kind !== 'forbidden')
        ) {
          setUiState('ERROR');
        }
      } finally {
        if (requestId === panelGenRef.current) {
          setLoadingMessages(false);
        }
      }
    },
    [persistActiveId],
  );

  const openPanel = useCallback(async () => {
    const requestId = ++panelGenRef.current;
    setHistoryOpen(false);
    setSendError(null);
    if (!activeConversation) {
      setUiState('LOADING');
    } else {
      setUiState('OPEN');
    }
    try {
      const consultantStatus = await getConsultantStatus();
      if (requestId !== panelGenRef.current) {
        return;
      }
      setAvailability(consultantStatus);
      if (consultantStatus.status !== 'ACTIVE') {
        setConversations([]);
        setUiState('UNAVAILABLE');
        return;
      }

      const nextConversations = await listConsultantConversations();
      if (requestId !== panelGenRef.current) {
        return;
      }
      setConversations(nextConversations);
      setUiState('OPEN');

      const storedId =
        activeConversation && isSafeConversationId(activeConversation.id)
          ? activeConversation.id
          : userId && operationalTenantId
            ? readActiveConversationId(userId, operationalTenantId)
            : null;
      if (storedId) {
        await restoreConversation(storedId, requestId);
      }
    } catch {
      if (requestId !== panelGenRef.current) {
        return;
      }
      setConversations([]);
      setUiState('ERROR');
    }
  }, [activeConversation, operationalTenantId, restoreConversation, userId]);

  const closePanel = useCallback(() => {
    setUiState('CLOSED');
    setHistoryOpen(false);
  }, []);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      const requestId = ++panelGenRef.current;
      sendGenRef.current += 1;
      setSending(false);
      setSendError(null);
      setRetryContent(null);
      await restoreConversation(conversationId, requestId);
    },
    [restoreConversation],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const requestId = ++panelGenRef.current;
      try {
        await deleteConsultantConversation(conversationId);
        if (requestId !== panelGenRef.current) {
          return;
        }
        const remaining = conversations.filter((item) => item.id !== conversationId);
        setConversations(remaining);
        if (activeConversation?.id === conversationId) {
          persistActiveId(null);
          setActiveConversation(null);
        }
      } catch {
        if (requestId !== panelGenRef.current) {
          return;
        }
        setSendError('Não foi possível excluir a conversa.');
      }
    },
    [activeConversation?.id, conversations, persistActiveId],
  );

  const startNewConversation = useCallback(() => {
    panelGenRef.current += 1;
    sendGenRef.current += 1;
    persistActiveId(null);
    setHistoryOpen(false);
    setActiveConversation(null);
    setLoadingMessages(false);
    setSending(false);
    setDraft('');
    setSendError(null);
    setRetryContent(null);
  }, [persistActiveId]);

  const sendMessage = useCallback(
    async (contentOverride?: string) => {
      const content = (contentOverride ?? draft).trim();
      if (content === '' || sending || uiState !== 'OPEN') {
        return;
      }

      const requestId = sendGenRef.current;
      const optimistic: ConsultantMessage = {
        id: `optimistic-${Date.now()}`,
        senderType: 'USER',
        content,
        createdAt: new Date().toISOString(),
      };

      setDraft('');
      setSending(true);
      setSendError(null);
      setRetryContent(null);
      setActiveConversation((current) => {
        if (!current || isOptimisticId(current.id)) {
          return {
            id: current?.id && !isOptimisticId(current.id) ? current.id : 'pending',
            title: current?.title ?? null,
            status: 'OPEN',
            startedAt: current?.startedAt ?? optimistic.createdAt,
            lastMessageAt: optimistic.createdAt,
            messages: [...(current?.messages ?? []), optimistic],
          };
        }
        return {
          ...current,
          lastMessageAt: optimistic.createdAt,
          messages: [...current.messages, optimistic],
        };
      });

      try {
        let conversationId = activeConversation && !isOptimisticId(activeConversation.id)
          ? activeConversation.id
          : null;
        if (!conversationId) {
          const created = await createConsultantConversation();
          if (requestId !== sendGenRef.current) {
            return;
          }
          conversationId = created.id;
          persistActiveId(created.id);
          setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
          setActiveConversation((current) => {
            const messages = current?.messages ?? [optimistic];
            return { ...created, messages };
          });
        }

        const result = await sendConsultantMessage(conversationId, {
          content,
          ...(month ? { month } : {}),
        });
        if (requestId !== sendGenRef.current) {
          return;
        }

        if (result.conversation) {
          setConversations((current) => {
            const next = current.filter((item) => item.id !== result.conversation!.id);
            return [result.conversation!, ...next];
          });
          persistActiveId(result.conversation.id);
        } else {
          persistActiveId(conversationId);
        }

        setActiveConversation((current) => {
          const base = current && !isOptimisticId(current.id)
            ? current
            : {
                id: conversationId,
                title: result.conversation?.title ?? null,
                status: result.conversation?.status ?? 'OPEN',
                startedAt: result.conversation?.startedAt ?? optimistic.createdAt,
                lastMessageAt: result.consultantMessage.createdAt,
                messages: current?.messages ?? [optimistic],
              };
          return mergeSentMessages(base, result.userMessage, result.consultantMessage, result.conversation);
        });
      } catch (error) {
        if (requestId !== sendGenRef.current) {
          return;
        }
        setRetryContent(content);
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
        if (requestId === sendGenRef.current) {
          setSending(false);
        }
      }
    },
    [activeConversation, draft, month, persistActiveId, sending, uiState],
  );

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
          onNewConversation={startNewConversation}
          onDeleteConversation={(conversationId) => void deleteConversation(conversationId)}
          onSend={() => void sendMessage()}
          onRetry={retryContent ? () => void sendMessage(retryContent) : undefined}
        />
      ) : null}
    </>
  );
}
