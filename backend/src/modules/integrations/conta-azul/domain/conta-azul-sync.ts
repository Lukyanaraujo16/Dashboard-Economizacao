export const CONTA_AZUL_SYNC_PAGE_SIZE = 100;

/** Margem abaixo do teto oficial de 10 req/s (~8 req/s). */
export const CONTA_AZUL_SYNC_MIN_INTERVAL_MS = 125;

/**
 * Hipótese técnica pendente de homologação real.
 * `permite_apenas_filhos` é required na documentação oficial (2026-08-18).
 * `false` pede a árvore completa (pais + filhos).
 */
export const CONTA_AZUL_CATEGORIES_ONLY_CHILDREN = false;

/**
 * Intervalo de vencimento por chamada. A documentação oficial não publica
 * limite máximo de intervalo; 90 dias é o default conservador da 2.3.
 */
export const CONTA_AZUL_SYNC_WINDOW_DAYS = 90;

/**
 * Horizonte MVP default configurável:
 * 5 anos anteriores + 2 anos futuros.
 * Não é regra rígida de domínio; ajustável só por constante, não por UI.
 */
export const CONTA_AZUL_SYNC_LOOKBACK_YEARS = 5;
export const CONTA_AZUL_SYNC_LOOKAHEAD_YEARS = 2;

export const CONTA_AZUL_MANUAL_SYNC_JOB_NAME = 'conta-azul-manual-sync';

/** Limite operacional da execução e da detecção de SyncRun órfão. */
export const CONTA_AZUL_SYNC_JOB_TIMEOUT_MS = 30 * 60 * 1000;

/** Evita write storm de heartbeat em páginas curtas. */
export const CONTA_AZUL_SYNC_HEARTBEAT_MIN_INTERVAL_MS = 5_000;

export type ContaAzulSyncErrorCode =
  | 'sync_unauthorized'
  | 'sync_rate_limited'
  | 'sync_upstream_unavailable'
  | 'sync_invalid_payload'
  | 'sync_persistence_failed'
  | 'sync_tenant_disabled'
  | 'sync_disconnected'
  | 'sync_timeout'
  | 'sync_enqueue_failed'
  | 'sync_stale_run';

/** Itens processados (upsert) por recurso; não distingue insert de update. */
export type ContaAzulSyncCounts = {
  readonly categories: number;
  readonly financialAccounts: number;
  readonly parties: number;
  readonly receivables: number;
  readonly payables: number;
};

export const EMPTY_SYNC_COUNTS: ContaAzulSyncCounts = {
  categories: 0,
  financialAccounts: 0,
  parties: 0,
  receivables: 0,
  payables: 0,
};

export type ContaAzulManualSyncJobPayload = {
  readonly syncRunId: string;
  readonly tenantId: string;
  readonly integrationId: string;
};

export type PublicContaAzulSyncRun = {
  readonly id: string;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly counts: ContaAzulSyncCounts | null;
  readonly errorCode: ContaAzulSyncErrorCode | null;
};

export type ContaAzulSyncAccepted = {
  readonly syncRunId: string;
  readonly status: 'PENDING';
};

export function emptySyncCounts(): ContaAzulSyncCounts {
  return { ...EMPTY_SYNC_COUNTS };
}

export function isContaAzulSyncErrorCode(value: string | null): value is ContaAzulSyncErrorCode {
  return (
    value === 'sync_unauthorized' ||
    value === 'sync_rate_limited' ||
    value === 'sync_upstream_unavailable' ||
    value === 'sync_invalid_payload' ||
    value === 'sync_persistence_failed' ||
    value === 'sync_tenant_disabled' ||
    value === 'sync_disconnected' ||
    value === 'sync_timeout' ||
    value === 'sync_enqueue_failed' ||
    value === 'sync_stale_run'
  );
}

export function toPublicSyncErrorCode(code: string | null): ContaAzulSyncErrorCode | null {
  return isContaAzulSyncErrorCode(code) ? code : null;
}
