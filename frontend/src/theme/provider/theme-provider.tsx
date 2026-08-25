'use client';

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import {
  getServerThemePreferenceSnapshot,
  readStoredThemePreference,
  subscribeToStoredThemePreference,
  writeStoredThemePreference,
} from '../preference/theme-preference-storage';
import { resolveTheme } from '../resolver/resolve-theme';
import type { ResolvedColorScheme, TenantBrandingInput, ThemeModePreference } from '../types/theme';
import { applyCssVariables, themeToCssVariables } from '../utils/css-variables';
import { ThemeContext } from './theme-context';

type ThemeProviderProps = {
  readonly children: ReactNode;
  /** Modo controlado (testes / playground DEV). Sem prop = preferência persistida. */
  readonly preference?: ThemeModePreference;
  /** Overrides de branding (runtime /admin preview); null = Theme Default. */
  readonly branding?: TenantBrandingInput | null;
};

function subscribeToSystemScheme(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function getSystemSchemeSnapshot(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getServerSystemSchemeSnapshot(): ResolvedColorScheme {
  return 'light';
}

function applyResolvedTheme(
  preference: ThemeModePreference,
  systemScheme: ResolvedColorScheme,
  branding: TenantBrandingInput | null,
): void {
  const resolved = resolveTheme({
    preference,
    systemScheme,
    branding,
  });
  const root = document.documentElement;
  applyCssVariables(root, themeToCssVariables(resolved));
  root.dataset.theme = resolved.colorScheme;
  root.style.colorScheme = resolved.colorScheme;
}

/**
 * Fornece ResolvedTheme e aplica CSS variables no documentElement.
 * Preferência não controlada: localStorage namespaced (sobrevive logout).
 * Controlada: `preference` prop (testes / DEV); não substitui o storage.
 */
export function ThemeProvider({ children, preference, branding = null }: ThemeProviderProps) {
  const storedPreference = useSyncExternalStore(
    subscribeToStoredThemePreference,
    readStoredThemePreference,
    getServerThemePreferenceSnapshot,
  );
  const resolvedPreference = preference ?? storedPreference;
  const systemScheme = useSyncExternalStore(
    subscribeToSystemScheme,
    getSystemSchemeSnapshot,
    getServerSystemSchemeSnapshot,
  );

  const theme = resolveTheme({
    preference: resolvedPreference,
    systemScheme,
    branding,
  });

  const setPreference = useCallback((next: ThemeModePreference) => {
    writeStoredThemePreference(next);
  }, []);

  useEffect(() => {
    // Lê o storage no efeito para não sobrescrever o script de bootstrap
    // com o snapshot de hidratação (`system`) quando a preferência já é light/dark.
    const activePreference = preference ?? readStoredThemePreference();
    applyResolvedTheme(activePreference, getSystemSchemeSnapshot(), branding);
  }, [preference, resolvedPreference, systemScheme, branding]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference: resolvedPreference,
        branding,
        setPreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
