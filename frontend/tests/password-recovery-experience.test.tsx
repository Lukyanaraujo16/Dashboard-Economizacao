import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordRecoveryExperience } from '../src/login/password-recovery-experience';

const openMock = vi.fn();

afterEach(() => {
  cleanup();
  openMock.mockReset();
});

describe('PasswordRecoveryExperience', () => {
  it('valida campos, abre o WhatsApp codificado e volta ao login sem consultar cadastro', () => {
    vi.stubGlobal('open', openMock);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<PasswordRecoveryExperience adminWhatsappE164="5511999990000" />);

    expect(screen.getByRole('heading', { name: 'Recuperar acesso' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar para o login' }).getAttribute('href')).toBe(
      '/login',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar redefinição pelo WhatsApp' }));
    expect(screen.getByText('Informe o e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe a empresa.')).toBeTruthy();
    expect(openMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/e-mail de acesso/i), {
      target: { value: 'invalido' },
    });
    fireEvent.change(screen.getByLabelText(/^empresa/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar redefinição pelo WhatsApp' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(screen.getByText('Informe a empresa.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/e-mail de acesso/i), {
      target: { value: '  Ana@Empresa.com ' },
    });
    fireEvent.change(screen.getByLabelText(/^empresa/i), { target: { value: '  Clínica & Vida  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar redefinição pelo WhatsApp' }));

    expect(openMock).toHaveBeenCalledTimes(1);
    const url = String(openMock.mock.calls[0]?.[0]);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/5511999990000');
    expect(parsed.searchParams.get('text')).toContain('Empresa: Clínica & Vida');
    expect(parsed.searchParams.get('text')).toContain('E-mail de acesso: ana@empresa.com');
    expect(openMock.mock.calls[0]?.[2]).toBe('noopener,noreferrer');
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href')).toBe(url);
    expect(screen.queryByText(/encontramos sua conta/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('não abre WhatsApp quando o contato administrativo não está configurado', () => {
    vi.stubGlobal('open', openMock);
    render(<PasswordRecoveryExperience adminWhatsappE164={null} />);

    fireEvent.change(screen.getByLabelText(/e-mail de acesso/i), {
      target: { value: 'ana@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^empresa/i), { target: { value: 'Clínica' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar redefinição pelo WhatsApp' }));

    expect(openMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('O contato administrativo pelo WhatsApp ainda não está configurado.'),
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
