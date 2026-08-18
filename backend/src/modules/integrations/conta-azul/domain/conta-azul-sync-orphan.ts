import type { SyncRunRecord } from '../repositories/sync-run.repository.js';
import { CONTA_AZUL_SYNC_JOB_TIMEOUT_MS } from './conta-azul-sync.js';

export const CONTA_AZUL_LIVING_JOB_STATES = new Set([
  'waiting',
  'waiting-children',
  'active',
  'delayed',
  'prioritized',
  'paused',
]);

export type ContaAzulJobLifecycle = 'missing' | 'unknown' | string;

export function isLivingContaAzulJob(state: ContaAzulJobLifecycle): boolean {
  if (state === 'missing') {
    return false;
  }
  if (state === 'unknown') {
    return true;
  }
  return CONTA_AZUL_LIVING_JOB_STATES.has(state);
}

export function lastSyncActivityAt(run: {
  readonly startedAt: Date;
  readonly heartbeatAt: Date | null;
}): Date {
  return run.heartbeatAt ?? run.startedAt;
}

export function isOrphanSyncRun(input: {
  readonly status: SyncRunRecord['status'];
  readonly startedAt: Date;
  readonly heartbeatAt: Date | null;
  readonly jobState: ContaAzulJobLifecycle;
  readonly now: Date;
  readonly timeoutMs?: number;
}): boolean {
  if (input.status !== 'PENDING' && input.status !== 'RUNNING') {
    return false;
  }
  if (isLivingContaAzulJob(input.jobState)) {
    return false;
  }
  const timeoutMs = input.timeoutMs ?? CONTA_AZUL_SYNC_JOB_TIMEOUT_MS;
  const lastActivity = lastSyncActivityAt(input);
  return input.now.getTime() - lastActivity.getTime() >= timeoutMs;
}
