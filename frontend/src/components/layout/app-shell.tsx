'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { ConsultantHost } from '../consultant';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import styles from './app-shell.module.css';
import { ShellBreadcrumbProvider } from './shell-breadcrumb-context';
import { SupportModeBanner } from './support-mode-banner';

export type { ShellPageMeta, ShellSystemBarMeta, ShellBreadcrumb } from './shell-page-meta';
export { resolveShellPageMeta, resolveShellSystemBar } from './shell-page-meta';

type AppShellProps = {
  readonly children: ReactNode;
  /** @deprecated System Bar não usa mais título de página. */
  readonly title?: string;
  /** @deprecated System Bar não usa mais eyebrow de contexto. */
  readonly context?: string;
};

/**
 * Shell autenticado.
 * System Bar (contexto/ações) + sidebar + conteúdo com h1 próprio.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <ShellBreadcrumbProvider>
      <div className={styles.shell}>
        <AppSidebar />
        <div className={styles.workspace}>
          <AppHeader pathname={pathname} />
          <SupportModeBanner />
          <main className={styles.main} id="conteudo-principal">
            <div className={styles.content}>{children}</div>
          </main>
        </div>
        <ConsultantHost />
      </div>
    </ShellBreadcrumbProvider>
  );
}
