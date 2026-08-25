import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { THEME_PREFERENCE_BOOTSTRAP_SCRIPT } from '../src/theme/preference/theme-preference-storage';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dashboard Economização',
  description: 'Plataforma SaaS multiempresa de inteligência financeira.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Script id="theme-preference-bootstrap" strategy="beforeInteractive">
          {THEME_PREFERENCE_BOOTSTRAP_SCRIPT}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
