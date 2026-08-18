export type ContaAzulIntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type ContaAzulPublicErrorCode =
  'refresh_failed' | 'identity_unauthorized' | 'identity_incomplete' | 'external_account_conflict';

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
  'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'unavailable';

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
