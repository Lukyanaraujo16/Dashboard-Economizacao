import { isAutoSyncDue } from './conta-azul-auto-sync-schedule.js';
import { cursorsHaveIdentityMismatch } from './conta-azul-sync-identity.js';
import type { IntegrationStatus } from './types.js';

export type AutoSyncSkipReason =
  | 'tenant_disabled'
  | 'disconnected'
  | 'error'
  | 'credential_missing'
  | 'external_account_missing'
  | 'no_baseline'
  | 'identity_changed'
  | 'in_progress'
  | 'not_due';

export type AutoSyncEligibilityInput = {
  readonly status: IntegrationStatus;
  readonly tenantStatus: 'ACTIVE' | 'DISABLED';
  readonly hasCredential: boolean;
  readonly externalAccountId: string | null;
  readonly lastSuccessfulSyncAt: Date | null;
  readonly now: Date;
  readonly intervalMs: number;
  readonly hasActiveRun: boolean;
  readonly cursors: readonly { readonly externalAccountId: string }[];
};

export function resolveAutoSyncSkipReason(
  input: AutoSyncEligibilityInput,
): AutoSyncSkipReason | null {
  if (input.tenantStatus !== 'ACTIVE') {
    return 'tenant_disabled';
  }
  if (input.status === 'DISCONNECTED') {
    return 'disconnected';
  }
  if (input.status === 'ERROR') {
    return 'error';
  }
  if (!input.hasCredential) {
    return 'credential_missing';
  }
  if (!input.externalAccountId) {
    return 'external_account_missing';
  }
  if (!input.lastSuccessfulSyncAt) {
    return 'no_baseline';
  }
  if (cursorsHaveIdentityMismatch(input.cursors, input.externalAccountId)) {
    return 'identity_changed';
  }
  if (input.hasActiveRun) {
    return 'in_progress';
  }
  if (
    !isAutoSyncDue({
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
      now: input.now,
      intervalMs: input.intervalMs,
    })
  ) {
    return 'not_due';
  }
  return null;
}
