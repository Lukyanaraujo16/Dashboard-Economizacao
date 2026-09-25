import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyConsultantPage } from '../src/components/companies/company-consultant-page';
import { appendInstructionChip } from '../src/components/companies/consultant-setup-copy';
import type { Company } from '../src/services/admin/companies.types';
import type {
  ConsultantKnowledgeEntry,
  ConsultantOptions,
  ConsultantProviderStatus,
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

const clinicaLife: Company = {
  ...company,
  id: '8b7e9b53-3435-476a-be47-56908ca846c5',
  name: 'clinica-life',
  displayName: 'Clínica Life',
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
  emojiPreferences: [
    { id: 'NONE', label: 'Não usar emojis' },
    { id: 'MODERATE', label: 'Usar com moderação' },
    { id: 'FREE', label: 'Usar livremente' },
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
  emojiPreference: null,
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
  emojiPreference: 'MODERATE',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const clinicaSettings: ConsultantSettings = {
  configured: true,
  status: 'ACTIVE',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  consultantName: 'Lia',
  businessSegment: 'Clinica',
  businessDescription: 'Atendimento infantil e adulto',
  adminPrompt: 'Ao analisar os dados financeiros desta empresa, considere que se trata de uma clínica.',
  tonePreset: 'CONSULTIVO',
  tone: null,
  emojiPreference: 'MODERATE',
  updatedAt: '2026-09-24T23:25:51.000Z',
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

const clinicaKnowledge: ConsultantKnowledgeEntry = {
  id: '0d6abfa7-2642-4654-b9ca-3a215d88926c',
  title: 'Meta interna de faturamento',
  content: 'A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.',
  contentType: 'TEXT',
  status: 'ACTIVE',
  createdAt: '2026-09-24T23:24:16.000Z',
  updatedAt: '2026-09-24T23:24:16.000Z',
};

const providers: readonly ConsultantProviderStatus[] = [
  {
    provider: 'OPENAI',
    configured: true,
    source: 'MANAGED',
    displayHint: 'sk-••••',
    configuredAt: '2026-09-24T23:01:14.000Z',
  },
  {
    provider: 'ANTHROPIC',
    configured: false,
    source: 'NONE',
    displayHint: null,
    configuredAt: null,
  },
];

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

function mockAdminFetch(input: {
  readonly company?: Company;
  readonly settings?: ConsultantSettings;
  readonly knowledge?: readonly ConsultantKnowledgeEntry[];
  readonly providers?: readonly ConsultantProviderStatus[];
  readonly onPut?: (body: unknown) => ConsultantSettings;
}) {
  let entries = [...(input.knowledge ?? [])];
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const currentCompany = input.company ?? company;
    if (url.endsWith(`/admin/tenants/${currentCompany.id}`) && !url.includes('/consultant')) {
      return Promise.resolve(jsonResponse(currentCompany));
    }
    if (url.endsWith('/admin/consultant/options')) {
      return Promise.resolve(jsonResponse(options));
    }
    if (url.endsWith('/admin/consultant/providers')) {
      return Promise.resolve(jsonResponse({ data: input.providers ?? providers }));
    }
    if (url.includes('/consultant/knowledge') && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { title: string; content: string };
      const created: ConsultantKnowledgeEntry = {
        ...knowledge,
        title: payload.title,
        content: payload.content,
      };
      entries = [created, ...entries.filter((item) => item.id !== created.id)];
      return Promise.resolve(jsonResponse(created, 201));
    }
    if (url.includes('/consultant/knowledge/') && init?.method === 'DELETE') {
      const id = url.split('/').pop() ?? '';
      entries = entries.filter((item) => item.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes('/consultant/knowledge/') && init?.method === 'PATCH') {
      const id = url.split('/').pop() ?? '';
      const payload = JSON.parse(String(init.body)) as Partial<ConsultantKnowledgeEntry>;
      const current = entries.find((item) => item.id === id) ?? knowledge;
      const updated = { ...current, ...payload, updatedAt: '2026-09-24T15:00:00.000Z' };
      entries = entries.map((item) => (item.id === updated.id ? updated : item));
      return Promise.resolve(jsonResponse(updated));
    }
    if (url.includes('/consultant/knowledge')) {
      return Promise.resolve(jsonResponse({ data: entries }));
    }
    if (url.includes('/consultant') && init?.method === 'PUT') {
      const payload = JSON.parse(String(init.body)) as ConsultantSettings;
      const saved = input.onPut?.(payload) ?? {
        ...configured,
        ...payload,
        configured: true,
        updatedAt: '2026-09-24T16:00:00.000Z',
      };
      return Promise.resolve(jsonResponse(saved));
    }
    if (url.includes('/consultant')) {
      return Promise.resolve(jsonResponse(input.settings ?? configured));
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

function renderPage(id = companyId) {
  return renderWithAuth(
    <ThemeProvider>
      <CompanyConsultantPage companyId={id} />
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

describe('UI admin Consultor (F13.8.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mostra empty state quando o Consultor ainda não foi configurado', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();

    expect(await screen.findByTestId('consultant-empty-state')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Crie o Consultor Financeiro desta empresa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar Consultor' })).toBeTruthy();
    expect(screen.queryByTestId('consultant-wizard')).toBeNull();
    expect(screen.queryByTestId('consultant-overview')).toBeNull();
  });

  it('abre o wizard de 5 etapas a partir do empty state', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));

    expect(await screen.findByTestId('consultant-wizard')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vamos criar seu Consultor' })).toBeTruthy();
    expect(screen.getByLabelText('Nome do Consultor')).toBeTruthy();
    expect(screen.getByLabelText('Segmento da empresa')).toBeTruthy();
    expect(screen.getByText(/clínica de estética/)).toBeTruthy();
    expect(screen.getByLabelText('Motor de IA')).toBeTruthy();
    expect((screen.getByLabelText('Modelo') as HTMLSelectElement).value).toBe('gpt-4o-mini');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Conte um pouco sobre a empresa' })).toBeTruthy();
    expect(screen.getByLabelText('Sobre a empresa')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Como o Consultor deve se comunicar?' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Consultivo/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Usar com moderação/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Como o Consultor deve agir?' })).toBeTruthy();
    expect(screen.getByLabelText('Instruções do Consultor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Priorizar fluxo de caixa' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Ensine o Consultor sobre sua empresa' })).toBeTruthy();
    expect(screen.getByText('Queremos faturar R$ 250 mil por mês.')).toBeTruthy();
    expect(screen.getByLabelText('Informação')).toBeTruthy();
    expect(screen.queryByText(/Arquivos \(PDF/)).toBeNull();
    expect(screen.queryByText(/treinar modelo/i)).toBeNull();
  });

  it('preserva dados ao voltar e chips não duplicam instrução', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Nome do Consultor'), { target: { value: 'Lia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Priorizar fluxo de caixa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Priorizar fluxo de caixa' }));
    expect((screen.getByLabelText('Instruções do Consultor') as HTMLTextAreaElement).value).toBe(
      'Priorize fluxo de caixa nas análises.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect((screen.getByLabelText('Nome do Consultor') as HTMLInputElement).value).toBe('Lia');
  });

  it('conclui o wizard salvando desativado e mostra overview', async () => {
    const fetchMock = mockAdminFetch({
      settings: unconfigured,
      knowledge: [],
      onPut: (body) => ({
        ...configured,
        ...(body as ConsultantSettings),
        configured: true,
        status: 'DISABLED',
        consultantName: 'Lia',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Nome do Consultor'), { target: { value: 'Lia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));

    expect(await screen.findByText('Seu Consultor está pronto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar desativado' }));

    expect(await screen.findByTestId('consultant-overview')).toBeTruthy();
    expect(screen.getByText('Desativado')).toBeTruthy();
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body)).status).toBe('DISABLED');
  });

  it('settings existente abre overview direto e preserva a Clínica Life', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        company: clinicaLife,
        settings: clinicaSettings,
        knowledge: [clinicaKnowledge],
      }),
    );
    renderPage(clinicaLife.id);

    expect(await screen.findByTestId('consultant-overview')).toBeTruthy();
    expect(screen.queryByTestId('consultant-empty-state')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Lia' })).toBeTruthy();
    expect(screen.getAllByText(/Consultivo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 conhecimento ativo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenAI · gpt-4o-mini/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Arquivos \(PDF/)).toBeNull();
  });

  it('editar pelo card de comportamento abre a etapa 3', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: configured, knowledge: [] }));
    renderPage();
    expect(await screen.findByTestId('consultant-overview')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('overview-behavior')).getByRole('button', { name: 'Editar' }));
    expect(await screen.findByTestId('consultant-wizard-step-3')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Profissional e objetivo/ }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });

  it('knowledge permite criar, editar, desativar e excluir no wizard', async () => {
    const fetchMock = mockAdminFetch({ settings: configured, knowledge: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar conhecimentos' }));
    expect(await screen.findByTestId('consultant-wizard-step-5')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Meta interna de faturamento' },
    });
    fireEvent.change(screen.getByLabelText('Informação'), {
      target: { value: 'A meta interna de faturamento mensal da Clínica Life é de R$ 250.000,00.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar conhecimento' }));
    expect(await screen.findByText('Conhecimento criado para esta empresa.')).toBeTruthy();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Política revisada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conhecimento' }));
    expect(await screen.findByText('Conhecimento atualizado.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Conhecimento desativado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Conhecimento excluído.')).toBeTruthy();
  });

  it('trocar provider no wizard atualiza o modelo', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Motor de IA'), { target: { value: 'ANTHROPIC' } });
    const modelSelect = screen.getByLabelText('Modelo') as HTMLSelectElement;
    expect(modelSelect.value).toBe('claude-sonnet-5');
    expect(within(modelSelect).queryByRole('option', { name: 'gpt-4o-mini' })).toBeNull();
  });

  it('impede ativar sem credencial do provider', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        settings: { ...configured, status: 'DISABLED' },
        knowledge: [],
        providers: [
          {
            provider: 'OPENAI',
            configured: false,
            source: 'NONE',
            displayHint: null,
            configuredAt: null,
          },
        ],
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar Consultor' }));
    expect(
      await screen.findByText('Configure uma credencial da OpenAI antes de ativar este Consultor.'),
    ).toBeTruthy();
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

describe('appendInstructionChip', () => {
  it('não duplica sugestão já presente', () => {
    expect(appendInstructionChip('', 'Priorize fluxo de caixa nas análises.')).toBe(
      'Priorize fluxo de caixa nas análises.',
    );
    expect(
      appendInstructionChip('Priorize fluxo de caixa nas análises.', 'Priorize fluxo de caixa nas análises.'),
    ).toBe('Priorize fluxo de caixa nas análises.');
  });
});
