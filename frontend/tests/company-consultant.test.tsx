import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyConsultantPage } from '../src/components/companies/company-consultant-page';
import type { Company } from '../src/services/admin/companies.types';
import type {
  ConsultantKnowledgeEntry,
  ConsultantOptions,
  ConsultantSettings,
} from '../src/services/admin/consultant.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const company: Company = {
  id: companyId,
  name: 'alpha-co',
  displayName: 'Alpha Co',
  status: 'ACTIVE',
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T11:00:00.000Z',
  deactivatedAt: null,
  integration: null,
};

const options: ConsultantOptions = {
  providers: [
    {
      id: 'OPENAI',
      label: 'OpenAI',
      models: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }],
    },
    {
      id: 'ANTHROPIC',
      label: 'Anthropic',
      models: [
        { id: 'claude-sonnet-5', label: 'claude-sonnet-5' },
        { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
      ],
    },
  ],
  tonePresets: [
    { id: 'PROFISSIONAL_OBJETIVO', label: 'Profissional e objetivo' },
    { id: 'CONSULTIVO', label: 'Consultivo' },
    { id: 'DIDATICO', label: 'Didático' },
    { id: 'AMIGAVEL', label: 'Amigável' },
    { id: 'EXECUTIVO', label: 'Executivo' },
    { id: 'PERSONALIZADO', label: 'Personalizado' },
  ],
};

const unconfigured: ConsultantSettings = {
  configured: false,
  status: 'NOT_CONFIGURED',
  provider: null,
  model: null,
  consultantName: null,
  businessSegment: null,
  businessDescription: null,
  adminPrompt: null,
  tonePreset: null,
  tone: null,
  updatedAt: null,
};

const configured: ConsultantSettings = {
  configured: true,
  status: 'ACTIVE',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  consultantName: 'Clara',
  businessSegment: 'Varejo',
  businessDescription: 'Loja de bairro',
  adminPrompt: 'Seja objetivo',
  tonePreset: 'PROFISSIONAL_OBJETIVO',
  tone: 'formal',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const knowledge: ConsultantKnowledgeEntry = {
  id: 'k-1',
  title: 'Política de crédito',
  content: 'Prazo padrão de 30 dias.',
  contentType: 'TEXT',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => `/empresas/${companyId}/consultor`,
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

function renderPage() {
  return renderWithAuth(
    <ThemeProvider>
      <CompanyConsultantPage companyId={companyId} />
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

describe('UI admin Consultor (F13.5)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renderiza settings do mesmo consultor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/admin/consultant/options')) {
          return Promise.resolve(jsonResponse(options));
        }
        if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`)) {
          return Promise.resolve(jsonResponse({ data: [] }));
        }
        if (url.endsWith(`/admin/tenants/${companyId}/consultant`)) {
          return Promise.resolve(jsonResponse(configured));
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Consultor Financeiro' })).toBeTruthy();
    expect(
      screen.getByText(/OpenAI e Anthropic são provedores do mesmo consultor/),
    ).toBeTruthy();
    expect(screen.queryByText(/dois agentes/i)).toBeNull();
    expect((screen.getByLabelText('Provedor') as HTMLSelectElement).value).toBe('OPENAI');
    expect((screen.getByLabelText('Modelo') as HTMLSelectElement).value).toBe('gpt-4o-mini');
    expect((screen.getByLabelText('Ramo') as HTMLInputElement).value).toBe('Varejo');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('ACTIVE');
    expect(screen.getByText('Nenhum conhecimento cadastrado para esta empresa.')).toBeTruthy();
  });

  it('trocar provider atualiza os modelos para o default do catálogo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/admin/consultant/options')) {
          return Promise.resolve(jsonResponse(options));
        }
        if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`)) {
          return Promise.resolve(jsonResponse({ data: [] }));
        }
        return Promise.resolve(jsonResponse(unconfigured));
      }),
    );

    renderPage();
    const providerSelect = await screen.findByLabelText('Provedor');
    expect((screen.getByLabelText('Modelo') as HTMLSelectElement).value).toBe('gpt-4o-mini');

    fireEvent.change(providerSelect, { target: { value: 'ANTHROPIC' } });

    const modelSelect = screen.getByLabelText('Modelo') as HTMLSelectElement;
    expect(modelSelect.value).toBe('claude-sonnet-5');
    expect(within(modelSelect).getByRole('option', { name: 'claude-sonnet-5' })).toBeTruthy();
    expect(within(modelSelect).getByRole('option', { name: 'claude-sonnet-4-5' })).toBeTruthy();
    expect(within(modelSelect).queryByRole('option', { name: 'gpt-4o-mini' })).toBeNull();
  });

  it('salvar envia PUT com combinação válida', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/admin/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      if (url.endsWith('/admin/consultant/options')) {
        return Promise.resolve(jsonResponse(options));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`)) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant`) && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({
            ...configured,
            provider: 'ANTHROPIC',
            model: 'claude-sonnet-5',
            tonePreset: 'CONSULTIVO',
            tone: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse(configured));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.change(await screen.findByLabelText('Provedor'), { target: { value: 'ANTHROPIC' } });
    fireEvent.change(screen.getByLabelText('Nome do consultor'), { target: { value: 'Clara' } });
    fireEvent.change(screen.getByLabelText('Tom'), { target: { value: 'CONSULTIVO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    await waitFor(() => {
      expect(screen.getByText('Configuração do consultor salva.')).toBeTruthy();
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith(`/admin/tenants/${companyId}/consultant`) &&
        (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body))).toEqual({
      status: 'ACTIVE',
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5',
      consultantName: 'Clara',
      businessSegment: 'Varejo',
      businessDescription: 'Loja de bairro',
      adminPrompt: 'Seja objetivo',
      tonePreset: 'CONSULTIVO',
      tone: null,
    });
  });

  it('knowledge permite criar, editar, desativar e excluir', async () => {
    let entries: ConsultantKnowledgeEntry[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/admin/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      if (url.endsWith('/admin/consultant/options')) {
        return Promise.resolve(jsonResponse(options));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`) && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { title: string; content: string };
        const created: ConsultantKnowledgeEntry = {
          ...knowledge,
          title: payload.title,
          content: payload.content,
        };
        entries = [created];
        return Promise.resolve(jsonResponse(created, 201));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge/${knowledge.id}`)) {
        if (init?.method === 'DELETE') {
          entries = [];
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        const payload = JSON.parse(String(init?.body)) as Partial<ConsultantKnowledgeEntry>;
        const updated = { ...entries[0]!, ...payload, updatedAt: '2026-09-24T15:00:00.000Z' };
        entries = [updated];
        return Promise.resolve(jsonResponse(updated));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`)) {
        return Promise.resolve(jsonResponse({ data: entries }));
      }
      return Promise.resolve(jsonResponse(configured));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(await screen.findByText('Nenhum conhecimento cadastrado para esta empresa.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Meta interna de faturamento' },
    });
    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: 'A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar conhecimento' }));

    expect(await screen.findByText('Conhecimento criado para esta empresa.')).toBeTruthy();
    expect(screen.getByText('Meta interna de faturamento')).toBeTruthy();
    expect(
      screen.getByText('A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.'),
    ).toBeTruthy();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Conteúdo') as HTMLTextAreaElement).value).toBe('');
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      title: 'Meta interna de faturamento',
      content: 'A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Política revisada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conhecimento' }));
    expect(await screen.findByText('Conhecimento atualizado.')).toBeTruthy();
    expect(screen.getByText('Política revisada')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Conhecimento desativado.')).toBeTruthy();
    expect(screen.getByText('Desativado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Conhecimento excluído.')).toBeTruthy();
    expect(screen.getByText('Nenhum conhecimento cadastrado para esta empresa.')).toBeTruthy();
  });

  it('mostra erro de validação de conhecimento sem detalhe interno', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith(`/admin/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      if (url.endsWith('/admin/consultant/options')) {
        return Promise.resolve(jsonResponse(options));
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`) && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Verifique os dados informados.',
                details: [{ field: 'title', issue: 'required' }],
              },
            },
            422,
          ),
        );
      }
      if (url.endsWith(`/admin/tenants/${companyId}/consultant/knowledge`)) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      return Promise.resolve(jsonResponse(configured));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.change(await screen.findByLabelText('Título'), {
      target: { value: 'Meta interna de faturamento' },
    });
    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: 'A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar conhecimento' }));
    expect(await screen.findByText('Informe um título válido.')).toBeTruthy();
    expect(screen.queryByText('Verifique os dados informados.')).toBeNull();
  });

  it('mostra erro quando o carregamento falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/admin/consultant/options')) {
          return Promise.resolve(
            jsonResponse({ error: { code: 'UNAVAILABLE', message: 'falhou' } }, 503),
          );
        }
        return Promise.resolve(jsonResponse({}, 503));
      }),
    );

    renderPage();
    expect(await screen.findByText('Não foi possível carregar o consultor.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Consultor Financeiro' })).toBeNull();
  });
});
