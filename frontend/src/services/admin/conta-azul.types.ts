export type ContaAzulIntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type ContaAzulPublicErrorCode =
  'refresh_failed' | 'identity_unauthorized' | 'identity_incomplete' | 'external_account_conflict';

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

export type ContaAzulSyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export type ContaAzulSyncCounts = {
  readonly categories: number;
  readonly financialAccounts: number;
  readonly parties: number;
  readonly receivables: number;
  readonly payables: number;
};

export type ContaAzulSyncRun = {
  readonly id: string;
  readonly status: ContaAzulSyncStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly counts: ContaAzulSyncCounts | null;
  readonly errorCode: ContaAzulSyncErrorCode | null;
};

export type ContaAzulSyncAccepted = {
  readonly syncRunId: string;
  readonly status: 'PENDING';
};

export type ContaAzulIntegration = {
  readonly provider: 'CONTA_AZUL';
  readonly status: ContaAzulIntegrationStatus;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
  readonly externalAccountId: string | null;
  readonly externalCompanyName: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastErrorCode: ContaAzulPublicErrorCode | null;
};

export type ContaAzulConnectResult = {
  readonly authorizationUrl: string;
};

export type ContaAzulCallbackSignal =
  'connected' | 'denied' | 'invalid' | 'expired' | 'error' | 'replay';

export type ContaAzulRequestFailureKind =
  'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'unavailable';

export class ContaAzulRequestError extends Error {
  readonly kind: ContaAzulRequestFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: ContaAzulRequestFailureKind,
    message: string,
    options?: { readonly httpStatus?: number; readonly code?: string; readonly cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ContaAzulRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

export function contaAzulErrorMessage(code: ContaAzulPublicErrorCode | null): string {
  switch (code) {
    case 'identity_unauthorized':
      return 'A autorização da Conta Azul precisa ser renovada.';
    case 'refresh_failed':
      return 'Não foi possível renovar o acesso à Conta Azul.';
    case 'identity_incomplete':
      return 'Não foi possível identificar a empresa conectada na Conta Azul.';
    case 'external_account_conflict':
      return 'Esta conta Conta Azul já está conectada a outra empresa.';
    default:
      return 'A autorização precisa ser renovada. Reconecte a empresa para continuar.';
  }
}

export function contaAzulSyncErrorMessage(code: ContaAzulSyncErrorCode | null): string {
  switch (code) {
    case 'sync_unauthorized':
    case 'sync_disconnected':
      return 'A autorização da Conta Azul precisa ser renovada.';
    case 'sync_rate_limited':
      return 'A Conta Azul limitou temporariamente as solicitações. Tente novamente em instantes.';
    case 'sync_timeout':
      return 'A Conta Azul não respondeu a tempo. Tente novamente.';
    case 'sync_tenant_disabled':
      return 'Empresa inativa não pode sincronizar a Conta Azul.';
    case 'sync_invalid_payload':
      return 'A Conta Azul retornou dados que não puderam ser importados.';
    default:
      return 'Não foi possível sincronizar agora. Tente novamente.';
  }
}
