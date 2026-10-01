import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
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

function installFetch(options?: { readonly catalog?: ProactiveTriggerCatalog; readonly configurations?: readonly unknown[] }) {
  const activeCatalog = options?.catalog ?? catalog;
  const configurations = [...(options?.configurations ?? [existingConfiguration])];
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
      return jsonResponse(
        {
          id: '22222222-2222-4222-8222-222222222222',
          triggerType: body.triggerType,
          percentage: body.parameters.percentage ?? null,
          daysAhead: null,
          minimumAmount: null,
          titleKind: null,
          active: true,
        },
        201,
      );
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
  return fetchMock;
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

function postCalls(fetchMock: ReturnType<typeof installFetch>) {
  return fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
}

function optionLabels(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.text);
}

describe('UI admin gatilhos da Lia (F14.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra o catálogo da API, o nome amigável e esconde chaves técnicas', async () => {
    const fetchMock = installFetch();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'META DE FATURAMENTO' })).toBeTruthy();
    expect(screen.getByText('Avise quando o faturamento atingir 80% da meta mensal.')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.getByText('Avise quando o faturamento atingir X% da meta mensal.')).toBeTruthy();
    expect(screen.getByText('Avise quando as despesas atingirem X% do teto mensal.')).toBeTruthy();
    expect(screen.getByText('Avise quando as despesas ultrapassarem o teto mensal.')).toBeTruthy();
    expect(
      screen.getByText(
        'Avise quando um título a pagar/a receber de pelo menos R$ X vencer nos próximos N dias.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Gatilho inativo não gera novas ocorrências/)).toBeTruthy();
    expect(screen.getByTestId('company-section-gatilhos').getAttribute('href')).toBe(
      `/empresas/${companyId}/gatilhos`,
    );

    const select = screen.getByLabelText(/^Tipo do gatilho/) as HTMLSelectElement;
    expect(optionLabels(select)).toEqual([
      'META DE FATURAMENTO',
      'TETO DE GASTOS — PERCENTUAL',
      'TETO DE GASTOS — ULTRAPASSADO',
      'TÍTULO PRÓXIMO DO VENCIMENTO',
    ]);

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('parameterKey');
    expect(text).not.toContain('occurrenceKey');
    expect(fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes('/admin/proactive-triggers/catalog'))).toBe(
      true,
    );
    expect(postCalls(fetchMock)).toHaveLength(0);
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

    const select = (await screen.findByLabelText(/^Tipo do gatilho/)) as HTMLSelectElement;
    expect(optionLabels(select)).toEqual(['META DE FATURAMENTO', 'TETO DE GASTOS — ULTRAPASSADO']);
  });

  it('troca o formulário conforme o tipo escolhido', async () => {
    installFetch();
    renderPage();

    const select = (await screen.findByLabelText(/^Tipo do gatilho/)) as HTMLSelectElement;
    expect(screen.getByLabelText(/^Percentual/)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'EXPENSE_CEILING_EXCEEDED' } });
    expect(screen.queryByLabelText(/^Percentual/)).toBeNull();
    expect(screen.queryByLabelText(/Antecedência em dias/)).toBeNull();
    expect(screen.queryByLabelText(/^Valor mínimo/)).toBeNull();
    expect(screen.queryByLabelText(/Tipo de título/)).toBeNull();

    fireEvent.change(select, { target: { value: 'TITLE_DUE_SOON' } });
    expect(screen.queryByLabelText(/^Percentual/)).toBeNull();
    expect(screen.getByLabelText(/Antecedência em dias/)).toBeTruthy();
    expect(screen.getByLabelText(/^Valor mínimo/)).toBeTruthy();
    const kind = screen.getByLabelText(/Tipo de título/) as HTMLSelectElement;
    expect(kind.querySelector('option[value="RECEIVABLE"]')?.textContent).toBe('A receber');
    expect(kind.querySelector('option[value="PAYABLE"]')?.textContent).toBe('A pagar');

    fireEvent.change(select, { target: { value: 'EXPENSE_CEILING_PERCENTAGE' } });
    expect(screen.getByLabelText(/^Percentual/)).toBeTruthy();
    expect(screen.queryByLabelText(/Antecedência em dias/)).toBeNull();
    expect(screen.queryByLabelText(/^Valor mínimo/)).toBeNull();
    expect(screen.queryByLabelText(/Tipo de título/)).toBeNull();
  });

  it('preenche a sugestão e só grava ao salvar', async () => {
    const fetchMock = installFetch();
    renderPage();

    await screen.findByRole('heading', { name: 'META DE FATURAMENTO' });
    expect(postCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Estouro do teto' }));
    expect(screen.queryByLabelText(/^Percentual/)).toBeNull();
    expect((screen.getByLabelText(/^Tipo do gatilho/) as HTMLSelectElement).value).toBe(
      'EXPENSE_CEILING_EXCEEDED',
    );
    expect(postCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Título em 3 dias' }));
    expect((screen.getByLabelText(/Antecedência em dias/) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/^Valor mínimo/) as HTMLInputElement).value).toBe('5000');
    expect((screen.getByLabelText(/Tipo de título/) as HTMLSelectElement).value).toBe('PAYABLE');
    expect(postCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Meta 80%' }));
    expect((screen.getByLabelText(/^Tipo do gatilho/) as HTMLSelectElement).value).toBe(
      'REVENUE_GOAL_PERCENTAGE',
    );
    expect((screen.getByLabelText(/^Percentual/) as HTMLInputElement).value).toBe('80');
    expect(postCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar gatilho' }));

    await waitFor(() => {
      expect(postCalls(fetchMock)).toHaveLength(1);
    });

    const post = postCalls(fetchMock)[0];
    expect(post).toBeTruthy();
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body).toEqual({
      triggerType: 'REVENUE_GOAL_PERCENTAGE',
      parameters: { percentage: 80 },
    });
  });
});
