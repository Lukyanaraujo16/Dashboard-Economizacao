'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Preferência visual da sidebar no navegador atual. Sem usuário, tenant ou segredo. */
export const SIDEBAR_PREFERENCE_STORAGE_KEY = 'dashboard-economizacao:sidebar';

const SIDEBAR_PREFERENCE_CHANGE_EVENT = 'dashboard-economizacao:sidebar-change';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_PREFERENCE_STORAGE_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SIDEBAR_PREFERENCE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SIDEBAR_PREFERENCE_CHANGE_EVENT, onStoreChange);
  };
}

/**
 * Estado recolhido/expandido da sidebar, persistido em localStorage.
 * A shell só monta no cliente (após RequireSession), então o primeiro render já usa o valor salvo.
 */
export function useSidebarCollapsed(): readonly [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  const toggle = useCallback(() => {
    const next = readCollapsed() ? 'expanded' : 'collapsed';
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, next);
    } catch {
      // Private mode / quota: segue sem persistir.
    }
    window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_CHANGE_EVENT));
  }, []);

  return [collapsed, toggle] as const;
}
