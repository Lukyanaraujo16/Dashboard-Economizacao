import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordInput } from '../src/components/ui/password-input';

afterEach(() => {
  cleanup();
});

describe('PasswordInput', () => {
  it('inicia como type password', () => {
    render(<PasswordInput aria-label="Senha" />);
    expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('password');
  });

  it('alterna mostrar/ocultar com aria-label', () => {
    render(<PasswordInput aria-label="Senha" />);
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('password');
  });
});
