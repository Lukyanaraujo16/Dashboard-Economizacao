'use client';

import type { ReactNode } from 'react';

import { ThemeProvider } from '../src/theme/index';

type AppProvidersProps = {
  readonly children: ReactNode;
};

/** Providers de infraestrutura visual (1.1F-A). Sem telas. */
export function AppProviders({ children }: AppProvidersProps) {
  return <ThemeProvider preference="system">{children}</ThemeProvider>;
}
