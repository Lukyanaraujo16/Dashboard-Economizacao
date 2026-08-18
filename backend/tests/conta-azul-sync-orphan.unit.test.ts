import { describe, expect, it } from 'vitest';

import { isOrphanSyncRun } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync-orphan.js';
import { CONTA_AZUL_SYNC_JOB_TIMEOUT_MS } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

const startedAt = new Date('2026-08-18T12:00:00.000Z');

describe('Detecção de SyncRun órfão', () => {
  it('não declara órfão quando o job ainda espera o worker', () => {
    expect(
      isOrphanSyncRun({
        status: 'PENDING',
        startedAt,
        heartbeatAt: null,
        jobState: 'waiting',
        now: new Date(startedAt.getTime() + CONTA_AZUL_SYNC_JOB_TIMEOUT_MS + 1),
      }),
    ).toBe(false);
  });

  it('não declara órfão quando o job está active com heartbeat recente', () => {
    expect(
      isOrphanSyncRun({
        status: 'RUNNING',
        startedAt,
        heartbeatAt: new Date('2026-08-18T12:10:00.000Z'),
        jobState: 'active',
        now: new Date('2026-08-18T12:10:30.000Z'),
      }),
    ).toBe(false);
  });

  it('não declara órfão se o job sumiu mas o timeout ainda não venceu', () => {
    expect(
      isOrphanSyncRun({
        status: 'PENDING',
        startedAt,
        heartbeatAt: null,
        jobState: 'missing',
        now: new Date(startedAt.getTime() + 1_000),
      }),
    ).toBe(false);
  });

  it('declara órfão quando o job sumiu e o timeout venceu', () => {
    expect(
      isOrphanSyncRun({
        status: 'RUNNING',
        startedAt,
        heartbeatAt: startedAt,
        jobState: 'missing',
        now: new Date(startedAt.getTime() + CONTA_AZUL_SYNC_JOB_TIMEOUT_MS),
      }),
    ).toBe(true);
  });

  it('trata estado unknown como vivo para não matar execução legítima', () => {
    expect(
      isOrphanSyncRun({
        status: 'RUNNING',
        startedAt,
        heartbeatAt: startedAt,
        jobState: 'unknown',
        now: new Date(startedAt.getTime() + CONTA_AZUL_SYNC_JOB_TIMEOUT_MS),
      }),
    ).toBe(false);
  });
});
