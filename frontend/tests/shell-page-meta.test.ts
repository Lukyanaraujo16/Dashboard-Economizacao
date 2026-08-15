import { describe, expect, it } from 'vitest';

import { resolveShellPageMeta } from '../src/components/layout/app-shell';

describe('resolveShellPageMeta', () => {
  it('usa Visão geral / Dashboard na home', () => {
    expect(resolveShellPageMeta('/')).toEqual({
      context: 'Visão geral',
      title: 'Dashboard',
    });
  });

  it('usa contexto Empresas nas rotas administrativas', () => {
    expect(resolveShellPageMeta('/empresas')).toEqual({
      context: 'Empresas',
      title: 'Empresas',
    });
    expect(resolveShellPageMeta('/empresas/nova')).toEqual({
      context: 'Empresas',
      title: 'Nova empresa',
    });
    expect(resolveShellPageMeta('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editar')).toEqual({
      context: 'Empresas',
      title: 'Geral',
    });
    expect(
      resolveShellPageMeta('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aparencia'),
    ).toEqual({
      context: 'Empresas',
      title: 'Aparência',
    });
    expect(resolveShellPageMeta('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/usuarios')).toEqual(
      {
        context: 'Empresas',
        title: 'Usuários',
      },
    );
    expect(
      resolveShellPageMeta('/empresas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/usuarios/novo'),
    ).toEqual({
      context: 'Empresas',
      title: 'Novo usuário',
    });
  });

  it('usa contexto Administradores nas rotas da plataforma', () => {
    expect(resolveShellPageMeta('/administradores')).toEqual({
      context: 'Administradores',
      title: 'Administradores',
    });
    expect(resolveShellPageMeta('/administradores/novo')).toEqual({
      context: 'Administradores',
      title: 'Novo administrador',
    });
    expect(
      resolveShellPageMeta('/administradores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editar'),
    ).toEqual({
      context: 'Administradores',
      title: 'Editar administrador',
    });
  });
});
