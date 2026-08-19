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

export function isAutoSyncDue(input: {
  readonly lastSuccessfulSyncAt: Date;
  readonly now: Date;
  readonly intervalMs: number;
}): boolean {
  return input.now.getTime() >= input.lastSuccessfulSyncAt.getTime() + input.intervalMs;
}
