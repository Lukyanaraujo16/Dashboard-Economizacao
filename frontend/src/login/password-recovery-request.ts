import { normalizeAdminWhatsappE164 } from './admin-whatsapp-contact';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const COMPANY_MAX_LENGTH = 120;

export type PasswordRecoveryFieldErrors = {
  readonly email?: string;
  readonly company?: string;
};

export type PasswordRecoveryDraft = {
  readonly email: string;
  readonly company: string;
};

export function normalizeRecoveryEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeRecoveryCompany(value: string): string {
  return value.trim().replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
}

export function validatePasswordRecoveryFields(
  input: PasswordRecoveryDraft,
): PasswordRecoveryFieldErrors {
  const errors: { email?: string; company?: string } = {};
  const email = normalizeRecoveryEmail(input.email);
  const company = normalizeRecoveryCompany(input.company);

  if (email.length === 0) {
    errors.email = 'Informe o e-mail.';
  } else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (company.length === 0) {
    errors.company = 'Informe a empresa.';
  } else if (company.length > COMPANY_MAX_LENGTH) {
    errors.company = `A empresa deve ter no máximo ${COMPANY_MAX_LENGTH} caracteres.`;
  }

  return errors;
}

export function buildPasswordRecoveryMessage(input: PasswordRecoveryDraft): string {
  const email = normalizeRecoveryEmail(input.email);
  const company = normalizeRecoveryCompany(input.company);
  return [
    'Olá! Preciso solicitar a redefinição da minha senha de acesso ao Dashboard Economização.',
    '',
    `Empresa: ${company}`,
    `E-mail de acesso: ${email}`,
    '',
    'Pode verificar meu acesso, por favor?',
  ].join('\n');
}

export function buildPasswordRecoveryWhatsappUrl(
  phoneRaw: string | null | undefined,
  input: PasswordRecoveryDraft,
): string | null {
  const phone = normalizeAdminWhatsappE164(phoneRaw);
  if (!phone) {
    return null;
  }
  const message = buildPasswordRecoveryMessage(input);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
