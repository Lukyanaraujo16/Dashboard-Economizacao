import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsultantHost } from '../src/components/consultant';
import { useAuth } from '../src/auth';
import type { AuthenticatedUser, SupportState } from '../src/auth/types';
import {
  createConsultantConversation,
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
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Consultor' }));
  expect(await screen.findByRole('dialog', { name: 'Consultor' })).toBeTruthy();
}

afterEach(() => {
  cleanup();
  pathname = '/';
  searchParams = new URLSearchParams('month=2026-09');
  replaceMock.mockReset();
  vi.mocked(getConsultantStatus).mockReset();
  vi.mocked(listConsultantConversations).mockReset();
  vi.mocked(getConsultantConversation).mockReset();
  vi.mocked(createConsultantConversation).mockReset();
  vi.mocked(sendConsultantMessage).mockReset();
});

beforeEach(() => {
  pathname = '/';
  vi.mocked(getConsultantStatus).mockResolvedValue({ status: 'ACTIVE' });
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
      expect(screen.queryByRole('dialog', { name: 'Consultor' })).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Abrir o Consultor' })).toBeTruthy();
  });

  it('fecha com Escape no desktop', async () => {
    renderChat();
    await openConsultant();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Consultor' })).toBeNull();
    });
  });

  it('carrega conversas e mensagens ao selecionar', async () => {
    renderChat();
    await openConsultant();

    await waitFor(() => {
      expect(getConsultantStatus).toHaveBeenCalledTimes(1);
      expect(listConsultantConversations).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Caixa de setembro' }));

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
    fireEvent.click(await screen.findByRole('button', { name: 'Caixa de setembro' }));
    expect(await screen.findByText('Como está o caixa?')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Qual a receita?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByLabelText('O Consultor está respondendo')).toBeTruthy();
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

    expect(await screen.findByText('Qual a receita?')).toBeTruthy();
    expect(await screen.findByText('A receita oficial do mês é 0.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText('O Consultor está respondendo')).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Caixa de setembro' }));
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
    expect(screen.getByRole('dialog', { name: 'Consultor' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mensagem para o Consultor'), {
      target: { value: 'Tentar de novo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('O Consultor está temporariamente indisponível.')).toBeTruthy();
    expect(screen.getByText('Como está o caixa?')).toBeTruthy();
  });

  it('mostra empty state e não envia quando o Consultor está indisponível', async () => {
    vi.mocked(getConsultantStatus).mockResolvedValue({ status: 'DISABLED' });
    renderChat();
    await openConsultant();

    expect(
      await screen.findByText('O Consultor está temporariamente indisponível.'),
    ).toBeTruthy();
    expect(listConsultantConversations).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Mensagem para o Consultor') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
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
    fireEvent.click(await screen.findByRole('button', { name: 'Caixa de setembro' }));
    expect(await screen.findByText('O caixa do mês está estável.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trocar tenant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Consultor' })).toBeNull();
      expect(screen.queryByText('O caixa do mês está estável.')).toBeNull();
      expect(screen.queryByText('Caixa de setembro')).toBeNull();
    });
    expect(await screen.findByRole('button', { name: 'Abrir o Consultor' })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Caixa de setembro' }));
    expect(await screen.findByText('O caixa do mês está estável.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trocar tenant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Consultor' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Abrir o Consultor' })).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Caixa de setembro' }));

    const bubble = await screen.findByText('<script>window.__consultantPwned = true</script>');
    expect(bubble.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).toContain('&lt;script&gt;window.__consultantPwned = true&lt;/script&gt;');
    expect(
      (window as unknown as { __consultantPwned?: boolean }).__consultantPwned,
    ).toBeUndefined();
  });
});
