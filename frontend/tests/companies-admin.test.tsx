import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import EmpresasLayout from '../app/(authenticated)/empresas/layout';
import EmpresasPage from '../app/(authenticated)/empresas/page';
import NovaEmpresaPage from '../app/(authenticated)/empresas/nova/page';
import { CompaniesPage } from '../src/components/companies/companies-page';
import { CompanyFormPage } from '../src/components/companies/company-form-page';
import type { Company } from '../src/services/admin/companies.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
const pushMock = vi.fn();

const companyA: Company = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'alpha-co',
  displayName: 'Alpha Co',
  status: 'ACTIVE',
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T11:00:00.000Z',
  deactivatedAt: null,
};

const companyB: Company = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'beta-co',
  displayName: 'Beta Co',
  status: 'DISABLED',
  createdAt: '2026-08-14T09:00:00.000Z',
  updatedAt: '2026-08-14T12:00:00.000Z',
  deactivatedAt: '2026-08-14T12:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function listResponse(items: ReadonlyArray<Company>, offset = 0, total?: number) {
  const resolvedTotal = total ?? items.length;
  return jsonResponse({
    data: items,
    pagination: {
      limit: 10,
      offset,
      total: resolvedTotal,
      hasMore: offset + items.length < resolvedTotal,
    },
  });
}

function stubListFetch(items: ReadonlyArray<Company>, offset = 0, total?: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(listResponse(items, offset, total))),
  );
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
  }),
  usePathname: () => '/empresas',
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

function renderCompaniesPage(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  const user = { ...mockAuthenticatedUser, role, tenantId: null };
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <EmpresasLayout>
          <CompaniesPage />
        </EmpresasLayout>
      </AuthenticatedLayout>
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
      hydrateOnMount: true,
    },
  );
}

function renderShell(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
  const user = { ...mockAuthenticatedUser, role, tenantId: null };
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <EmpresasPage />
      </AuthenticatedLayout>
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
      hydrateOnMount: true,
    },
  );
}

async function findCompanyInTable(name: string) {
  const table = await screen.findByRole('table', { name: 'Empresas cadastradas' });
  return within(table).findByText(name);
}

async function getCompanyTable() {
  return screen.findByRole('table', { name: 'Empresas cadastradas' });
}

async function waitForAuthenticatedShell() {
  await screen.findByRole('navigation', { name: 'Seções' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
  pushMock.mockReset();
});

beforeEach(() => {
  replaceMock.mockReset();
  pushMock.mockReset();
});

describe('UI administrativa de Empresas (1.2D)', () => {
  describe('navegação por role', () => {
    it('ADMIN vê item Empresas', async () => {
      stubListFetch([]);
      renderShell('ADMIN');
      expect(await screen.findByRole('link', { name: 'Empresas' })).toBeTruthy();
    });

    it('SUPER_ADMIN vê item Empresas', async () => {
      stubListFetch([]);
      renderShell('SUPER_ADMIN');
      expect(await screen.findByRole('link', { name: 'Empresas' })).toBeTruthy();
    });

    it('USER não vê item Empresas', async () => {
      renderShell('USER');
      await screen.findByRole('link', { name: 'Dashboard' });
      expect(screen.queryByRole('link', { name: 'Empresas' })).toBeNull();
    });
  });

  describe('listagem', () => {
    it('renderiza loading e depois lista empresas', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(listResponse([companyA, companyB])), 50);
            }),
        ),
      );

      renderCompaniesPage('ADMIN');
      await waitForAuthenticatedShell();

      expect(screen.getByLabelText(/carregando empresas/i)).toBeTruthy();
      expect(await findCompanyInTable('Alpha Co')).toBeTruthy();
      expect(within(await getCompanyTable()).getByText('Beta Co')).toBeTruthy();
      expect(screen.queryByText(companyA.id)).toBeNull();
    });

    it('mostra empty state', async () => {
      stubListFetch([]);
      renderCompaniesPage('ADMIN');

      expect(await screen.findByText('Nenhuma empresa cadastrada.')).toBeTruthy();
      expect(
        await screen.findByRole('button', { name: 'Cadastrar primeira empresa' }),
      ).toBeTruthy();
    });

    it('mostra erro e permite retry', async () => {
      let calls = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        calls += 1;
        if (calls <= 2) {
          return Promise.resolve(
            jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Erro' } }, 500),
          );
        }
        return Promise.resolve(listResponse([companyA]));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      expect(await screen.findByText(/não foi possível conectar/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => {
        expect(within(screen.getByRole('table')).getByText('Alpha Co')).toBeTruthy();
      });
    });

    it('filtra ACTIVE', async () => {
      const fetchMock = vi.fn().mockImplementation(() => {
        return Promise.resolve(listResponse([companyA]));
      });
      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      fireEvent.click(screen.getByRole('tab', { name: 'Ativas' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=ACTIVE'))).toBe(
          true,
        );
      });
    });

    it('filtra DISABLED', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(listResponse([companyB])));
      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Beta Co');
      fireEvent.click(screen.getByRole('tab', { name: 'Desativadas' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=DISABLED'))).toBe(
          true,
        );
      });
    });

    it('paginação próxima e anterior', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('offset=10')) {
          return Promise.resolve(listResponse([companyB], 10, 12));
        }
        return Promise.resolve(listResponse([companyA], 0, 12));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('offset=10'))).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('offset=0'))).toBe(true);
      });
    });

    it('traduz status e não exibe UUID na listagem', async () => {
      stubListFetch([companyA, companyB]);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      const table = await getCompanyTable();
      expect(within(table).getAllByText('Ativa').length).toBeGreaterThan(0);
      expect(within(table).getAllByText('Desativada').length).toBeGreaterThan(0);
      expect(screen.queryByText(companyA.id)).toBeNull();
      expect(screen.queryByText(companyB.id)).toBeNull();
    });

    it('mobile mantém cards utilizáveis', async () => {
      stubListFetch([companyA]);
      renderCompaniesPage('ADMIN');

      const cardList = await screen.findByLabelText('Lista de empresas');
      expect(within(cardList).getByText('Alpha Co')).toBeTruthy();
      expect(within(cardList).getByText('alpha-co')).toBeTruthy();
    });
  });

  describe('criação', () => {
    it('abre criação e cadastra empresa', async () => {
      stubListFetch([]);
      renderCompaniesPage('ADMIN');

      fireEvent.click(await screen.findByRole('button', { name: 'Nova empresa' }));
      expect(pushMock).toHaveBeenCalledWith('/empresas/nova');
    });

    it('formulário de criação envia dados e trata 409/422', async () => {
      let submitCount = 0;
      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitCount += 1;
          if (submitCount === 1) {
            return Promise.resolve(
              jsonResponse(
                {
                  error: {
                    code: 'CONFLICT',
                    message: 'Identificador já existe.',
                    details: [{ field: 'name', issue: 'already_exists' }],
                  },
                },
                409,
              ),
            );
          }
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Dados inválidos.',
                  details: [{ field: 'displayName', issue: 'required' }],
                },
              },
              422,
            ),
          );
        }
        return Promise.resolve(listResponse([]));
      });

      vi.stubGlobal('fetch', fetchMock);

      const adminUser = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <NovaEmpresaPage />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(adminUser),
          hydrateOnMount: true,
        },
      );

      fireEvent.change(await screen.findByLabelText('Nome da empresa'), {
        target: { value: 'Nova Co' },
      });
      fireEvent.change(screen.getByLabelText('Identificador'), {
        target: { value: 'nova-co' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar empresa' }));

      expect(await screen.findByText(/identificador já está em uso/i)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar empresa' }));
      expect(await screen.findByText(/verifique os dados informados/i)).toBeTruthy();
    });

    it('gera identificador automaticamente a partir do nome', async () => {
      const adminUser = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <NovaEmpresaPage />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(adminUser),
          hydrateOnMount: true,
        },
      );

      fireEvent.change(await screen.findByLabelText('Nome da empresa'), {
        target: { value: 'Clínica Life Vitória' },
      });

      expect((screen.getByLabelText('Identificador') as HTMLInputElement).value).toBe(
        'clinica-life-vitoria',
      );
    });

    it('interrompe auto-update após edição manual do identificador', async () => {
      const adminUser = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <NovaEmpresaPage />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(adminUser),
          hydrateOnMount: true,
        },
      );

      fireEvent.change(await screen.findByLabelText('Nome da empresa'), {
        target: { value: 'Alpha Co' },
      });
      fireEvent.change(screen.getByLabelText('Identificador'), {
        target: { value: 'meu-identificador' },
      });
      fireEvent.change(screen.getByLabelText('Nome da empresa'), {
        target: { value: 'Beta Co' },
      });

      expect((screen.getByLabelText('Identificador') as HTMLInputElement).value).toBe(
        'meu-identificador',
      );
    });
  });

  describe('edição', () => {
    it('edita empresa', async () => {
      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          return Promise.resolve(jsonResponse({ ...companyA, displayName: 'Alpha Atualizada' }));
        }
        return Promise.resolve(jsonResponse(companyA));
      });

      vi.stubGlobal('fetch', fetchMock);

      const adminUser = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <CompanyFormPage mode="edit" companyId={companyA.id} />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(adminUser),
          hydrateOnMount: true,
        },
      );

      const displayNameInput = await screen.findByLabelText('Nome da empresa');
      await screen.findByDisplayValue('alpha-co');
      fireEvent.change(displayNameInput, { target: { value: 'Alpha Atualizada' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
      });
      expect(pushMock).toHaveBeenCalledWith('/empresas');
    });

    it('não altera identificador automaticamente na edição', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(companyA)));
      vi.stubGlobal('fetch', fetchMock);

      const adminUser = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <CompanyFormPage mode="edit" companyId={companyA.id} />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(adminUser),
          hydrateOnMount: true,
        },
      );

      const displayNameInput = await screen.findByLabelText('Nome da empresa');
      const identifierInput = (await screen.findByRole('textbox', {
        name: /identificador/i,
      })) as HTMLInputElement;
      expect(identifierInput.value).toBe('alpha-co');
      fireEvent.change(displayNameInput, { target: { value: 'Alpha Renomeada' } });
      expect(identifierInput.value).toBe('alpha-co');
    });
  });

  describe('ações iconográficas', () => {
    it('expõe ícones acessíveis na listagem desktop', async () => {
      stubListFetch([companyA]);
      renderCompaniesPage('ADMIN');
      await findCompanyInTable('Alpha Co');

      expect(screen.getByRole('button', { name: 'Editar Alpha Co' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Desativar Alpha Co' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Excluir permanentemente Alpha Co' })).toBeTruthy();
    });
  });

  describe('exclusão permanente', () => {
    it('exige confirmação forte e executa DELETE', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(listResponse([companyA]));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente Alpha Co' }));

      expect(screen.getByText(/esta ação é permanente e não pode ser desfeita/i)).toBeTruthy();
      const deleteButton = screen.getByRole('button', { name: 'Excluir permanentemente' });
      expect(deleteButton.hasAttribute('disabled')).toBe(true);

      fireEvent.change(screen.getByLabelText('Confirmação'), {
        target: { value: 'alpha-co' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
      });
    });

    it('mostra mensagem sanitizada em conflito de dependência', async () => {
      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'CONFLICT',
                  message:
                    'Esta empresa possui usuários vinculados e não pode ser excluída permanentemente.',
                },
              },
              409,
            ),
          );
        }
        return Promise.resolve(listResponse([companyA]));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente Alpha Co' }));
      fireEvent.change(screen.getByLabelText('Confirmação'), {
        target: { value: 'alpha-co' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));

      expect(
        await screen.findByText(/possui usuários vinculados e não pode ser excluída/i),
      ).toBeTruthy();
    });
  });

  describe('desativação e reativação', () => {
    it('desativação exige confirmação e desativa empresa', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/disable')) {
          return Promise.resolve(jsonResponse({ ...companyA, status: 'DISABLED' }));
        }
        return Promise.resolve(listResponse([companyA]));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Alpha Co');
      const table = await getCompanyTable();
      fireEvent.click(within(table).getByRole('button', { name: 'Desativar Alpha Co' }));
      expect(
        screen.getByText(/usuários vinculados a esta empresa perderão o acesso/i),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/disable'))).toBe(true);
      });
    });

    it('reativa empresa', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/reactivate')) {
          return Promise.resolve(jsonResponse(companyA));
        }
        return Promise.resolve(listResponse([companyB]));
      });

      vi.stubGlobal('fetch', fetchMock);
      renderCompaniesPage('ADMIN');

      await findCompanyInTable('Beta Co');
      const table = await getCompanyTable();
      fireEvent.click(within(table).getByRole('button', { name: 'Reativar Beta Co' }));

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/reactivate'))).toBe(
          true,
        );
      });
    });
  });

  describe('acesso negado', () => {
    it('USER vê estado de acesso negado na rota administrativa', async () => {
      const user = { ...mockAuthenticatedUser, role: 'USER' as const };
      renderWithAuth(
        <ThemeProvider>
          <AuthenticatedLayout>
            <EmpresasLayout>
              <CompaniesPage />
            </EmpresasLayout>
          </AuthenticatedLayout>
        </ThemeProvider>,
        {
          getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
          hydrateOnMount: true,
        },
      );

      expect((await screen.findByRole('alert')).textContent).toMatch(/acesso não permitido/i);
    });
  });
});
