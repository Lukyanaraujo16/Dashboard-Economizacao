import { describe, expect, it } from 'vitest';

import { CONTA_AZUL_SYNC_MIN_INTERVAL_MS } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';

describe('Rate limiter interno Conta Azul', () => {
  it('espaça chamadas em 125ms (~8 req/s) sem sleep na primeira', async () => {
    expect(CONTA_AZUL_SYNC_MIN_INTERVAL_MS).toBe(125);
    const sleeps: number[] = [];
    let now = 0;
    const limiter = createContaAzulRateLimiter(
      CONTA_AZUL_SYNC_MIN_INTERVAL_MS,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      () => now,
    );

    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();

    expect(sleeps).toEqual([125, 125, 125, 125, 125, 125, 125]);
    expect(now).toBe(875);
  });
});
