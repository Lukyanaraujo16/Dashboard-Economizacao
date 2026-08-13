'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

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
 * Pode operar de forma controlada ou manter a preferência localmente.
 */
export function ThemeProvider({ children, preference, branding = null }: ThemeProviderProps) {
  const [internalPreference, setInternalPreference] = useState<ThemeModePreference>('system');
  const resolvedPreference = preference ?? internalPreference;
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

  useEffect(() => {
    const resolved = resolveTheme({
      preference: resolvedPreference,
      systemScheme,
      branding,
    });
    const root = document.documentElement;
    applyCssVariables(root, themeToCssVariables(resolved));
    root.dataset.theme = resolved.colorScheme;
    root.style.colorScheme = resolved.colorScheme;
  }, [resolvedPreference, systemScheme, branding]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference: resolvedPreference,
        branding,
        setPreference: setInternalPreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
