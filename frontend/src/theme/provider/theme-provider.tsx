'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { resolveTheme } from '../resolver/resolve-theme';
import type { ResolvedColorScheme, TenantBrandingInput, ThemeModePreference } from '../types/theme';
import { applyCssVariables, themeToCssVariables } from '../utils/css-variables';
import { ThemeContext } from './theme-context';

type ThemeProviderProps = {
  readonly children: ReactNode;
  readonly preference?: ThemeModePreference;
  /** Preparado para branding por tenant; ainda sem backend. */
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

/**
 * Fornece ResolvedTheme e aplica CSS variables no documentElement.
 * Não expõe UI de alternância nesta subfase.
 */
export function ThemeProvider({
  children,
  preference = 'system',
  branding = null,
}: ThemeProviderProps) {
  const systemScheme = useSyncExternalStore(
    subscribeToSystemScheme,
    getSystemSchemeSnapshot,
    getServerSystemSchemeSnapshot,
  );

  const theme = resolveTheme({
    preference,
    systemScheme,
    branding,
  });

  useEffect(() => {
    const resolved = resolveTheme({
      preference,
      systemScheme,
      branding,
    });
    const root = document.documentElement;
    applyCssVariables(root, themeToCssVariables(resolved));
    root.dataset.theme = resolved.colorScheme;
    root.style.colorScheme = resolved.colorScheme;
  }, [preference, systemScheme, branding]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference,
        branding,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
