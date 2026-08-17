'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '../src/auth';
import { RuntimePlatformBrandingProvider } from '../src/theme/provider/runtime-platform-branding-provider';
import { RuntimeThemeProvider } from '../src/theme/provider/runtime-theme-provider';

type AppProvidersProps = {
  readonly children: ReactNode;
};

/** Providers de infraestrutura (sessão + branding plataforma + tema runtime). */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <RuntimePlatformBrandingProvider>
        <RuntimeThemeProvider>{children}</RuntimeThemeProvider>
      </RuntimePlatformBrandingProvider>
    </AuthProvider>
  );
}
