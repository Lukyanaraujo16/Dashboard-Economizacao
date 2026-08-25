import { describe, expect, it } from 'vitest';

import { resolveShellPageMeta, resolveShellSystemBar } from '../src/components/layout/app-shell';

describe('resolveShellSystemBar', () => {
  it('rotas simples não exibem breadcrumb', () => {
    expect(resolveShellSystemBar('/')).toEqual({ breadcrumbs: null });
    expect(resolveShellSystemBar('/empresas')).toEqual({ breadcrumbs: null });
    expect(resolveShellSystemBar('/relatorios')).toEqual({ breadcrumbs: null });
    expect(resolveShellSystemBar('/administradores')).toEqual({ breadcrumbs: null });
    expect(resolveShellSystemBar('/configuracoes/aparencia')).toEqual({ breadcrumbs: null });
  });

  it('rotas profundas de empresa usam trilha discreta', () => {
    expect(resolveShellSystemBar('/empresas/nova')).toEqual({
      breadcrumbs: [{ label: 'Empresas', href: '/empresas' }, { label: 'Nova empresa' }],
    });
    expect(
      resolveShellSystemBar('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/usuarios'),
    ).toEqual({
      breadcrumbs: [
        { label: 'Empresas', href: '/empresas' },
        { label: 'Empresa' },
        { label: 'Usuários' },
      ],
    });
    expect(resolveShellSystemBar('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editar')).toEqual({
      breadcrumbs: [
        { label: 'Empresas', href: '/empresas' },
        { label: 'Empresa' },
        { label: 'Geral' },
      ],
    });
    expect(
      resolveShellSystemBar('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aparencia'),
    ).toEqual({
      breadcrumbs: [
        { label: 'Empresas', href: '/empresas' },
        { label: 'Empresa' },
        { label: 'Aparência' },
      ],
    });
  });

  it('rotas profundas de administradores usam trilha discreta', () => {
    expect(resolveShellSystemBar('/administradores/novo')).toEqual({
      breadcrumbs: [
        { label: 'Administradores', href: '/administradores' },
        { label: 'Novo administrador' },
      ],
    });
    expect(
      resolveShellSystemBar('/administradores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editar'),
    ).toEqual({
      breadcrumbs: [
        { label: 'Administradores', href: '/administradores' },
        { label: 'Editar administrador' },
      ],
    });
  });
});

describe('resolveShellPageMeta (compat)', () => {
  it('ainda resolve títulos legados para migração', () => {
    expect(resolveShellPageMeta('/')).toEqual({
      context: 'Visão geral',
      title: 'Dashboard',
    });
    expect(resolveShellPageMeta('/empresas')).toEqual({
      context: 'Empresas',
      title: 'Empresas',
    });
    expect(resolveShellPageMeta('/configuracoes/aparencia')).toEqual({
      context: 'Configurações',
      title: 'Aparência',
    });
  });
});
