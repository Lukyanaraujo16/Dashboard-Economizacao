/**
 * Fastify trustProxy para o backend atrás do Nginx na mesma VPS.
 *
 * O processo HTTP liga em loopback (HOST=127.0.0.1). Só o proxy local
 * consegue conectar; cabeçalhos X-Forwarded-* desse hop são confiáveis.
 * Bind em interface pública não confia em proxy — evita spoof de IP.
 */
export function resolveTrustProxy(host: string): false | readonly string[] {
  const normalized = host.trim().toLowerCase();
  if (normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1') {
    return ['127.0.0.1', '::1'];
  }
  return false;
}
