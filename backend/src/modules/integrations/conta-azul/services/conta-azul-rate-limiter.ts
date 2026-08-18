import { CONTA_AZUL_SYNC_MIN_INTERVAL_MS } from '../domain/conta-azul-sync.js';

export type ContaAzulRateLimiter = {
  wait(): Promise<void>;
};

export function createContaAzulRateLimiter(
  minIntervalMs = CONTA_AZUL_SYNC_MIN_INTERVAL_MS,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  now: () => number = () => Date.now(),
): ContaAzulRateLimiter {
  let nextAllowedAt = 0;

  return {
    async wait() {
      const waitMs = Math.max(0, nextAllowedAt - now());
      nextAllowedAt = now() + waitMs + minIntervalMs;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    },
  };
}
