'use client';

import type { ReactNode } from 'react';

import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import styles from './app-shell.module.css';

type AppShellProps = {
  readonly children: ReactNode;
  readonly title?: string;
};

/**
 * Shell autenticado inicial (1.1F-E.4).
 * Anatomia de navegação — sem dashboard financeiro.
 */
export function AppShell({ children, title = 'Dashboard' }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <AppSidebar />
      <div className={styles.workspace}>
        <AppHeader title={title} />
        <main className={styles.main} id="conteudo-principal">
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
