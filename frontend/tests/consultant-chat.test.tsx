import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsultantHost } from '../src/components/consultant';
import { useAuth } from '../src/auth';
import type { AuthenticatedUser, SupportState } from '../src/auth/types';
import {
  createConsultantConversation,
  deleteConsultantConversation,
  getConsultantConversation,
  getConsultantStatus,
  listConsultantConversations,
  sendConsultantMessage,
  ConsultantRequestError,
  type ConsultantConversation,
  type ConsultantConversationDetail,
  type SendConsultantMessageResult,
} from '../src/services/consultant';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
let pathname = '/';
let searchParams = new URLSearchParams('month=2026-09');

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

vi.mock('../src/services/consultant', async () => {
  const actual = await vi.importActual<typeof import('../src/services/consultant')>(
    '../src/services/consultant',
  );
  return {
    ...actual,
    getConsultantStatus: vi.fn(),
    listConsultantConversations: vi.fn(),
    getConsultantConversation: vi.fn(),
    createConsultantConversation: vi.fn(),
    deleteConsultantConversation: vi.fn(),
    sendConsultantMessage: vi.fn(),
  };
});

const conversation: ConsultantConversation = {
  id: 'conv-1',
  title: 'Caixa de setembro',
  status: 'OPEN',
  startedAt: '2026-09-01T10:00:00.000Z',
  lastMessageAt: '2026-09-01T10:05:00.000Z',
};

const conversationDetail: ConsultantConversationDetail = {
  ...conversation,
  messages: [
    {
      id: 'msg-user-1',
      senderType: 'USER',
      content: 'Como está o caixa?',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'msg-ai-1',
      senderType: 'CONSULTANT',
      content: 'O caixa do mês está estável.',
      createdAt: '2026-09-01T10:05:00.000Z',
    },
  ],
};

function AuthProbe() {
  const { status, user } = useAuth();
  return (
    <div data-testid="auth-status">
      {status}:{user?.tenantId ?? 'none'}
    </div>
  );
}

function SessionControls({
  nextUser,
  nextSupport,
}: {
  readonly nextUser: AuthenticatedUser;
  readonly nextSupport: SupportState;
}) {
  const { applySession } = useAuth();
  return (
    <button
      type="button"
      onClick={() => applySession({ user: nextUser, support: nextSupport })}
    >
      Trocar tenant
    </button>
  );
}

function renderChat(user: AuthenticatedUser = mockAuthenticatedUser, support?: SupportState) {
  return renderWithAuth(
    <>
      <AuthProbe />
      <SessionControls
        nextUser={{ ...user, tenantId: 'tenant-2' }}
        nextSupport={support ?? { active: false }}
      />
      <ConsultantHost />
    </>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user, support),
      hydrateOnMount: true,
    },
  );
}

async function openConsultant() {
  fireEvent.click(await screen.findByRole('button', { name: /Falar com/ }));
  expect(await screen.findByRole('dialog', { name: /Consultor/ })).toBeTruthy();
}

async function openHistoryConversation(title: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Histórico de conversas' }));
  fireEvent.click(await screen.findByTitle(title));
}

afterEach(() => {
  cleanup();
  pathname = '/';
  searchParams = new URLSearchParams('month=2026-09');
  replaceMock.mockReset();
  sessionStorage.clear();
  vi.mocked(getConsultantStatus).mockReset();
  vi.mocked(listConsultantConversations).mockReset();
  vi.mocked(getConsultantConversation).mockReset();
  vi.mocked(createConsultantConversation).mockReset();
  vi.mocked(deleteConsultantConversation).mockReset();
  vi.mocked(sendConsultantMessage).mockReset();
});

beforeEach(() => {
  pathname = '/';
  vi.mocked(getConsultantStatus).mockResolvedValue({
    status: 'ACTIVE',
    consultantName: 'Consultor',
  });
  vi.mocked(listConsultantConversations).mockResolvedValue([conversation]);
  vi.mocked(getConsultantConversation).mockResolvedValue(conversationDetail);
  vi.mocked(createConsultantConversation).mockResolvedValue({
    ...conversation,
    id: 'conv-new',
    title: null,
  });
});

describe('chat do Consultor', () => {
  it('abre e fecha o painel', async () => {
    renderChat();

    await openConsultant();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar o Consultor' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Consultor/ })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Falar com/ })).toBeTruthy();
  });

  it('fecha com Escape no desktop', async () => {
    renderChat();
    await openConsultant();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Consultor/ })).toBeNull();
    });
  });

  it('carrega conversas e mensagens ao selecionar', async () => {
    renderChat();
    await openConsultant();

    await waitFor(() => {
      expect(getConsultantStatus).toHaveBeenCalled();
      expect(listConsultantConversations).toHaveBeenCalledTimes(1);
    });

    await openHistoryConversation('Caixa de setembro');

    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    expect(screen.getByText('O caixa do mês está estável.')).toBeTruthy();
    expect(getConsultantConversation).toHaveBeenCalledWith('conv-1');
  });

  it('envia mensagem e mostra loading da resposta', async () => {
    let resolveSend!: (value: SendConsultantMessageResult) => void;
    vi.mocked(sendConsultantMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Qual a receita?')).toBeTruthy();
    expect((screen.getByLabelText('Mensagem para o Consultor') as HTMLTextAreaElement).value).toBe('');
    expect(await screen.findByLabelText('Consultor está analisando')).toBeTruthy();
    expect(screen.getByTestId('consultant-thinking')).toBeTruthy();
    await waitFor(() => {
      expect(sendConsultantMessage).toHaveBeenCalledWith('conv-1', {
        content: 'Qual a receita?',
        month: '2026-09',
      });
    });
    const sentPayload = vi.mocked(sendConsultantMessage).mock.calls[0]?.[1];
    expect(sentPayload).not.toHaveProperty('tenantId');
    expect(sentPayload).not.toHaveProperty('provider');
    expect(sentPayload).not.toHaveProperty('model');
    expect(sentPayload).not.toHaveProperty('resolvedMonth');

    resolveSend({
      userMessage: {
        id: 'msg-user-2',
        senderType: 'USER',
        content: 'Qual a receita?',
        createdAt: '2026-09-01T11:00:00.000Z',
      },
      consultantMessage: {
        id: 'msg-ai-2',
        senderType: 'CONSULTANT',
        content: 'A receita oficial do mês é 0.',
        createdAt: '2026-09-01T11:00:02.000Z',
      },
    });

    expect(screen.getAllByText('Qual a receita?')).toHaveLength(1);
    expect(await screen.findByText('A receita oficial do mês é 0.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText('Consultor está analisando')).toBeNull();
      expect(screen.queryByTestId('consultant-thinking')).toBeNull();
    });
  });

  it('envia o mês selecionado da Home como referência, sem interpretar a pergunta', async () => {
    searchParams = new URLSearchParams('month=2026-08');
    vi.mocked(sendConsultantMessage).mockResolvedValue({
      userMessage: {
        id: 'msg-user-ref',
        senderType: 'USER',
        content: 'Qual foi meu faturamento em agosto de 2026?',
        createdAt: '2026-09-01T11:00:00.000Z',
      },
      consultantMessage: {
        id: 'msg-ai-ref',
        senderType: 'CONSULTANT',
        content: 'ok',
        createdAt: '2026-09-01T11:00:02.000Z',
      },
    });
    renderChat();
    await openConsultant();
    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual foi meu faturamento em agosto de 2026?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(sendConsultantMessage).toHaveBeenCalledWith('conv-new', {
        content: 'Qual foi meu faturamento em agosto de 2026?',
        month: '2026-08',
      });
    });
  });

  it('envia setembro quando a Home está em ?month=2026-09', async () => {
    searchParams = new URLSearchParams('month=2026-09');
    vi.mocked(sendConsultantMessage).mockResolvedValue({
      userMessage: {
        id: 'msg-user-set',
        senderType: 'USER',
        content: 'Qual a receita?',
        createdAt: '2026-09-01T11:00:00.000Z',
      },
      consultantMessage: {
        id: 'msg-ai-set',
        senderType: 'CONSULTANT',
        content: 'ok',
        createdAt: '2026-09-01T11:00:02.000Z',
      },
    });
    renderChat();
    await openConsultant();
    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(sendConsultantMessage).toHaveBeenCalledWith('conv-new', {
        content: 'Qual a receita?',
        month: '2026-09',
      });
    });
  });

  it('429 e 503 no envio não apagam o histórico', async () => {
    vi.mocked(sendConsultantMessage)
      .mockRejectedValueOnce(
        new ConsultantRequestError(
          'rate_limited',
          'Você atingiu o limite de mensagens do Consultor. Tente novamente em alguns minutos.',
          { httpStatus: 429, code: 'RATE_LIMITED' },
        ),
      )
      .mockRejectedValueOnce(
        new ConsultantRequestError(
          'unavailable',
          'O Consultor está temporariamente indisponível.',
          { httpStatus: 503, code: 'INTEGRATION_UNAVAILABLE' },
        ),
      );

    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText(
        'Você atingiu o limite de mensagens do Consultor. Tente novamente em alguns minutos.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Como está o caixa?')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /Consultor/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Tentar de novo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('O Consultor está temporariamente indisponível.')).toBeTruthy();
    expect(screen.getByText('Como está o caixa?')).toBeTruthy();
  });

  it('exclui conversa com confirmação e some do histórico', async () => {
    vi.mocked(deleteConsultantConversation).mockResolvedValue();
    renderChat();
    await openConsultant();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de conversas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ações de Caixa de setembro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));

    await waitFor(() => {
      expect(deleteConsultantConversation).toHaveBeenCalledWith('conv-1');
    });
    await waitFor(() => {
      expect(screen.queryByTitle('Caixa de setembro')).toBeNull();
    });
  });

  it('não mostra o FAB quando o Consultor está desativado', async () => {
    vi.mocked(getConsultantStatus).mockResolvedValue({
      status: 'DISABLED',
      consultantName: 'Consultor',
    });
    renderChat();

    await waitFor(() => {
      expect(getConsultantStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
    expect(listConsultantConversations).not.toHaveBeenCalled();
  });

  it('mostra o FAB sem disponibilidade quando o provider está indisponível', async () => {
    vi.mocked(getConsultantStatus).mockResolvedValue({
      status: 'UNAVAILABLE',
      consultantName: 'Consultor',
    });
    renderChat();
    await openConsultant();

    expect(
      await screen.findByText('O Consultor está temporariamente indisponível.'),
    ).toBeTruthy();
    expect(listConsultantConversations).not.toHaveBeenCalled();
  });

  it('mostra erro seguro quando a API falha', async () => {
    vi.mocked(getConsultantStatus).mockRejectedValue(new Error('boom'));
    renderChat();
    await openConsultant();

    expect(
      await screen.findByText('O Consultor está temporariamente indisponível.'),
    ).toBeTruthy();
    expect(screen.queryByText(/boom/i)).toBeNull();
  });

  it('limpa o estado ao trocar o tenant operacional', async () => {
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('O caixa do mês está estável.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trocar tenant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Consultor/ })).toBeNull();
      expect(screen.queryByText('O caixa do mês está estável.')).toBeNull();
      expect(screen.queryByText('Caixa de setembro')).toBeNull();
    });
    expect(await screen.findByRole('button', { name: /Falar com/ })).toBeTruthy();
  });

  it('limpa o estado ao sair do Support Mode', async () => {
    const admin: AuthenticatedUser = {
      ...mockAuthenticatedUser,
      role: 'ADMIN',
      tenantId: null,
    };
    const support: SupportState = {
      active: true,
      tenantId: 'tenant-1',
      tenantDisplayName: 'Empresa suporte',
      startedAt: '2026-09-01T00:00:00.000Z',
      supportSessionId: 'ss-1',
    };

    renderWithAuth(
      <>
        <AuthProbe />
        <SessionControls nextUser={admin} nextSupport={{ active: false }} />
        <ConsultantHost />
      </>,
      {
        getCurrentUserAction: createAuthenticatedGetCurrentUser(admin, support),
        hydrateOnMount: true,
      },
    );

    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('O caixa do mês está estável.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trocar tenant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Consultor/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
      expect(screen.queryByText('O caixa do mês está estável.')).toBeNull();
    });
  });

  it('renderiza conteúdo da IA como texto e não executa HTML', async () => {
    vi.mocked(getConsultantConversation).mockResolvedValue({
      ...conversation,
      messages: [
        {
          id: 'msg-xss',
          senderType: 'CONSULTANT',
          content: '<script>window.__consultantPwned = true</script>',
          createdAt: '2026-09-01T10:05:00.000Z',
        },
      ],
    });

    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');

    const bubble = await screen.findByText('<script>window.__consultantPwned = true</script>');
    expect(bubble.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).toContain('&lt;script&gt;window.__consultantPwned = true&lt;/script&gt;');
    expect(
      (window as unknown as { __consultantPwned?: boolean }).__consultantPwned,
    ).toBeUndefined();
  });

  it('fecha e reabre restaurando a conversa ativa', async () => {
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar o Consultor' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await openConsultant();
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    expect(await screen.findByText('O caixa do mês está estável.')).toBeTruthy();
  });

  it('restaura a conversa persistida após um novo mount', async () => {
    sessionStorage.setItem('de.consultant.activeConversation.v1:user-1:tenant-1', 'conv-1');
    renderChat();
    await openConsultant();
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    expect(getConsultantConversation).toHaveBeenCalledWith('conv-1');
  });

  it('cai no empty state quando a referência persistida foi excluída', async () => {
    sessionStorage.setItem('de.consultant.activeConversation.v1:user-1:tenant-1', 'conv-gone');
    vi.mocked(getConsultantConversation).mockRejectedValue(
      new ConsultantRequestError('not_found', 'Conversa não encontrada.', { httpStatus: 404 }),
    );
    renderChat();
    await openConsultant();
    expect(await screen.findByTestId('consultant-empty')).toBeTruthy();
    expect(screen.queryByText('Como está o caixa?')).toBeNull();
    expect(sessionStorage.getItem('de.consultant.activeConversation.v1:user-1:tenant-1')).toBeNull();
  });

  it('não expõe conversa de outro tenant pela referência persistida', async () => {
    sessionStorage.setItem('de.consultant.activeConversation.v1:user-1:tenant-1', 'conv-1');
    vi.mocked(getConsultantConversation).mockRejectedValue(
      new ConsultantRequestError('forbidden', 'Você não tem permissão para esta operação.', {
        httpStatus: 403,
      }),
    );
    renderChat();
    await openConsultant();
    expect(await screen.findByTestId('consultant-empty')).toBeTruthy();
    expect(screen.queryByText('O caixa do mês está estável.')).toBeNull();
  });

  it('o botão + inicia uma nova conversa sem criar registro vazio', async () => {
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));
    expect(await screen.findByTestId('consultant-empty')).toBeTruthy();
    expect(screen.queryByText('Como está o caixa?')).toBeNull();
    expect(createConsultantConversation).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('de.consultant.activeConversation.v1:user-1:tenant-1')).toBeNull();
  });

  it('selecionar no histórico atualiza a conversa ativa', async () => {
    const second: ConsultantConversation = {
      ...conversation,
      id: 'conv-2',
      title: 'Despesas de agosto',
      lastMessageAt: '2026-08-01T10:00:00.000Z',
    };
    vi.mocked(listConsultantConversations).mockResolvedValue([conversation, second]);
    vi.mocked(getConsultantConversation).mockImplementation(async (id: string) => {
      if (id === 'conv-2') {
        return {
          ...second,
          messages: [
            {
              id: 'msg-2',
              senderType: 'CONSULTANT',
              content: 'As despesas caíram.',
              createdAt: '2026-08-01T10:00:00.000Z',
            },
          ],
        };
      }
      return conversationDetail;
    });
    renderChat();
    await openConsultant();
    await openHistoryConversation('Despesas de agosto');
    expect(await screen.findByText('As despesas caíram.')).toBeTruthy();
    expect(sessionStorage.getItem('de.consultant.activeConversation.v1:user-1:tenant-1')).toBe(
      'conv-2',
    );
  });

  it('mantém a pergunta e remove o thinking quando o envio falha', async () => {
    vi.mocked(sendConsultantMessage).mockRejectedValue(
      new ConsultantRequestError('unavailable', 'O Consultor está temporariamente indisponível.', {
        httpStatus: 503,
      }),
    );
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Qual a receita?')).toBeTruthy();
    expect(await screen.findByText('O Consultor está temporariamente indisponível.')).toBeTruthy();
    expect(screen.queryByTestId('consultant-thinking')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
  });

  it('protege contra double submit enquanto a resposta está pendente', async () => {
    vi.mocked(sendConsultantMessage).mockImplementation(() => new Promise(() => undefined));
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));
    await waitFor(() => {
      expect(sendConsultantMessage).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: /Enviar/ })).toHaveProperty('disabled', true);
  });

  it('Enter envia e Shift+Enter não envia', async () => {
    vi.mocked(sendConsultantMessage).mockImplementation(() => new Promise(() => undefined));
    renderChat();
    await openConsultant();
    const field = await screen.findByLabelText('Mensagem para o Consultor');
    fireEvent.change(field, { target: { value: 'Primeira pergunta' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(sendConsultantMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => {
      expect(sendConsultantMessage).toHaveBeenCalledTimes(1);
    });
  });

  it('mostra o botão de voltar ao final quando o usuário lê mensagens antigas', async () => {
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();
    const thread = screen.getByTestId('consultant-thread');
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(thread, 'clientHeight', { configurable: true, value: 240 });
    Object.defineProperty(thread, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(thread);
    expect(await screen.findByTestId('consultant-scroll-latest')).toBeTruthy();
    fireEvent.click(screen.getByTestId('consultant-scroll-latest'));
    await waitFor(() => {
      expect(screen.queryByTestId('consultant-scroll-latest')).toBeNull();
    });
  });

  it('mostra presence apenas quando ACTIVE e aceita reduced-motion', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') || query.includes('min-width: 768px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderChat();
    const fabPresence = await screen.findByTestId('consultant-presence');
    expect(fabPresence.getAttribute('data-available')).toBe('true');
    await openConsultant();
    expect(screen.getAllByTestId('consultant-presence')[0]?.getAttribute('data-available')).toBe(
      'true',
    );
  });

  it('agrupa histórico e trunca título longo', async () => {
    const longTitle =
      'Uma conversa com um título extremamente longo que precisa ser truncado na lista do histórico do consultor';
    vi.mocked(listConsultantConversations).mockResolvedValue([
      { ...conversation, lastMessageAt: new Date().toISOString() },
      {
        ...conversation,
        id: 'conv-old',
        title: longTitle,
        lastMessageAt: '2026-08-01T10:00:00.000Z',
      },
    ]);
    renderChat();
    await openConsultant();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de conversas' }));
    expect(await screen.findByText('Hoje')).toBeTruthy();
    expect(screen.getByText('Anteriores')).toBeTruthy();
    expect(screen.getByTitle(longTitle)).toBeTruthy();
  });

  it('renderiza Markdown simples sem interpretar HTML', async () => {
    vi.mocked(getConsultantConversation).mockResolvedValue({
      ...conversation,
      messages: [
        {
          id: 'msg-md',
          senderType: 'CONSULTANT',
          content: '**Análise de serviços**\n\n1. Caixa\n2. Despesas\n\n<img src=x onerror=alert(1)>',
          createdAt: '2026-09-01T10:05:00.000Z',
        },
      ],
    });
    renderChat();
    await openConsultant();
    await openHistoryConversation('Caixa de setembro');
    const strong = await screen.findByText('Análise de serviços');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.getByText('Caixa')).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.body.innerHTML).not.toContain('<img src=x');
  });

  it('preenche o composer com sugestão do empty state', async () => {
    renderChat();
    await openConsultant();
    fireEvent.click(screen.getByRole('button', { name: 'Como está meu faturamento este mês?' }));
    expect((screen.getByLabelText('Mensagem para o Consultor') as HTMLTextAreaElement).value).toBe(
      'Como está meu faturamento este mês?',
    );
    expect(sendConsultantMessage).not.toHaveBeenCalled();
  });
});
