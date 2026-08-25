import type { ThemeModePreference } from '../types/theme';

/** Preferência de tema da UI no navegador atual. Sem usuário, tenant ou segredo. */
export const THEME_PREFERENCE_STORAGE_KEY = 'dashboard-economizacao:theme-preference';

const THEME_PREFERENCE_CHANGE_EVENT = 'dashboard-economizacao:theme-preference-change';

const THEME_MODE_PREFERENCES = [
  'light',
  'dark',
  'system',
] as const satisfies ReadonlyArray<ThemeModePreference>;

export function isThemeModePreference(value: unknown): value is ThemeModePreference {
  return typeof value === 'string' && (THEME_MODE_PREFERENCES as readonly string[]).includes(value);
}

/** Valor inválido ou ausente → system. */
export function parseThemePreference(value: unknown): ThemeModePreference {
  return isThemeModePreference(value) ? value : 'system';
}

export function readStoredThemePreference(): ThemeModePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    if (raw === null) {
      return 'system';
    }
    return parseThemePreference(raw);
  } catch {
    return 'system';
  }
}

export function writeStoredThemePreference(preference: ThemeModePreference): void {
  if (typeof window === 'undefined') {
    return;
  }

  const next = parseThemePreference(preference);

  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, next);
  } catch {
    // Private mode / quota: a sessão atual ainda pode usar o store em memória.
  }

  try {
    window.dispatchEvent(new Event(THEME_PREFERENCE_CHANGE_EVENT));
  } catch {
    // Ambientes sem EventTarget completo.
  }
}

export function subscribeToStoredThemePreference(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_PREFERENCE_STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, onStoreChange);
  };
}

export function getServerThemePreferenceSnapshot(): ThemeModePreference {
  return 'system';
}

/**
 * Script blocking (antes da hidratação) para `data-theme` / `color-scheme`.
 * Não injeta tokens; o ThemeProvider aplica variáveis após o mount.
 */
export const THEME_PREFERENCE_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_PREFERENCE_STORAGE_KEY)};var raw=window.localStorage.getItem(k);var p=raw==="light"||raw==="dark"||raw==="system"?raw:"system";var scheme=p==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var r=document.documentElement;r.setAttribute("data-theme",scheme);r.style.colorScheme=scheme;}catch(e){}})();`;
