'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '../src/auth';
import { ThemeProvider } from '../src/theme/index';

type AppProvidersProps = {
  readonly children: ReactNode;
};

/** Providers de infraestrutura (tema + sessão mínima 1.1F-E.3). */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider preference="system">
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
