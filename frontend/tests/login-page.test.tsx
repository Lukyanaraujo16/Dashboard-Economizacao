import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../app/login/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
});

describe('rota /login', () => {
  it('renderiza a Login Experience de produção', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.queryByText('DEV')).toBeNull();
  });
});
