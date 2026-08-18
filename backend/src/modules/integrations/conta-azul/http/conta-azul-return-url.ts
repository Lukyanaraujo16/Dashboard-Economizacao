import { type ContaAzulCallbackSignal } from '../domain/conta-azul-oauth.js';

const CALLBACK_SIGNALS = new Set<ContaAzulCallbackSignal>([
  'connected',
  'denied',
  'invalid',
  'expired',
  'error',
  'replay',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildContaAzulReturnUrl(
  appUrl: string,
  tenantId: string | null,
  signal: ContaAzulCallbackSignal,
): string {
  const safeSignal = CALLBACK_SIGNALS.has(signal) ? signal : 'error';
  const origin = new URL(appUrl).origin;
  if (tenantId && UUID_PATTERN.test(tenantId)) {
    return `${origin}/empresas/${tenantId}/integracoes?contaAzul=${safeSignal}`;
  }
  return `${origin}/empresas?contaAzul=${safeSignal}`;
}
