const STORAGE_PREFIX = 'de.consultant.activeConversation.v1';

export function isSafeConversationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value) && value !== 'pending';
}

export function activeConversationStorageKey(userId: string, tenantId: string): string {
  return `${STORAGE_PREFIX}:${userId}:${tenantId}`;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readActiveConversationId(userId: string, tenantId: string): string | null {
  const store = storage();
  if (!store || userId.length === 0 || tenantId.length === 0) {
    return null;
  }
  try {
    const value = store.getItem(activeConversationStorageKey(userId, tenantId));
    if (!value || !isSafeConversationId(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeActiveConversationId(
  userId: string,
  tenantId: string,
  conversationId: string,
): void {
  const store = storage();
  if (!store || !isSafeConversationId(conversationId)) {
    return;
  }
  try {
    store.setItem(activeConversationStorageKey(userId, tenantId), conversationId);
  } catch {
    // ignore quota / privacy mode
  }
}

export function clearActiveConversationId(userId: string, tenantId: string): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(activeConversationStorageKey(userId, tenantId));
  } catch {
    // ignore
  }
}
