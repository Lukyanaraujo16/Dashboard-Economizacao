'use client';

import type { ReactNode } from 'react';

import { RequireSession } from '../../src/auth/require-session';
import { AppShell } from '../../src/components/layout';

type AuthenticatedLayoutProps = {
  readonly children: ReactNode;
};

/**
 * Área autenticada do produto.
 * Guard de UX + shell inicial (1.1F-E.4). Segurança de API permanece no backend.
 */
export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
