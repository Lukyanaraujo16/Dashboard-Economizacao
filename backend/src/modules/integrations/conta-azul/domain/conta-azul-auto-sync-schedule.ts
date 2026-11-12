/** FNV-1a 32-bit estável para jitter por integrationId. */
export function hashIntegrationId(integrationId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < integrationId.length; index += 1) {
    hash ^= integrationId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function autoSyncSpreadDelayMs(integrationId: string, intervalMs: number): number {
  const windowMs = Math.min(Math.max(intervalMs, 1), 60_000);
  return hashIntegrationId(integrationId) % windowMs;
}

/**
 * Espera após N falhas consecutivas desde o último sucesso:
 * intervalo × 2^(N-1), limitado a max(intervalo, teto). Nunca menor que o intervalo
 * configurado, então a falha não faz a integração tentar com mais frequência.
 */
export function autoSyncRetryDelayMs(input: {
  readonly consecutiveFailures: number;
  readonly intervalMs: number;
  readonly maxBackoffMs: number;
}): number {
  if (input.consecutiveFailures <= 0) {
    return 0;
  }
  const cap = Math.max(input.intervalMs, input.maxBackoffMs);
  const exponent = Math.min(input.consecutiveFailures - 1, 30);
  return Math.min(input.intervalMs * 2 ** exponent, cap);
}

/** Próximo instante permitido depois de uma sequência de falhas; null quando não há falha. */
export function autoSyncRetryNotBefore(input: {
  readonly consecutiveFailures: number;
  readonly lastFailureAt: Date | null;
  readonly intervalMs: number;
  readonly maxBackoffMs: number;
}): Date | null {
  if (input.consecutiveFailures <= 0 || !input.lastFailureAt) {
    return null;
  }
  return new Date(input.lastFailureAt.getTime() + autoSyncRetryDelayMs(input));
}

export function isAutoSyncDue(input: {
  readonly lastSuccessfulSyncAt: Date;
  readonly now: Date;
  readonly intervalMs: number;
}): boolean {
  return input.now.getTime() >= input.lastSuccessfulSyncAt.getTime() + input.intervalMs;
}
