import type { TenantContaAzulSummary, TenantRecord } from '../domain/types.js';

export type PublicTenantContaAzulResponse = {
  readonly status: TenantContaAzulSummary['status'];
  readonly lastSuccessfulSyncAt: string | null;
};

export type PublicTenantResponse = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly status: TenantRecord['status'];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deactivatedAt: string | null;
  readonly integration: PublicTenantContaAzulResponse | null;
};

export function toPublicTenantResponse(tenant: TenantRecord): PublicTenantResponse {
  return {
    id: tenant.id,
    name: tenant.name,
    displayName: tenant.displayName,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    deactivatedAt: tenant.deactivatedAt?.toISOString() ?? null,
    integration: tenant.contaAzul
      ? {
          status: tenant.contaAzul.status,
          lastSuccessfulSyncAt: tenant.contaAzul.lastSuccessfulSyncAt?.toISOString() ?? null,
        }
      : null,
  };
}
