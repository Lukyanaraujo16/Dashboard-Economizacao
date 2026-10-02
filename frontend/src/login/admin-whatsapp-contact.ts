/**
 * Contato administrativo único do fluxo público de recuperação.
 * O número não fica em componentes. A tela só lê esta função.
 *
 * Configuração: `NEXT_PUBLIC_ADMIN_WHATSAPP_E164` no ambiente do Next
 * (produção: `/etc/dashboard-economizacao/web.env`). Dígitos E.164, com ou
 * sem `+`. Ausência ou valor inválido não abre WhatsApp.
 */

const E164_MIN_DIGITS = 10;
const E164_MAX_DIGITS = 15;

export function readAdminWhatsappE164(
  raw: string | undefined = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_E164,
): string | null {
  return normalizeAdminWhatsappE164(raw);
}

export function normalizeAdminWhatsappE164(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const digits = raw.trim().replace(/[^\d]/g, '');
  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
    return null;
  }
  return digits;
}
