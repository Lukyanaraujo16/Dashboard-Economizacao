import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import EmpresasLayout from '../app/(authenticated)/empresas/layout';
import { CompanyUsersPage } from '../src/components/company-users';
import type { ManagedUser } from '../src/services/admin/managed-user.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
const pushMock = vi.fn();
const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const company = {
  id: companyId,
  name: 'acme',
  displayName: 'Acme Corp',
  status: 'ACTIVE',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
  deactivatedAt: null,
  integration: null,
};

const userA: ManagedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'User Acme',
  email: 'user@acme.test',
  role: 'USER',
  status: 'ACTIVE',
  tenantId: companyId,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T11:00:00.000Z',
  deactivatedAt: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    refresh: vi.fn(),
  }),
  usePathname: () => `/empresas/${companyId}/usuarios`,
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

function renderCompanyUsers() {
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <EmpresasLayout>
          <CompanyUsersPage companyId={companyId} />
        </EmpresasLayout>
      </AuthenticatedLayout>
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
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
  pushMock.mockReset();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/users')) {
        return Promise.resolve(
          jsonResponse({
            data: [userA],
            pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
          }),
        );
      }
      return Promise.resolve(jsonResponse(company));
    }),
  );
});

describe('UI Usuários da empresa (1.4D)', () => {
  it('mostra aba Usuários ativa e listagem sem UUID/tenantId', async () => {
    renderCompanyUsers();

    const nav = await screen.findByRole('navigation', { name: 'Seções da empresa' });
    expect(within(nav).getByRole('link', { name: 'Usuários' }).getAttribute('aria-current')).toBe(
      'page',
    );

    expect(screen.getAllByRole('heading', { name: 'Usuários' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Cadastre e gerencie os usuários desta empresa.')).toBeTruthy();

    const table = await screen.findByRole('table', { name: 'Usuários da empresa' });
    expect(within(table).getByText('User Acme')).toBeTruthy();
    expect(within(table).getByText('user@acme.test')).toBeTruthy();
    expect(within(table).queryByText(userA.id)).toBeNull();
    expect(within(table).queryByText(companyId)).toBeNull();
    expect(within(table).queryByText('USER')).toBeNull();
  });

  it('empty state com Novo usuário', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/users')) {
          return Promise.resolve(
            jsonResponse({
              data: [],
              pagination: { limit: 10, offset: 0, total: 0, hasMore: false },
            }),
          );
        }
        return Promise.resolve(jsonResponse(company));
      }),
    );

    renderCompanyUsers();
    expect(await screen.findByText('Nenhum usuário cadastrado.')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Cadastrar primeiro usuário' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Novo usuário' }).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
