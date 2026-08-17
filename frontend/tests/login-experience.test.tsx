import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginExperience } from '../src/login/login-experience';
import { LoginRequestError } from '../src/services/auth/login';
import {
  createAuthenticatedGetCurrentUser,
  createUnauthenticatedGetCurrentUser,
  mockAuthenticatedUser,
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
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

beforeEach(() => {
  replaceMock.mockReset();
});

describe('LoginExperience (visual freeze)', () => {
  it('renderiza hierarquia de marca e card de acesso', () => {
    renderWithAuth(<LoginExperience />);

    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /inteligência financeira/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy();
    expect(screen.getByLabelText(/^senha/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeTruthy();
    expect(screen.getByText('Controle inteligente')).toBeTruthy();
    expect(screen.getByText('Segurança')).toBeTruthy();
    expect(screen.getByText('Performance')).toBeTruthy();
  });

  it('mantém autocomplete adequado a password managers', () => {
    renderWithAuth(<LoginExperience />);

    expect(screen.getByLabelText(/e-mail/i).getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText(/^senha/i).getAttribute('autocomplete')).toBe('current-password');
  });

  it('controles DEV de tema quando solicitados', () => {
    renderWithAuth(<LoginExperience showThemeControls />);

    expect(screen.getByText('DEV')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
  });

  it('alterna atributo de esquema Light/Dark', () => {
    const { container } = renderWithAuth(<LoginExperience showThemeControls />);

    const shell = () => container.querySelector('[data-scheme]');
    expect(shell()?.getAttribute('data-scheme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(shell()?.getAttribute('data-scheme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(shell()?.getAttribute('data-scheme')).toBe('light');
  });

  it('usa brandName customizado quando informado', () => {
    renderWithAuth(<LoginExperience brandName="Marca Custom" />);
    expect(screen.getByText('Marca Custom')).toBeTruthy();
  });

  it('usa placeholder de marca preparado para asset futuro', () => {
    const { container, rerender, getCurrentUserAction, logoutAction } = renderWithAuth(
      <LoginExperience />,
    );
    expect(container.querySelector('[data-brand-placeholder="true"]')).toBeTruthy();

    rerender(<LoginExperience brandLogoUrl="/brand/future-logo.svg" />);
    // rerender without provider loses context — remount with helper
    cleanup();
    const again = renderWithAuth(<LoginExperience brandLogoUrl="/brand/future-logo.svg" />, {
      getCurrentUserAction,
      logoutAction,
    });
    expect(again.container.querySelector('[data-brand-placeholder="true"]')).toBeNull();
    expect(again.container.querySelector('img[src="/brand/future-logo.svg"]')).toBeTruthy();
  });
});

describe('LoginExperience (integração funcional)', () => {
  it('submit válido chama serviço, hidrata /me e redireciona', async () => {
    const loginAction = vi.fn().mockResolvedValue({ status: 'ok' });
    const getCurrentUserAction = createAuthenticatedGetCurrentUser();

    renderWithAuth(<LoginExperience loginAction={loginAction} />, {
      getCurrentUserAction,
    });

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(loginAction).toHaveBeenCalledTimes(1);
    });

    expect(loginAction).toHaveBeenCalledWith({
      email: 'user@empresa.com',
      password: 'Password#12345',
    });
    expect(Object.keys(loginAction.mock.calls[0]![0] as object).sort()).toEqual([
      'email',
      'password',
    ]);

    await waitFor(() => {
      expect(getCurrentUserAction).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith('/');
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('bloqueia duplo submit enquanto loading', async () => {
    let resolveLogin: ((value: { status: 'ok' }) => void) | undefined;
    const loginAction = vi.fn(
      () =>
        new Promise<{ status: 'ok' }>((resolve) => {
          resolveLogin = resolve;
        }),
    );

    renderWithAuth(<LoginExperience loginAction={loginAction} />, {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
    });

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });

    const submit = screen.getByRole('button', { name: /entrar|carregando/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    await waitFor(() => {
      expect(loginAction).toHaveBeenCalledTimes(1);
    });

    expect(submit).toHaveProperty('disabled', true);
    expect(submit.getAttribute('aria-busy')).toBe('true');

    resolveLogin?.({ status: 'ok' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('401 mostra mensagem genérica sem enumerar causa', async () => {
    const loginAction = vi
      .fn()
      .mockRejectedValue(
        new LoginRequestError(
          'unauthenticated',
          'Não foi possível entrar. Verifique suas credenciais.',
        ),
      );

    renderWithAuth(<LoginExperience loginAction={loginAction} />);

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Não foi possível entrar. Verifique suas credenciais.'),
    ).toBeTruthy();
    expect(screen.queryByText(/bloqueado/i)).toBeNull();
    expect(screen.queryByText(/inexistente/i)).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('422 associa erros de email e password quando suportado', async () => {
    const loginAction = vi.fn().mockRejectedValue(
      new LoginRequestError('validation', 'Dados de login inválidos.', {
        details: [
          { field: 'email', issue: 'invalid_format' },
          { field: 'password', issue: 'min_length' },
        ],
      }),
    );

    renderWithAuth(<LoginExperience loginAction={loginAction} />);

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeTruthy();
    expect(await screen.findByText(/pelo menos 10 caracteres/i)).toBeTruthy();
  });

  it('erro de rede e 500 mostram mensagem sanitizada', async () => {
    const loginAction = vi
      .fn()
      .mockRejectedValueOnce(
        new LoginRequestError(
          'unavailable',
          'Não foi possível conectar ao serviço. Tente novamente.',
        ),
      );

    const { rerender, getCurrentUserAction, logoutAction } = renderWithAuth(
      <LoginExperience loginAction={loginAction} />,
    );

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Não foi possível conectar ao serviço. Tente novamente.'),
    ).toBeTruthy();

    loginAction.mockRejectedValueOnce(
      new LoginRequestError(
        'unavailable',
        'Não foi possível conectar ao serviço. Tente novamente.',
        { httpStatus: 500, code: 'INTERNAL_ERROR' },
      ),
    );

    cleanup();
    renderWithAuth(<LoginExperience loginAction={loginAction} />, {
      getCurrentUserAction,
      logoutAction,
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Não foi possível conectar ao serviço. Tente novamente.'),
    ).toBeTruthy();
    expect(screen.queryByText(/redis/i)).toBeNull();
    expect(screen.queryByText(/fastify/i)).toBeNull();
    expect(rerender).toBeTypeOf('function');
  });

  it('validação client-side impede submit inválido', async () => {
    const loginAction = vi.fn();

    renderWithAuth(<LoginExperience loginAction={loginAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe o e-mail.')).toBeTruthy();
    expect(await screen.findByText('Informe a senha.')).toBeTruthy();
    expect(loginAction).not.toHaveBeenCalled();
  });

  it('não persiste senha nem token em storage', async () => {
    const loginAction = vi.fn().mockResolvedValue({ status: 'ok' });

    renderWithAuth(<LoginExperience loginAction={loginAction} />, {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
    });

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'user@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^senha/i), {
      target: { value: 'Password#12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('Password#12345');
    expect(JSON.stringify(sessionStorage)).not.toContain('Password#12345');
  });

  it('exige AuthProvider', () => {
    expect(() => render(<LoginExperience />)).toThrow(/AuthProvider/);
  });

  it('sem autenticação prévia permanece na Login Experience', () => {
    renderWithAuth(<LoginExperience />, {
      getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
    });
    expect(screen.getByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
