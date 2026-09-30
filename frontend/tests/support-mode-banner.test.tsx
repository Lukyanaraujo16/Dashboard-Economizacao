import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../src/auth';
import type { AuthMeResponse, AuthenticatedUser, SupportState } from '../src/auth/types';
import { SupportModeBanner } from '../src/components/layout/support-mode-banner';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => '/empresas',
  useSearchParams: () => new URLSearchParams(),
}));

const operator: AuthenticatedUser = {
  ...mockAuthenticatedUser,
  role: 'SUPER_ADMIN',
  tenantId: null,
};

function supportState(supportSessionId: string): SupportState {
  return {
    active: true,
    tenantId: 'tenant-support',
    tenantDisplayName: 'Empresa Assistida',
    startedAt: '2026-08-17T12:00:00.000Z',
    supportSessionId,
  };
}

function session(support: SupportState): AuthMeResponse {
  return { user: operator, support };
}

function ReenterControl({ next }: { readonly next: AuthMeResponse }) {
  const { applySession } = useAuth();
  return (
    <button type="button" onClick={() => applySession(next)}>
      Entrar novamente
    </button>
  );
}

function renderBanner(support: SupportState = { active: false }) {
  return renderWithAuth(
    <>
      <ReenterControl next={session(supportState('support-2'))} />
      <SupportModeBanner />
    </>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(operator, support),
      hydrateOnMount: true,
    },
  );
}

function exitButton() {
  return screen.getByRole('button', { name: /Sair do modo suporte/ });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
});

describe('botão de sair do modo suporte', () => {
  it('não mostra a barra sem sessão de suporte', async () => {
    renderBanner({ active: false });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrar novamente' })).toBeTruthy();
    });
    expect(screen.queryByRole('region', { name: 'Modo suporte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair do modo suporte' })).toBeNull();
  });

  it('habilita a saída assim que a sessão de suporte está ativa', async () => {
    renderBanner(supportState('support-1'));

    const button = await screen.findByRole('button', { name: 'Sair do modo suporte' });
    expect(screen.getByLabelText('Modo suporte').textContent).toContain('Empresa Assistida');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('mantém a saída habilitada ao entrar de novo depois de uma saída concluída', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session({ active: false })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderBanner(supportState('support-1'));

    fireEvent.click(await screen.findByRole('button', { name: 'Sair do modo suporte' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sair do modo suporte' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Entrar novamente' }));

    const button = await screen.findByRole('button', { name: 'Sair do modo suporte' });
    expect(screen.getByLabelText('Modo suporte').textContent).toContain('Empresa Assistida');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('mostra loading só enquanto a saída está em andamento e recupera após erro', async () => {
    let rejectExit: (reason?: unknown) => void = () => undefined;
    const pendingExit = new Promise<Response>((_resolve, reject) => {
      rejectExit = reject;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingExit);
    vi.stubGlobal('fetch', fetchMock);
    renderBanner(supportState('support-1'));

    const button = await screen.findByRole('button', { name: 'Sair do modo suporte' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(exitButton().hasAttribute('disabled')).toBe(true);
      expect(exitButton().getAttribute('aria-busy')).toBe('true');
    });

    fireEvent.click(exitButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rejectExit(new Error('network'));

    await waitFor(() => {
      expect(exitButton().hasAttribute('disabled')).toBe(false);
      expect(exitButton().getAttribute('aria-busy')).toBeNull();
    });
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível sair do modo suporte');
  });
});
