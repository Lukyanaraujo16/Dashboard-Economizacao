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

export const CONTA_AZUL_PLAN_SYNCS_JOB_NAME = 'conta-azul-plan-syncs';

export const CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID = 'conta-azul-plan-syncs';

/** Tick do planner (1 min). O intervalo de sync por tenant é outro env. */
export const CONTA_AZUL_PLAN_SYNCS_TICK_MS = 60_000;

export const CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_DEFAULT = 60;

export const CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MIN = 5;

export const CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MAX = 24 * 60;

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
  | 'sync_stale_run'
  | 'sync_identity_changed';

/** Itens processados (upsert) por recurso; não distingue insert de update. */
export type ContaAzulSyncCounts = {
  readonly categories: number;
  readonly financialAccounts: number;
  readonly parties: number;
  readonly receivables: number;
  readonly payables: number;
  readonly costCenters: number;
  /** Linhas de allocation escritas nesta execução. */
  readonly costCenterAllocations: number;
  /** CC1.2 — universo local de parcelas avaliadas. */
  readonly costCenterDetailCandidates: number;
  /** CC1.2 — parcelas puladas (já enriquecidas / frescas). */
  readonly costCenterDetailSkippedFresh: number;
  /** CC1.2 — GETs /parcelas/{id} efetuados. */
  readonly costCenterDetailRequested: number;
  readonly costCenterDetailSuccess: number;
  readonly costCenterDetailNoAllocation: number;
  readonly costCenterDetailPartial: number;
  readonly costCenterDetailUnresolved: number;
  readonly costCenterDetailErrors: number;
  /** CASH-2 — parcelas elegíveis a GET /baixa nesta execução. */
  readonly ledgerCandidates: number;
  readonly ledgerFetched: number;
  readonly ledgerUpserted: number;
  readonly ledgerSkippedInvalid: number;
  readonly ledgerIdentityMismatches: number;
  readonly ledgerParcelFailures: number;
  /** 08-C1 — captura saldo-atual por conta ativa. */
  readonly balanceSnapshotsAttempted: number;
  readonly balanceSnapshotsUpserted: number;
  readonly balanceSnapshotsFailed: number;
};

export const EMPTY_SYNC_COUNTS: ContaAzulSyncCounts = {
  categories: 0,
  financialAccounts: 0,
  parties: 0,
  receivables: 0,
  payables: 0,
  costCenters: 0,
  costCenterAllocations: 0,
  costCenterDetailCandidates: 0,
  costCenterDetailSkippedFresh: 0,
  costCenterDetailRequested: 0,
  costCenterDetailSuccess: 0,
  costCenterDetailNoAllocation: 0,
  costCenterDetailPartial: 0,
  costCenterDetailUnresolved: 0,
  costCenterDetailErrors: 0,
  ledgerCandidates: 0,
  ledgerFetched: 0,
  ledgerUpserted: 0,
  ledgerSkippedInvalid: 0,
  ledgerIdentityMismatches: 0,
  ledgerParcelFailures: 0,
  balanceSnapshotsAttempted: 0,
  balanceSnapshotsUpserted: 0,
  balanceSnapshotsFailed: 0,
};

export type ContaAzulSyncTrigger = 'MANUAL' | 'SCHEDULED';

export type ContaAzulManualSyncJobPayload = {
  readonly syncRunId: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly trigger: ContaAzulSyncTrigger;
};

export type ContaAzulPlanSyncsJobPayload = {
  readonly kind: 'plan';
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
    value === 'sync_stale_run' ||
    value === 'sync_identity_changed'
  );
}

export function toPublicSyncErrorCode(code: string | null): ContaAzulSyncErrorCode | null {
  return isContaAzulSyncErrorCode(code) ? code : null;
}

export function parseAutoSyncIntervalMinutes(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) {
    return CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_DEFAULT;
  }
  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MIN ||
    parsed > CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MAX
  ) {
    throw new Error(
      `CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES deve ser um inteiro entre ${CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MIN} e ${CONTA_AZUL_AUTO_SYNC_INTERVAL_MINUTES_MAX}.`,
    );
  }
  return parsed;
}
