import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LoginExperience } from '../src/login/login-experience';

afterEach(() => {
  cleanup();
});

describe('LoginExperience (visual)', () => {
  it('renderiza hierarquia de marca e card de acesso', () => {
    render(<LoginExperience />);

    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /inteligência financeira/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeTruthy();
    expect(screen.getByText('Controle inteligente')).toBeTruthy();
    expect(screen.getByText('Segurança')).toBeTruthy();
    expect(screen.getByText('Performance')).toBeTruthy();
  });

  it('não expõe fluxo funcional de autenticação', () => {
    render(<LoginExperience />);

    const enter = screen.getByRole('button', { name: 'Entrar' });
    expect(enter.getAttribute('type')).toBe('button');

    const email = screen.getByLabelText('E-mail');
    expect(email.getAttribute('name')).toBe('email');
  });

  it('controles DEV de tema quando solicitados', () => {
    render(<LoginExperience showThemeControls />);

    expect(screen.getByText('DEV')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
  });

  it('alterna atributo de esquema Light/Dark', () => {
    const { container } = render(<LoginExperience showThemeControls />);

    const shell = () => container.querySelector('[data-scheme]');
    expect(shell()?.getAttribute('data-scheme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(shell()?.getAttribute('data-scheme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(shell()?.getAttribute('data-scheme')).toBe('light');
  });

  it('usa placeholder de marca preparado para asset futuro', () => {
    const { container, rerender } = render(<LoginExperience />);
    expect(container.querySelector('[data-brand-placeholder="true"]')).toBeTruthy();

    rerender(<LoginExperience brandLogoUrl="/brand/future-logo.svg" />);
    expect(container.querySelector('[data-brand-placeholder="true"]')).toBeNull();
    expect(container.querySelector('img[src="/brand/future-logo.svg"]')).toBeTruthy();
  });
});
