import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FormField } from '../src/components/ui/form-field';
import { Input } from '../src/components/ui/input';

afterEach(() => {
  cleanup();
});

describe('Input / FormField', () => {
  it('associa label ao controle', () => {
    render(
      <FormField label="E-mail">
        <Input name="email" />
      </FormField>,
    );

    const input = screen.getByLabelText('E-mail');
    expect(input).toBeTruthy();
    expect(input.getAttribute('name')).toBe('email');
  });

  it('expõe erro via aria-describedby e alert', () => {
    render(
      <FormField label="Senha" error="Campo obrigatório">
        <Input name="password" type="password" />
      </FormField>,
    );

    const input = screen.getByLabelText('Senha');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Campo obrigatório');
    expect(document.getElementById(describedBy!)).toBeTruthy();
  });

  it('respeita disabled no input', () => {
    render(<Input aria-label="Nome" disabled />);
    expect(screen.getByLabelText('Nome')).toHaveProperty('disabled', true);
  });
});
