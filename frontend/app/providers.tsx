'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '../src/auth';
import { RuntimeThemeProvider } from '../src/theme/provider/runtime-theme-provider';

type AppProvidersProps = {
  readonly children: ReactNode;
};

/** Providers de infraestrutura (sessão + tema com branding runtime 1.3F). */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <RuntimeThemeProvider>{children}</RuntimeThemeProvider>
    </AuthProvider>
  );
}
