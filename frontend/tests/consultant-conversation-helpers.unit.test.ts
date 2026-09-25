import { afterEach, describe, expect, it } from 'vitest';

import {
  clearActiveConversationId,
  isSafeConversationId,
  readActiveConversationId,
  writeActiveConversationId,
} from '../src/components/consultant/consultant-active-conversation';
import { isNearChatBottom } from '../src/components/consultant/consultant-chat-scroll';
import { conversationGroupLabel, groupConversations } from '../src/components/consultant/consultant-history-groups';

afterEach(() => {
  sessionStorage.clear();
});

describe('active conversation storage', () => {
  it('persiste somente o identificador do usuário/tenant atual', () => {
    writeActiveConversationId('user-1', 'tenant-1', 'conv-1');
    expect(readActiveConversationId('user-1', 'tenant-1')).toBe('conv-1');
    expect(readActiveConversationId('user-2', 'tenant-1')).toBeNull();
    expect(readActiveConversationId('user-1', 'tenant-2')).toBeNull();
    clearActiveConversationId('user-1', 'tenant-1');
    expect(readActiveConversationId('user-1', 'tenant-1')).toBeNull();
  });

  it('rejeita identificadores inseguros', () => {
    expect(isSafeConversationId('../etc/passwd')).toBe(false);
    expect(isSafeConversationId('pending')).toBe(false);
    expect(isSafeConversationId('conv-1')).toBe(true);
    writeActiveConversationId('user-1', 'tenant-1', '../x');
    expect(readActiveConversationId('user-1', 'tenant-1')).toBeNull();
  });
});

describe('chat auto-scroll helpers', () => {
  it('considera próximo do final e distante', () => {
    expect(
      isNearChatBottom({ scrollTop: 700, scrollHeight: 800, clientHeight: 90 }),
    ).toBe(true);
    expect(
      isNearChatBottom({ scrollTop: 0, scrollHeight: 800, clientHeight: 90 }),
    ).toBe(false);
  });
});

describe('histórico agrupado', () => {
  const now = new Date('2026-09-24T15:00:00.000Z');

  it('classifica hoje, ontem e anteriores', () => {
    expect(conversationGroupLabel('2026-09-24T10:00:00.000Z', now)).toBe('Hoje');
    expect(conversationGroupLabel('2026-09-23T10:00:00.000Z', now)).toBe('Ontem');
    expect(conversationGroupLabel('2026-08-01T10:00:00.000Z', now)).toBe('Anteriores');
  });

  it('agrupa listas com uma ou várias conversas', () => {
    const one = groupConversations(
      [
        {
          id: 'c1',
          title: 'A',
          status: 'OPEN',
          startedAt: '2026-09-24T10:00:00.000Z',
          lastMessageAt: '2026-09-24T10:00:00.000Z',
        },
      ],
      now,
    );
    expect(one).toEqual([{ label: 'Hoje', items: [expect.objectContaining({ id: 'c1' })] }]);
    const many = groupConversations(
      [
        {
          id: 'c1',
          title: 'A',
          status: 'OPEN',
          startedAt: '2026-09-24T10:00:00.000Z',
          lastMessageAt: '2026-09-24T10:00:00.000Z',
        },
        {
          id: 'c2',
          title: 'B',
          status: 'OPEN',
          startedAt: '2026-08-01T10:00:00.000Z',
          lastMessageAt: '2026-08-01T10:00:00.000Z',
        },
      ],
      now,
    );
    expect(many.map((group) => group.label)).toEqual(['Hoje', 'Anteriores']);
  });
});
