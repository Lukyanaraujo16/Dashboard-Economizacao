'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ShellBreadcrumb = {
  readonly label: string;
  readonly href?: string;
};

type ShellBreadcrumbContextValue = {
  readonly breadcrumbs: readonly ShellBreadcrumb[] | null;
  readonly setBreadcrumbs: (items: readonly ShellBreadcrumb[] | null) => void;
};

const ShellBreadcrumbContext = createContext<ShellBreadcrumbContextValue | null>(null);

export function ShellBreadcrumbProvider({ children }: { readonly children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbsState] = useState<readonly ShellBreadcrumb[] | null>(null);
  const setBreadcrumbs = useCallback((items: readonly ShellBreadcrumb[] | null) => {
    setBreadcrumbsState(items);
  }, []);

  const value = useMemo(
    () => ({
      breadcrumbs,
      setBreadcrumbs,
    }),
    [breadcrumbs, setBreadcrumbs],
  );

  return (
    <ShellBreadcrumbContext.Provider value={value}>{children}</ShellBreadcrumbContext.Provider>
  );
}

export function useShellBreadcrumbs() {
  const ctx = useContext(ShellBreadcrumbContext);
  if (!ctx) {
    throw new Error('useShellBreadcrumbs deve ser usado dentro de ShellBreadcrumbProvider.');
  }
  return ctx;
}

/** Versão segura para páginas que podem renderizar fora do shell (testes). */
export function useOptionalShellBreadcrumbs() {
  return useContext(ShellBreadcrumbContext);
}
