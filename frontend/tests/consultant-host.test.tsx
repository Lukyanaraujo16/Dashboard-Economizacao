import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConsultantHost,
  resolveConsultantReferenceMonth,
  shouldShowConsultantHost,
} from '../src/components/consultant';
import styles from '../src/components/consultant/consultant.module.css';
import {
  getConsultantStatus,
  getProactiveUnreadCount,
  listConsultantConversations,
  presentProactiveInsights,
} from '../src/services/consultant';
import { useAuth } from '../src/auth';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
let pathname = '/';

vi.mock('../src/services/consultant', async () => {
  const actual = await vi.importActual<typeof import('../src/services/consultant')>(
    '../src/services/consultant',
  );
  return {
    ...actual,
    getConsultantStatus: vi.fn(),
    getProactiveUnreadCount: vi.fn(),
    listConsultantConversations: vi.fn(),
    presentProactiveInsights: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

function AuthProbe() {
  const { status, user } = useAuth();
  return (
    <div data-testid="auth-status">
      {status}:{user?.role ?? 'none'}
    </div>
  );
}

function LogoutControl() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={() => void logout()}>
      Encerrar sessão
    </button>
  );
}

function renderHost(
  options?: Parameters<typeof renderWithAuth>[1],
  extra?: { readonly withLogout?: boolean },
) {
  return renderWithAuth(
    <>
      <AuthProbe />
      {extra?.withLogout ? <LogoutControl /> : null}
      <ConsultantHost />
    </>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
      hydrateOnMount: true,
      ...options,
    },
  );
}

afterEach(() => {
  cleanup();
  pathname = '/';
  replaceMock.mockReset();
  sessionStorage.clear();
});

beforeEach(() => {
  pathname = '/';
  sessionStorage.clear();
  vi.mocked(getConsultantStatus).mockResolvedValue({
    status: 'ACTIVE',
    consultantName: 'Consultor',
  });
  vi.mocked(getProactiveUnreadCount).mockResolvedValue({ count: 0, insightIds: [] });
  vi.mocked(listConsultantConversations).mockResolvedValue([]);
  vi.mocked(presentProactiveInsights).mockResolvedValue(null);
});

describe('resolveConsultantReferenceMonth', () => {
  it('usa ?month= da Home e cai no mês civil quando ausente', () => {
    expect(resolveConsultantReferenceMonth(new URLSearchParams('month=2026-08'), '2026-09')).toBe(
      '2026-08',
    );
    expect(resolveConsultantReferenceMonth(new URLSearchParams('month=2026-09'), '2026-09')).toBe(
      '2026-09',
    );
    expect(resolveConsultantReferenceMonth(new URLSearchParams(), '2026-09')).toBe('2026-09');
  });
});

describe('shouldShowConsultantHost', () => {
  it('mostra apenas em superfícies tenant para USER', () => {
    expect(shouldShowConsultantHost('/', mockAuthenticatedUser, { active: false })).toBe(true);
    expect(shouldShowConsultantHost('/relatorios', mockAuthenticatedUser, { active: false })).toBe(
      true,
    );
    expect(
      shouldShowConsultantHost('/relatorios/despesas', mockAuthenticatedUser, { active: false }),
    ).toBe(true);
    expect(shouldShowConsultantHost('/empresas', mockAuthenticatedUser, { active: false })).toBe(
      false,
    );
    expect(shouldShowConsultantHost('/login', mockAuthenticatedUser, { active: false })).toBe(false);
    expect(
      shouldShowConsultantHost('/configuracoes', mockAuthenticatedUser, { active: false }),
    ).toBe(false);
  });

  it('esconde quando o usuário não pode usar superfícies tenant', () => {
    const admin = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
    expect(shouldShowConsultantHost('/', admin, { active: false })).toBe(false);
  });
});

describe('ConsultantHost', () => {
  it('mostra o FAB em `/` com USER tenant quando ACTIVE', async () => {
    renderHost();

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:USER');
    expect(await screen.findByRole('button', { name: /Falar com Consultor/ })).toBeTruthy();
  });

  it('não mostra o FAB quando o Consultor não está configurado', async () => {
    vi.mocked(getConsultantStatus).mockResolvedValue({
      status: 'NOT_CONFIGURED',
      consultantName: 'Consultor',
    });
    renderHost();

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:USER');
    await waitFor(() => {
      expect(getConsultantStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
  });

  it('não mostra o FAB em `/empresas`', async () => {
    pathname = '/empresas';
    renderHost();

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:USER');
    expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
  });

  it('não mostra o FAB quando o usuário não pode usar superfícies tenant', async () => {
    renderHost({
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'ADMIN',
        tenantId: null,
      }),
    });

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:ADMIN');
    expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
  });

  it('manifesta um lote novo uma vez e não marca leitura ao dispensar o balão', async () => {
    const play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        play = play;
      },
    );
    vi.mocked(getProactiveUnreadCount).mockResolvedValue({
      count: 3,
      insightIds: ['c', 'a', 'b'],
    });
    const first = renderHost();
    expect(await screen.findByText('Identifiquei 3 situações que merecem sua atenção.')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(play).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso da Lia' }));
    expect(screen.queryByText('Identifiquei 3 situações que merecem sua atenção.')).toBeNull();
    expect(screen.getByRole('button', { name: /3 avisos novos/ })).toBeTruthy();
    expect(presentProactiveInsights).not.toHaveBeenCalled();

    first.unmount();
    renderHost();
    expect(await screen.findByRole('button', { name: /3 avisos novos/ })).toBeTruthy();
    expect(screen.queryByText('Identifiquei 3 situações que merecem sua atenção.')).toBeNull();
    expect(play).toHaveBeenCalledOnce();

    vi.mocked(getProactiveUnreadCount).mockResolvedValue({
      count: 1,
      insightIds: ['novo'],
    });
    cleanup();
    renderHost();
    expect(await screen.findByText('A Lia tem algo novo para te contar.')).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('abre a Lia pelo balão, apresenta e não anima quando o movimento é reduzido', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.mocked(getProactiveUnreadCount).mockResolvedValue({ count: 1, insightIds: ['only'] });
    vi.mocked(presentProactiveInsights).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Lia',
      status: 'OPEN',
      startedAt: '2026-10-01T00:00:00.000Z',
      lastMessageAt: '2026-10-01T00:00:00.000Z',
      messages: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          senderType: 'SYSTEM',
          content: 'Há uma conta a pagar.',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
    renderHost();
    expect(await screen.findByRole('button', { name: 'Ver agora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 aviso novo/ }).className).not.toContain(styles.fabPulse);
    fireEvent.click(screen.getByRole('button', { name: 'Ver agora' }));
    await waitFor(() => {
      expect(presentProactiveInsights).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText('A Lia tem algo novo para te contar.')).toBeNull();
    expect(await screen.findByText('Há uma conta a pagar.')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('não manifesta no Support Mode quando a API informa zero avisos', async () => {
    vi.mocked(getProactiveUnreadCount).mockResolvedValue({ count: 0, insightIds: [] });
    renderHost({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(
        { ...mockAuthenticatedUser, role: 'ADMIN', tenantId: null },
        {
          active: true,
          tenantId: 'tenant-suporte',
          tenantDisplayName: 'Cliente',
          startedAt: '2026-10-01T00:00:00.000Z',
          supportSessionId: '33333333-3333-4333-8333-333333333333',
        },
      ),
    });
    expect(await screen.findByRole('button', { name: 'Falar com Consultor' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fechar aviso da Lia' })).toBeNull();
    expect(screen.queryByText('A Lia tem algo novo para te contar.')).toBeNull();
  });

  it('some com o FAB após logout', async () => {
    renderHost(undefined, { withLogout: true });

    expect(await screen.findByRole('button', { name: /Falar com Consultor/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Falar com/ })).toBeNull();
    });
  });
});
