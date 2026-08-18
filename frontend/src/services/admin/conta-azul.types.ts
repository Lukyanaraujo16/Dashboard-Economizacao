export type ContaAzulIntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type ContaAzulIntegration = {
  readonly provider: 'CONTA_AZUL';
  readonly status: ContaAzulIntegrationStatus;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
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
