import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyProactiveTriggersPage } from '../src/components/companies/company-proactive-triggers-page';
import type { Company } from '../src/services/admin/companies.types';
import type { ProactiveTriggerCatalog } from '../src/services/admin/proactive-triggers.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const company: Company = {
  id: companyId,
  name: 'empresa-exemplo',
  displayName: 'Empresa Exemplo',
  status: 'ACTIVE',
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T11:00:00.000Z',
  deactivatedAt: null,
  integration: null,
};

const catalog: ProactiveTriggerCatalog = {
  types: [
    {
      type: 'REVENUE_GOAL_PERCENTAGE',
      description: 'Meta mensal de faturamento.',
      parameters: [{ name: 'percentage', valueKind: 'integer', required: true }],
    },
    {
      type: 'EXPENSE_CEILING_PERCENTAGE',
      description: 'Teto percentual de despesas.',
      parameters: [{ name: 'percentage', valueKind: 'integer', required: true }],
    },
    {
      type: 'EXPENSE_CEILING_EXCEEDED',
      description: 'Despesas ultrapassaram o teto.',
      parameters: [],
    },
    {
      type: 'TITLE_DUE_SOON',
      description: 'Título próximo do vencimento.',
      parameters: [
        { name: 'daysAhead', valueKind: 'integer', required: true },
        { name: 'minimumAmount', valueKind: 'decimal', required: true },
        { name: 'titleKind', valueKind: 'titleKind', required: true },
      ],
    },
  ],
  suggestedDefaults: {
    revenueGoalPercentages: [80, 90, 100],
    expenseCeilingPercentages: [80, 90, 100],
    expenseCeilingExceeded: true,
    titleDueSoon: {
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    },
  },
};

const existingConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  triggerType: 'REVENUE_GOAL_PERCENTAGE',
  parameterKey: 'parameterKey:percentage:80',
  occurrenceKey: 'occurrenceKey',
  percentage: 80,
  daysAhead: null,
  minimumAmount: null,
  titleKind: null,
  active: true,
};

const titleConfiguration = {
  id: '33333333-3333-4333-8333-333333333333',
  triggerType: 'TITLE_DUE_SOON',
  parameterKey: 'daysAhead:3|kind:PAYABLE|minimumAmount:5000.0000',
  percentage: null,
  daysAhead: 3,
  minimumAmount: '5000.0000',
  titleKind: 'PAYABLE',
  active: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => `/empresas/${companyId}/gatilhos`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type FetchOptions = {
  readonly catalog?: ProactiveTriggerCatalog;
  readonly configurations?: readonly unknown[];
  readonly postStatus?: number;
  readonly deleteStatus?: number;
  readonly holdPost?: boolean;
};

function installFetch(options?: FetchOptions) {
  const activeCatalog = options?.catalog ?? catalog;
  const configurations = [...(options?.configurations ?? [existingConfiguration])];
  let releasePost: ((response: Response) => void) | null = null;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/admin/proactive-triggers/catalog')) {
      return jsonResponse(activeCatalog);
    }

    if (url.endsWith(`/admin/tenants/${companyId}/proactive-triggers`) && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        triggerType: string;
        parameters: { percentage?: number };
      };
      const response = jsonResponse(
        {
          id: '22222222-2222-4222-8222-222222222222',
          triggerType: body.triggerType,
          percentage: body.parameters.percentage ?? null,
          daysAhead: null,
          minimumAmount: null,
          titleKind: null,
          active: true,
        },
        options?.postStatus ?? 201,
      );
      if (options?.holdPost) {
        return new Promise<Response>((resolve) => {
          releasePost = resolve;
        }).then(() => response);
      }
      return response;
    }

    if (url.includes('/active') && method === 'POST') {
      return jsonResponse({ ...existingConfiguration, active: false });
    }

    if (url.includes('/proactive-triggers/') && method === 'PATCH') {
      return jsonResponse({ ...existingConfiguration, percentage: 90 });
    }

    if (url.includes('/proactive-triggers/') && method === 'DELETE') {
      if ((options?.deleteStatus ?? 204) === 409) {
        return jsonResponse(
          { error: { code: 'CONFLICT', message: 'Configuração com evento histórico só pode ser desativada.' } },
          409,
        );
      }
      return new Response(null, { status: 204 });
    }

    if (url.endsWith(`/admin/tenants/${companyId}/proactive-triggers`)) {
      return jsonResponse({ data: configurations });
    }

    if (url.endsWith(`/admin/tenants/${companyId}`)) {
      return jsonResponse(company);
    }

    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'não encontrado' } }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, release: () => releasePost };
}

function renderPage() {
  return renderWithAuth(
    <ThemeProvider>
      <CompanyProactiveTriggersPage companyId={companyId} />
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

function callsWithMethod(fetchMock: ReturnType<typeof vi.fn>, method: string) {
  return fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === method);
}

function optionLabels(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.text);
}

async function openCreate() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Novo gatilho' }));
  expect(await screen.findByRole('heading', { name: 'Novo gatilho' })).toBeTruthy();
}

describe('UI admin gatilhos da Lia (F14.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra o nome amigável, esconde chaves técnicas e não abre o formulário sozinho', async () => {
    const { fetchMock } = installFetch();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    expect(screen.getByText('Avisar quando atingir 80% da meta mensal.')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gatilhos da Lia' })).toBeTruthy();
    expect(
      screen.getByText('Defina quando a Lia deve avisar sobre situações financeiras importantes.'),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Novo gatilho' })).toBeNull();
    expect(screen.queryByLabelText(/Tipo de gatilho/)).toBeNull();
    expect(screen.getByTestId('company-section-gatilhos').getAttribute('href')).toBe(
      `/empresas/${companyId}/gatilhos`,
    );

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('parameterKey');
    expect(text).not.toContain('occurrenceKey');
    expect(text).not.toContain('REVENUE_GOAL_PERCENTAGE');
    expect(text).not.toContain('EXPENSE_CEILING_PERCENTAGE');
    expect(text).not.toContain('EXPENSE_CEILING_EXCEEDED');
    expect(text).not.toContain('TITLE_DUE_SOON');
    expect(fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes('/admin/proactive-triggers/catalog'))).toBe(
      true,
    );
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);
  });

  it('mostra o estado vazio e abre o formulário pelo primeiro gatilho', async () => {
    installFetch({ configurations: [] });
    renderPage();

    expect(await screen.findByText('Nenhum gatilho configurado')).toBeTruthy();
    expect(
      screen.getByText(
        'Crie gatilhos para definir em quais situações financeiras a Lia deverá chamar a atenção do usuário.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Tipo de gatilho/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Criar primeiro gatilho' }));
    expect(await screen.findByRole('heading', { name: 'Novo gatilho' })).toBeTruthy();
    expect(screen.getByLabelText(/Tipo de gatilho/)).toBeTruthy();
  });

  it('abre o formulário pelo botão novo gatilho', async () => {
    installFetch();
    renderPage();
    await openCreate();
    expect(screen.getByLabelText(/Tipo de gatilho/)).toBeTruthy();
  });

  it('não oferece tipo ausente no catálogo da API', async () => {
    installFetch({
      catalog: {
        ...catalog,
        types: catalog.types.filter(
          (item) => item.type === 'REVENUE_GOAL_PERCENTAGE' || item.type === 'EXPENSE_CEILING_EXCEEDED',
        ),
      },
      configurations: [],
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Criar primeiro gatilho' }));
    const select = (await screen.findByLabelText(/Tipo de gatilho/)) as HTMLSelectElement;
    expect(optionLabels(select)).toEqual(['Meta de faturamento', 'Teto de gastos — ultrapassado']);
    expect(screen.queryByRole('button', { name: 'Teto em 80%' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Título relevante vencendo' })).toBeNull();
  });

  it('troca o formulário conforme o tipo escolhido', async () => {
    installFetch();
    renderPage();
    await openCreate();

    const select = screen.getByLabelText(/Tipo de gatilho/) as HTMLSelectElement;
    expect(screen.getByLabelText(/Percentual da meta/)).toBeTruthy();
    expect(screen.getByText(/atingir esse percentual da meta mensal/)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'EXPENSE_CEILING_EXCEEDED' } });
    expect(screen.queryByLabelText(/Percentual/)).toBeNull();
    expect(screen.queryByLabelText(/Antecedência/)).toBeNull();
    expect(screen.queryByLabelText(/Valor mínimo/)).toBeNull();
    expect(screen.queryByLabelText(/Tipo do título/)).toBeNull();
    expect(screen.getByText(/ultrapassarem o teto mensal configurado/)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'TITLE_DUE_SOON' } });
    expect(screen.queryByLabelText(/Percentual/)).toBeNull();
    expect(screen.getByLabelText(/Antecedência/)).toBeTruthy();
    expect(screen.getByLabelText(/Valor mínimo/)).toBeTruthy();
    const kind = screen.getByLabelText(/Tipo do título/) as HTMLSelectElement;
    expect(kind.querySelector('option[value="RECEIVABLE"]')?.textContent).toBe('A receber');
    expect(kind.querySelector('option[value="PAYABLE"]')?.textContent).toBe('A pagar');

    fireEvent.change(select, { target: { value: 'EXPENSE_CEILING_PERCENTAGE' } });
    expect(screen.getByLabelText(/Percentual do teto/)).toBeTruthy();
    expect(screen.getByText(/percentual do teto mensal/)).toBeTruthy();
    expect(screen.queryByLabelText(/Antecedência/)).toBeNull();
    expect(screen.queryByLabelText(/Valor mínimo/)).toBeNull();
    expect(screen.queryByLabelText(/Tipo do título/)).toBeNull();
  });

  it('preenche a sugestão sem salvar e só grava ao confirmar', async () => {
    const { fetchMock } = installFetch();
    renderPage();

    await screen.findByRole('heading', { name: 'Meta de faturamento' });
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Teto ultrapassado' }));
    expect(await screen.findByRole('heading', { name: 'Novo gatilho' })).toBeTruthy();
    expect(screen.queryByLabelText(/Percentual/)).toBeNull();
    expect((screen.getByLabelText(/Tipo de gatilho/) as HTMLSelectElement).value).toBe(
      'EXPENSE_CEILING_EXCEEDED',
    );
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('heading', { name: 'Novo gatilho' })).toBeNull();
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Título relevante vencendo' }));
    expect((await screen.findByLabelText(/Antecedência/)) as HTMLInputElement).toBeTruthy();
    expect((screen.getByLabelText(/Antecedência/) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/Valor mínimo/) as HTMLInputElement).value).toBe('5.000,00');
    expect((screen.getByLabelText(/Tipo do título/) as HTMLSelectElement).value).toBe('PAYABLE');
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Meta em 80%' }));
    expect((screen.getByLabelText(/Tipo de gatilho/) as HTMLSelectElement).value).toBe(
      'REVENUE_GOAL_PERCENTAGE',
    );
    expect((screen.getByLabelText(/Percentual da meta/) as HTMLInputElement).value).toBe('80');
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar gatilho' }));

    await waitFor(() => {
      expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(1);
    });

    const post = callsWithMethod(fetchMock, 'POST')[0];
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body).toEqual({
      triggerType: 'REVENUE_GOAL_PERCENTAGE',
      parameters: { percentage: 80 },
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Novo gatilho' })).toBeNull();
    });
    expect(screen.getByRole('status').textContent).toContain('Gatilho salvo.');
  });

  it('edita um gatilho com os dados já preenchidos', async () => {
    const { fetchMock } = installFetch({ configurations: [existingConfiguration, titleConfiguration] });
    renderPage();

    const item = (await screen.findByText(/A partir de R\$\s*5\.000,00/)).closest(
      '[data-testid="proactive-trigger-item"]',
    );
    expect(item).toBeTruthy();
    fireEvent.click(within(item as HTMLElement).getByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('heading', { name: 'Editar gatilho' })).toBeTruthy();
    expect(screen.queryByLabelText(/Tipo de gatilho/)).toBeNull();
    expect(screen.getByText('Título próximo do vencimento')).toBeTruthy();
    expect((screen.getByLabelText(/Antecedência/) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/Valor mínimo/) as HTMLInputElement).value).toBe('5.000,00');
    expect((screen.getByLabelText(/Tipo do título/) as HTMLSelectElement).value).toBe('PAYABLE');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar gatilho' }));
    await waitFor(() => {
      expect(callsWithMethod(fetchMock, 'PATCH')).toHaveLength(1);
    });
    const patch = callsWithMethod(fetchMock, 'PATCH')[0];
    const body = JSON.parse(String((patch?.[1] as RequestInit).body));
    expect(body).toEqual({
      parameters: { daysAhead: 3, minimumAmount: '5000.00', titleKind: 'PAYABLE' },
    });
  });

  it('ativa e desativa sem abrir o formulário', async () => {
    const { fetchMock } = installFetch();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    await waitFor(() => {
      expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(1);
    });
    const post = callsWithMethod(fetchMock, 'POST')[0];
    expect(requestUrl(post?.[0] as RequestInfo).endsWith('/active')).toBe(true);
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ active: false });
    expect(screen.queryByRole('heading', { name: 'Novo gatilho' })).toBeNull();
  });

  it('pede confirmação antes de excluir', async () => {
    const { fetchMock } = installFetch();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('group', { name: 'Confirmar exclusão' })).toBeTruthy();
    expect(callsWithMethod(fetchMock, 'DELETE')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => {
      expect(callsWithMethod(fetchMock, 'DELETE')).toHaveLength(1);
    });
  });

  it('explica em linguagem simples quando o gatilho tem histórico', async () => {
    installFetch({ deleteStatus: 409 });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    expect(
      await screen.findByText(
        'Este gatilho já possui histórico e não pode ser excluído. Você pode desativá-lo.',
      ),
    ).toBeTruthy();
  });

  it('indica o salvamento e não envia o formulário duas vezes', async () => {
    const { fetchMock, release } = installFetch({ holdPost: true });
    renderPage();
    await openCreate();

    fireEvent.change(screen.getByLabelText(/Percentual da meta/), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar gatilho' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar gatilho/ }));

    await waitFor(() => {
      expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(1);
    });
    const saveButton = screen.getByRole('button', { name: /Salvar gatilho/ });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    expect(saveButton.getAttribute('aria-busy')).toBe('true');

    const resolve = release();
    expect(resolve).toBeTruthy();
    resolve?.(jsonResponse({ id: '22222222-2222-4222-8222-222222222222' }, 201));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Novo gatilho' })).toBeNull();
    });
  });
});
