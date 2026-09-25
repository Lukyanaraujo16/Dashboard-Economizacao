import type { ConsultantConversation } from '../../services/consultant';

export type ConversationHistoryGroup = 'Hoje' | 'Ontem' | 'Anteriores';

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function conversationGroupLabel(
  iso: string,
  now: Date = new Date(),
): ConversationHistoryGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Anteriores';
  }
  const diffDays = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (diffDays <= 0) {
    return 'Hoje';
  }
  if (diffDays === 1) {
    return 'Ontem';
  }
  return 'Anteriores';
}

export function conversationTimeLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const group = conversationGroupLabel(iso, now);
  if (group === 'Hoje') {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (group === 'Ontem') {
    return 'Ontem';
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function groupConversations(
  conversations: readonly ConsultantConversation[],
  now: Date = new Date(),
): ReadonlyArray<{ readonly label: ConversationHistoryGroup; readonly items: readonly ConsultantConversation[] }> {
  const buckets: Record<ConversationHistoryGroup, ConsultantConversation[]> = {
    Hoje: [],
    Ontem: [],
    Anteriores: [],
  };
  for (const conversation of conversations) {
    buckets[conversationGroupLabel(conversation.lastMessageAt, now)].push(conversation);
  }
  return (['Hoje', 'Ontem', 'Anteriores'] as const)
    .map((label) => ({ label, items: buckets[label] }))
    .filter((group) => group.items.length > 0);
}
