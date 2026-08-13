import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
