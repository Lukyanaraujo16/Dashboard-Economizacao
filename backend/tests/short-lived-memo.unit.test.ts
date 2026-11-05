import { describe, expect, it, vi } from 'vitest';

import { memoizeShortLived } from '../src/shared/short-lived-memo.js';
import { withShortLivedMonthlyCashFlowCache } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';

describe('memoizeShortLived', () => {
  it('deduplica chamadas iguais em paralelo e expira após o ttl', async () => {
    let now = 1_000;
    const fn = vi.fn(async (key: string) => `v-${key}`);
    const memo = memoizeShortLived(fn, { keyOf: (k) => k, ttlMs: 100, clock: () => now });

    await Promise.all([memo('a'), memo('a'), memo('b')]);
    expect(fn).toHaveBeenCalledTimes(2);

    now += 50;
    await memo('a');
    expect(fn).toHaveBeenCalledTimes(2);

    now += 100;
    await memo('a');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('erro não fica em cache', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce('ok');
    const memo = memoizeShortLived(fn, { keyOf: () => 'k', ttlMs: 10_000 });
    await expect(memo('x')).rejects.toThrow('falha');
    await expect(memo('x')).resolves.toBe('ok');
  });

  it('respeita o limite de entradas', async () => {
    const fn = vi.fn(async (k: string) => k);
    const memo = memoizeShortLived(fn, { keyOf: (k) => k, ttlMs: 10_000, maxEntries: 2 });
    await memo('a');
    await memo('b');
    await memo('c');
    await memo('a');
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe('withShortLivedMonthlyCashFlowCache', () => {
  it('reaproveita o mesmo fluxo e separa tenant, mês e centro', async () => {
    const getMonthlyCashFlow = vi.fn(async () => ({}) as MonthlyCashFlow);
    const cached = withShortLivedMonthlyCashFlowCache({ getMonthlyCashFlow });
    const now = new Date('2026-11-05T15:00:00.000Z');

    await Promise.all([
      cached.getMonthlyCashFlow({ tenantId: 't-a', monthKey: '2026-10', costCenterId: 'cc-1', now }),
      cached.getMonthlyCashFlow({ tenantId: 't-a', monthKey: '2026-10', costCenterId: 'cc-1', now }),
      cached.getMonthlyCashFlow({ tenantId: 't-a', monthKey: '2026-10', now }),
      cached.getMonthlyCashFlow({ tenantId: 't-b', monthKey: '2026-10', costCenterId: 'cc-1', now }),
      cached.getMonthlyCashFlow({ tenantId: 't-a', monthKey: '2026-09', costCenterId: 'cc-1', now }),
    ]);
    expect(getMonthlyCashFlow).toHaveBeenCalledTimes(4);
  });
});
