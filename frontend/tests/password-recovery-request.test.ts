import { describe, expect, it } from 'vitest';

import { normalizeAdminWhatsappE164 } from '../src/login/admin-whatsapp-contact';
import {
  buildPasswordRecoveryMessage,
  buildPasswordRecoveryWhatsappUrl,
  validatePasswordRecoveryFields,
} from '../src/login/password-recovery-request';

describe('recuperação assistida via WhatsApp', () => {
  it('normaliza o telefone administrativo uma única vez', () => {
    expect(normalizeAdminWhatsappE164(' +55 (11) 99999-0000 ')).toBe('5511999990000');
    expect(normalizeAdminWhatsappE164('')).toBeNull();
    expect(normalizeAdminWhatsappE164('123')).toBeNull();
  });

  it('exige e-mail válido e empresa preenchida, com trim', () => {
    expect(validatePasswordRecoveryFields({ email: '  ', company: '  ' })).toEqual({
      email: 'Informe o e-mail.',
      company: 'Informe a empresa.',
    });
    expect(validatePasswordRecoveryFields({ email: 'nao-e-email', company: 'Clínica' })).toEqual({
      email: 'Informe um e-mail válido.',
    });
    expect(
      validatePasswordRecoveryFields({ email: '  Ana@Empresa.com ', company: '  Clínica Life  ' }),
    ).toEqual({});
  });

  it('monta a mensagem só com o que a pessoa digitou e codifica a URL', () => {
    const message = buildPasswordRecoveryMessage({
      email: '  Ana@Empresa.com ',
      company: '  Clínica & Vida\n',
    });
    expect(message).toContain('Empresa: Clínica & Vida');
    expect(message).toContain('E-mail de acesso: ana@empresa.com');
    expect(message).not.toMatch(/senha:|tenant|userId|token/i);

    const url = buildPasswordRecoveryWhatsappUrl('5511999990000', {
      email: '  Ana@Empresa.com ',
      company: '  Clínica & Vida\n',
    });
    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe('https://wa.me');
    expect(parsed.pathname).toBe('/5511999990000');
    expect(parsed.searchParams.get('text')).toBe(message);
    expect(url).not.toContain(' ');
  });

  it('não gera URL sem contato configurado', () => {
    expect(
      buildPasswordRecoveryWhatsappUrl(null, { email: 'ana@empresa.com', company: 'Clínica' }),
    ).toBeNull();
  });
});
