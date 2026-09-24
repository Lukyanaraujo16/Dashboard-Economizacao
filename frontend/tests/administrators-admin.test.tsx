import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import AdministradoresLayout from '../app/(authenticated)/administradores/layout';
import { AdministratorsPage, AdministratorFormPage } from '../src/components/administrators';
import type { ManagedUser } from '../src/services/admin/managed-user.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
const pushMock = vi.fn();

const adminA: ManagedUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Alice Admin',
  email: 'alice@platform.test',
  role: 'ADMIN',
  status: 'ACTIVE',
  tenantId: null,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T11:00:00.000Z',
  deactivatedAt: null,
};

const adminB: ManagedUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Bob Admin',
  email: 'bob@platform.test',
  role: 'ADMIN',
  status: 'BLOCKED',
  tenantId: null,
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T12:00:00.000Z',
  deactivatedAt: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function listResponse(items: ReadonlyArray<ManagedUser>) {
  return jsonResponse({
    data: items,
    pagination: { limit: 10, offset: 0, total: items.length, hasMore: false },
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    refresh: vi.fn(),
  }),
  usePathname: () => '/administradores',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: 'page' | 'true' | 'false' | boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderAdministratorsPage(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  const user = { ...mockAuthenticatedUser, role, tenantId: null };
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <AdministradoresLayout>
          <AdministratorsPage />
        </AdministradoresLayout>
      </AuthenticatedLayout>
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
      hydrateOnMount: true,
    },
  );
}

function renderShell(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
  const user = { ...mockAuthenticatedUser, role, tenantId: role === 'USER' ? 'tenant-1' : null };
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <AdministratorsPage />
      </AuthenticatedLayout>
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
      hydrateOnMount: true,
    },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
  pushMock.mockReset();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listResponse([adminA, adminB])));
});

describe('UI administrativa de Administradores (1.4D)', () => {
  describe('sidebar / guards', () => {
    it('ADMIN vê item Administradores', async () => {
      renderShell('ADMIN');
      expect(await screen.findByRole('link', { name: 'Administradores' })).toBeTruthy();
    });

    it('SUPER_ADMIN vê item Administradores', async () => {
      renderShell('SUPER_ADMIN');
      expect(await screen.findByRole('link', { name: 'Administradores' })).toBeTruthy();
    });

    it('USER não vê item Administradores', async () => {
      renderShell('USER');
      await screen.findByRole('link', { name: 'Dashboard' });
      expect(screen.queryByRole('link', { name: 'Administradores' })).toBeNull();
    });

    it('USER é bloqueado pelo RequirePlatformRole', async () => {
      renderAdministratorsPage('USER');
      expect((await screen.findByRole('alert')).textContent).toMatch(/acesso não permitido/i);
    });
  });

  describe('listagem', () => {
    it('lista administradores com colunas esperadas e sem role/UUID', async () => {
      renderAdministratorsPage('ADMIN');
      const table = await screen.findByRole('table', { name: 'Administradores cadastrados' });
      expect(within(table).getByText('Alice Admin')).toBeTruthy();
      expect(within(table).getByText('alice@platform.test')).toBeTruthy();
      expect(within(table).getByText('Ativo')).toBeTruthy();
      expect(within(table).queryByText('ADMIN')).toBeNull();
      expect(within(table).queryByText(adminA.id)).toBeNull();
      expect(within(table).queryByText('SUPER_ADMIN')).toBeNull();
    });

    it('empty state com CTA de cadastro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => Promise.resolve(listResponse([]))),
      );
      renderAdministratorsPage('ADMIN');
      expect(await screen.findByText('Nenhum administrador cadastrado.')).toBeTruthy();
      expect(
        screen.getAllByRole('button', { name: 'Cadastrar primeiro administrador' }).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByRole('button', { name: 'Novo administrador' }).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('mostra conflito do último ADMIN de forma amigável', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && String(url).includes('/block')) {
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'CONFLICT',
                  message:
                    'A plataforma deve preservar ao menos um administrador operacional ativo.',
                },
              },
              409,
            ),
          );
        }
        return Promise.resolve(listResponse([adminA]));
      });
      vi.stubGlobal('fetch', fetchMock);

      renderAdministratorsPage('ADMIN');
      await screen.findByRole('table', { name: 'Administradores cadastrados' });

      fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear Alice Admin' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar bloqueio' }));

      expect(
        await screen.findByText(
          'A plataforma deve preservar ao menos um administrador operacional ativo.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('CONFLICT')).toBeNull();
    });

    it('abre painel de redefinir senha e envia confirmação', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && String(url).includes('/reset-password')) {
          return Promise.resolve(jsonResponse({ status: 'ok', user: adminA }));
        }
        return Promise.resolve(listResponse([adminA, adminB]));
      });
      vi.stubGlobal('fetch', fetchMock);

      renderAdministratorsPage('ADMIN');
      await screen.findByRole('table', { name: 'Administradores cadastrados' });

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Redefinir senha de Alice Admin' })[0]!,
      );
      expect(await screen.findByText(/Redefinir senha de Alice Admin/)).toBeTruthy();

      fireEvent.change(screen.getByLabelText('Nova senha'), {
        target: { value: 'Password#12345' },
      });
      fireEvent.change(screen.getByLabelText('Confirmar senha'), {
        target: { value: 'Password#12345' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([url, init]) =>
              init?.method === 'POST' &&
              String(url).includes(`/administrators/${adminA.id}/reset-password`),
          ),
        ).toBe(true);
      });

      expect(await screen.findByText(/Senha de Alice Admin redefinida com sucesso/)).toBeTruthy();
      expect(screen.queryByDisplayValue('Password#12345')).toBeNull();
    });
  });

  describe('formulário', () => {
    it('criação exige senha e navega após sucesso', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(adminA, 201)));

      renderWithAuth(
        <ThemeProvider>
          <AdministradoresLayout>
            <AdministratorFormPage mode="create" />
          </AdministradoresLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser({
            ...mockAuthenticatedUser,
            role: 'ADMIN',
            tenantId: null,
          }),
          hydrateOnMount: true,
        },
      );

      fireEvent.change(await screen.findByLabelText('Nome'), {
        target: { value: 'Novo Admin' },
      });
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'novo@platform.test' },
      });
      fireEvent.change(screen.getByLabelText('Senha'), {
        target: { value: 'Password#12345' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar administrador' }));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/administradores');
      });
    });

    it('404 no edit mostra Administrador não encontrado', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: { code: 'NOT_FOUND', message: 'Administrador não encontrado.' } },
              404,
            ),
          ),
      );

      renderWithAuth(
        <ThemeProvider>
          <AdministradoresLayout>
            <AdministratorFormPage mode="edit" userId={adminA.id} />
          </AdministradoresLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser({
            ...mockAuthenticatedUser,
            role: 'ADMIN',
            tenantId: null,
          }),
          hydrateOnMount: true,
        },
      );

      expect(await screen.findByText('Administrador não encontrado.')).toBeTruthy();
    });
  });
});
