'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import styles from './app-shell.module.css';

type AppShellProps = {
  readonly children: ReactNode;
  readonly title?: string;
  readonly context?: string;
};

export type ShellPageMeta = {
  readonly context: string;
  readonly title: string;
};

/**
 * Metadados do header a partir da rota.
 * Rotas de Empresa usam contexto "Empresas" — nunca "Visão geral / Dashboard".
 */
export function resolveShellPageMeta(pathname: string): ShellPageMeta {
  if (pathname === '/administradores') {
    return { context: 'Administradores', title: 'Administradores' };
  }
  if (pathname === '/administradores/novo') {
    return { context: 'Administradores', title: 'Novo administrador' };
  }
  if (pathname.startsWith('/administradores/') && pathname.endsWith('/editar')) {
    return { context: 'Administradores', title: 'Editar administrador' };
  }
  if (pathname.startsWith('/administradores')) {
    return { context: 'Administradores', title: 'Administradores' };
  }
  if (pathname === '/empresas') {
    return { context: 'Empresas', title: 'Empresas' };
  }
  if (pathname === '/empresas/nova') {
    return { context: 'Empresas', title: 'Nova empresa' };
  }
  if (pathname.startsWith('/empresas/') && pathname.includes('/usuarios')) {
    if (pathname.endsWith('/novo')) {
      return { context: 'Empresas', title: 'Novo usuário' };
    }
    if (pathname.endsWith('/editar')) {
      return { context: 'Empresas', title: 'Editar usuário' };
    }
    return { context: 'Empresas', title: 'Usuários' };
  }
  if (pathname.startsWith('/empresas/') && pathname.endsWith('/editar')) {
    return { context: 'Empresas', title: 'Geral' };
  }
  if (pathname.startsWith('/empresas/') && pathname.endsWith('/aparencia')) {
    return { context: 'Empresas', title: 'Aparência' };
  }
  if (pathname.startsWith('/empresas/')) {
    return { context: 'Empresas', title: 'Empresa' };
  }
  return { context: 'Visão geral', title: 'Dashboard' };
}

/**
 * Shell autenticado inicial (1.1F-E.4).
 * Anatomia de navegação — sem dashboard financeiro.
 */
export function AppShell({ children, title, context }: AppShellProps) {
  const pathname = usePathname();
  const meta = resolveShellPageMeta(pathname);
  const pageTitle = title ?? meta.title;
  const pageContext = context ?? meta.context;

  return (
    <div className={styles.shell}>
      <AppSidebar />
      <div className={styles.workspace}>
        <AppHeader context={pageContext} title={pageTitle} />
        <main className={styles.main} id="conteudo-principal">
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
