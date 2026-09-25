import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyConsultantPage } from '../src/components/companies/company-consultant-page';
import {
  appendInstructionChip,
  consultantSuccessCopy,
  isWizardDraftDirty,
  wizardProgressPercent,
  wizardStepCopy,
} from '../src/components/companies/consultant-setup-copy';
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
    expect(screen.getByText('Configuração rápida e guiada')).toBeTruthy();
    expect(screen.getByText('Você poderá revisar tudo antes de ativar')).toBeTruthy();
    expect(screen.getByText('Nada será ativado automaticamente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar Consultor' })).toBeTruthy();
    expect(screen.queryByTestId('consultant-wizard')).toBeNull();
    expect(screen.queryByTestId('consultant-overview')).toBeNull();
  });

  it('abre o wizard de 5 etapas a partir do empty state', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));

    expect(await screen.findByTestId('consultant-wizard')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vamos dar uma identidade ao seu Consultor' })).toBeTruthy();
    expect(screen.getByText('Etapa 1 de 5')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByTestId('consultant-wizard-progress').getAttribute('aria-valuenow')).toBe('20');
    expect(screen.getByLabelText('Nome do Consultor')).toBeTruthy();
    expect(screen.getByLabelText('Segmento da empresa')).toBeTruthy();
    expect(screen.getByText(/clínica de estética/)).toBeTruthy();
    expect(screen.queryByLabelText('Motor de IA')).toBeNull();
    expect(screen.queryByTestId('consultant-advanced-settings')).toBeNull();

    fireEvent.click(screen.getByTestId('consultant-advanced-toggle'));
    expect(screen.getByTestId('consultant-advanced-settings')).toBeTruthy();
    expect(screen.getByLabelText('Motor de IA')).toBeTruthy();
    expect((screen.getByLabelText('Modelo') as HTMLSelectElement).value).toBe('gpt-4o-mini');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(
      await screen.findByRole('heading', { name: 'Ajude o Consultor a conhecer sua empresa' }),
    ).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByLabelText('Sobre a empresa')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Como o Consultor deve se comunicar?' })).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Consultivo/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Usar com moderação/ })).toBeTruthy();
    expect(screen.getByText('Respostas totalmente sem emojis.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Defina como o Consultor deve agir' })).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByLabelText('Instruções do Consultor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Priorizar fluxo de caixa' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(
      await screen.findByRole('heading', { name: 'Ensine ao Consultor o que só sua empresa sabe' }),
    ).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Queremos faturar R$ 250 mil por mês.')).toBeTruthy();
    expect(screen.getByLabelText('Informação')).toBeTruthy();
    expect(screen.queryByText(/Arquivos \(PDF/)).toBeNull();
    expect(screen.queryByText(/treinar modelo/i)).toBeNull();
  });

  it('usa o nome do Consultor na copy das etapas seguintes', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Nome do Consultor'), { target: { value: 'Lia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Ajude Lia a conhecer sua empresa' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Como Lia deve se comunicar?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Defina como Lia deve agir' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Ensine a Lia o que só sua empresa sabe' })).toBeTruthy();
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

  it('mostra review em 100% e sucesso ao salvar desativado', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Revisar configuração' }));

    expect(await screen.findByRole('heading', { name: 'Revise seu Consultor' })).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByTestId('consultant-wizard-progress').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByTestId('consultant-wizard-review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar desativado' }));

    expect(await screen.findByTestId('consultant-wizard-success')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Configuração concluída' })).toBeTruthy();
    expect(screen.getByText('Lia foi configurada com sucesso.')).toBeTruthy();
    expect(screen.getByText(/permanece desativado/)).toBeTruthy();
    expect(screen.queryByText(/está configurada e disponível/)).toBeNull();
    expect(screen.queryByTestId('consultant-overview')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Consultor' }));
    expect(await screen.findByTestId('consultant-overview')).toBeTruthy();
    expect(screen.getByText('Desativado')).toBeTruthy();
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body)).status).toBe('DISABLED');
  });

  it('mostra sucesso ACTIVE após salvar e ativar', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        settings: unconfigured,
        knowledge: [],
        onPut: (body) => ({
          ...configured,
          ...(body as ConsultantSettings),
          configured: true,
          status: 'ACTIVE',
          consultantName: 'Lia',
        }),
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Nome do Consultor'), { target: { value: 'Lia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar configuração' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    expect(await screen.findByTestId('consultant-wizard-success')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tudo pronto!' })).toBeTruthy();
    expect(screen.getByText('Lia está configurada e disponível.')).toBeTruthy();
    expect(screen.getByText(/principais informações da Alpha Co/)).toBeTruthy();
  });

  it('mostra copy de edição ao salvar um Consultor existente', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        settings: configured,
        knowledge: [],
        onPut: (body) => ({
          ...configured,
          ...(body as ConsultantSettings),
          configured: true,
          status: 'ACTIVE',
        }),
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar configuração' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar configuração' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByTestId('consultant-wizard-success')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Alterações salvas' })).toBeTruthy();
    expect(screen.getByText('Clara foi atualizada com sucesso.')).toBeTruthy();
    expect(screen.getByText('Clara continua ativa e disponível.')).toBeTruthy();
  });

  it('pede confirmação ao sair com alterações e não pede se nada mudou', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.queryByTestId('consultant-discard-dialog')).toBeNull();
    expect(await screen.findByTestId('consultant-empty-state')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Criar Consultor' }));
    fireEvent.change(screen.getByLabelText('Nome do Consultor'), { target: { value: 'Lia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.getByTestId('consultant-discard-dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByTestId('consultant-discard-dialog')).toBeNull();
    expect((screen.getByLabelText('Nome do Consultor') as HTMLInputElement).value).toBe('Lia');
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(await screen.findByTestId('consultant-empty-state')).toBeTruthy();
  });

  it('marca o card de tom e emoji selecionados', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const consultivo = screen.getByRole('radio', { name: /Consultivo/ });
    fireEvent.click(consultivo);
    expect(consultivo.getAttribute('aria-checked')).toBe('true');
    expect(consultivo.getAttribute('data-selected')).toBe('true');
    const moderate = screen.getByRole('radio', { name: /Usar com moderação/ });
    expect(moderate.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Usar livremente/ }));
    expect(screen.getByRole('radio', { name: /Usar livremente/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('continua funcional com prefers-reduced-motion', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    expect(screen.getByTestId('consultant-wizard-progress').getAttribute('aria-valuenow')).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByTestId('consultant-wizard-progress').getAttribute('aria-valuenow')).toBe('40');
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
    expect(await screen.findByText('Conhecimento adicionado')).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao resumo' }));
    expect(screen.queryByTestId('consultant-discard-dialog')).toBeNull();
    expect(await screen.findByTestId('consultant-overview')).toBeTruthy();
  });

  it('trocar provider no wizard atualiza o modelo', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ settings: unconfigured, knowledge: [] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Criar Consultor' }));
    fireEvent.click(screen.getByTestId('consultant-advanced-toggle'));
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

describe('copy e progresso do wizard', () => {
  it('calcula 20/40/60/80/100 e review em 100', () => {
    expect(wizardProgressPercent(1, false)).toBe(20);
    expect(wizardProgressPercent(2, false)).toBe(40);
    expect(wizardProgressPercent(3, false)).toBe(60);
    expect(wizardProgressPercent(4, false)).toBe(80);
    expect(wizardProgressPercent(5, false)).toBe(100);
    expect(wizardProgressPercent(5, true)).toBe(100);
  });

  it('usa fallback Consultor e nome dinâmico', () => {
    expect(wizardStepCopy(2, '').title).toBe('Ajude o Consultor a conhecer sua empresa');
    expect(wizardStepCopy(3, 'Lia').title).toBe('Como Lia deve se comunicar?');
    expect(wizardStepCopy(5, 'Lia').title).toBe('Ensine a Lia o que só sua empresa sabe');
  });

  it('detecta dirty state apenas em settings', () => {
    const baseline = {
      provider: 'OPENAI' as const,
      model: 'gpt-4o-mini',
      consultantName: '',
      businessSegment: '',
      businessDescription: '',
      adminPrompt: '',
      tonePreset: 'PROFISSIONAL_OBJETIVO' as const,
      tone: '',
      emojiPreference: 'MODERATE' as const,
    };
    expect(isWizardDraftDirty(baseline, baseline)).toBe(false);
    expect(isWizardDraftDirty({ ...baseline, consultantName: 'Lia' }, baseline)).toBe(true);
  });

  it('monta copy de sucesso ACTIVE, DISABLED e edição', () => {
    expect(
      consultantSuccessCopy({
        kind: 'created-active',
        consultantName: 'Lia',
        companyName: 'Clínica Life',
      }).title,
    ).toBe('Tudo pronto!');
    expect(
      consultantSuccessCopy({
        kind: 'created-disabled',
        consultantName: 'Lia',
        companyName: 'Clínica Life',
      }).complement,
    ).toMatch(/permanece desativado/);
    expect(
      consultantSuccessCopy({
        kind: 'edited-active',
        consultantName: 'Lia',
        companyName: 'Clínica Life',
      }).message,
    ).toBe('Lia foi atualizada com sucesso.');
  });
});
