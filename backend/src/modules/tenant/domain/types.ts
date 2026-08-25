export const TENANT_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Resumo público da conexão Conta Azul na listagem administrativa. Sem tokens. */
export type TenantContaAzulSummary = {
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  readonly lastSuccessfulSyncAt: Date | null;
};

export type TenantRecord = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt: Date | null;
  readonly contaAzul: TenantContaAzulSummary | null;
};

export type CreateTenantInput = {
  readonly name: string;
  readonly displayName: string;
  readonly status?: TenantStatus;
};

export type UpdateTenantInput = {
  readonly name?: string;
  readonly displayName?: string;
};

export type ListTenantsFilter = {
  readonly status?: TenantStatus;
  readonly limit?: number;
  readonly offset?: number;
};

export type ListTenantsResult = {
  readonly items: readonly TenantRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
};
