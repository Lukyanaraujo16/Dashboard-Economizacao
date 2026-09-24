/**
 * Metadados da System Bar a partir da rota.
 * Rotas simples: sem breadcrumb (esquerda vazia).
 * Rotas profundas: trilha discreta; CompanySectionNav pode sobrescrever com o nome da empresa.
 */

export type ShellBreadcrumb = {
  readonly label: string;
  readonly href?: string;
};

export type ShellSystemBarMeta = {
  readonly breadcrumbs: readonly ShellBreadcrumb[] | null;
};

/** @deprecated Preferir ShellSystemBarMeta — mantido para migração de testes. */
export type ShellPageMeta = {
  readonly context: string;
  readonly title: string;
};

function companySectionFromPath(pathname: string): string | null {
  if (pathname.includes('/usuarios/novo')) return 'Novo usuário';
  if (pathname.includes('/usuarios/') && pathname.endsWith('/editar')) return 'Editar usuário';
  if (pathname.includes('/usuarios')) return 'Usuários';
  if (pathname.endsWith('/aparencia')) return 'Aparência';
  if (pathname.endsWith('/integracoes')) return 'Integrações';
  if (pathname.endsWith('/consultor')) return 'Consultor Financeiro';
  if (pathname.endsWith('/editar')) return 'Geral';
  return null;
}

/**
 * Resolve breadcrumb estrutural da System Bar.
 * Rotas de listagem simples retornam null (sem título duplicado).
 */
export function resolveShellSystemBar(pathname: string): ShellSystemBarMeta {
  if (
    pathname === '/' ||
    pathname === '/empresas' ||
    pathname === '/relatorios' ||
    pathname === '/administradores' ||
    pathname === '/configuracoes' ||
    pathname === '/configuracoes/aparencia' ||
    pathname === '/configuracoes/consultor'
  ) {
    return { breadcrumbs: null };
  }

  if (pathname === '/empresas/nova') {
    return {
      breadcrumbs: [{ label: 'Empresas', href: '/empresas' }, { label: 'Nova empresa' }],
    };
  }

  if (pathname === '/administradores/novo') {
    return {
      breadcrumbs: [
        { label: 'Administradores', href: '/administradores' },
        { label: 'Novo administrador' },
      ],
    };
  }

  if (pathname.startsWith('/administradores/') && pathname.endsWith('/editar')) {
    return {
      breadcrumbs: [
        { label: 'Administradores', href: '/administradores' },
        { label: 'Editar administrador' },
      ],
    };
  }

  if (pathname.startsWith('/empresas/')) {
    const section = companySectionFromPath(pathname);
    if (section) {
      return {
        breadcrumbs: [
          { label: 'Empresas', href: '/empresas' },
          { label: 'Empresa' },
          { label: section },
        ],
      };
    }
    return {
      breadcrumbs: [{ label: 'Empresas', href: '/empresas' }, { label: 'Empresa' }],
    };
  }

  return { breadcrumbs: null };
}

/**
 * Compat: títulos legados por rota (não usados na System Bar).
 * Preferir headings no conteúdo da página.
 */
export function resolveShellPageMeta(pathname: string): ShellPageMeta {
  const bar = resolveShellSystemBar(pathname);
  if (!bar.breadcrumbs || bar.breadcrumbs.length === 0) {
    if (pathname === '/') return { context: 'Visão geral', title: 'Dashboard' };
    if (pathname.startsWith('/relatorios')) {
      return { context: 'Relatórios', title: 'Relatórios' };
    }
    if (pathname.startsWith('/configuracoes')) {
      return { context: 'Configurações', title: 'Aparência' };
    }
    if (pathname.startsWith('/administradores')) {
      return { context: 'Administradores', title: 'Administradores' };
    }
    if (pathname.startsWith('/empresas')) {
      return { context: 'Empresas', title: 'Empresas' };
    }
    return { context: 'Visão geral', title: 'Dashboard' };
  }

  const last = bar.breadcrumbs[bar.breadcrumbs.length - 1]!;
  const root = bar.breadcrumbs[0]!;
  return { context: root.label, title: last.label };
}
