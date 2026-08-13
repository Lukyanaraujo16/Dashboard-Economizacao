import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../app/login/page';
import {
  createAuthenticatedGetCurrentUser,
  createUnauthenticatedGetCurrentUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
});

describe('rota /login', () => {
  it('não autenticado → Login Experience', async () => {
    renderWithAuth(<LoginPage />, {
      getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    expect(await screen.findByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.queryByText('DEV')).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('autenticado → redirect /', async () => {
    renderWithAuth(<LoginPage />, {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
    expect(screen.queryByRole('heading', { name: /bem-vindo de volta/i })).toBeNull();
  });

  it('durante loading não flasha o formulário', () => {
    const pending = vi.fn(
      () =>
        new Promise<never>(() => {
          // pendente propositalmente
        }),
    );

    renderWithAuth(<LoginPage />, {
      getCurrentUserAction: pending as never,
      hydrateOnMount: true,
    });

    expect(screen.queryByRole('heading', { name: /bem-vindo de volta/i })).toBeNull();
  });
});
