/**
 * Payload de GET /parcelas/{id} já obtido (ex.: 11-E.1) para reusar no rateio.
 * Isolado por kind + externalId; o caller resolve tenant/integration no lookup.
 */
export type ReusedInstallmentDetail = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly externalId: string;
  readonly payload: unknown;
};
