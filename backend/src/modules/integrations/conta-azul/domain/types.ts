export type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type ContaAzulPublicErrorCode =
  'refresh_failed' | 'identity_unauthorized' | 'identity_incomplete' | 'external_account_conflict';

export const CONTA_AZUL_PUBLIC_ERROR_CODES: ReadonlySet<string> = new Set([
  'refresh_failed',
  'identity_unauthorized',
  'identity_incomplete',
  'external_account_conflict',
]);

export type ContaAzulIntegrationRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: 'CONTA_AZUL';
  readonly status: IntegrationStatus;
  readonly connectedAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly lastSuccessfulSyncAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly externalAccountId: string | null;
  readonly externalCompanyName: string | null;
};

export type ContaAzulCredentialRecord = {
  readonly id: string;
  readonly integrationId: string;
  readonly encryptedAccessToken: string;
  readonly encryptedRefreshToken: string;
  readonly accessExpiresAt: Date;
  readonly tokenType: string;
};

export type ContaAzulExternalAccountRecord = {
  readonly id: string;
  readonly integrationId: string;
  readonly externalAccountId: string;
  readonly externalCompanyName: string | null;
  readonly metadata: ContaAzulExternalAccountMetadata | null;
};

export type ContaAzulExternalAccountMetadata = {
  readonly documento?: string;
  readonly nomeFantasia?: string;
  readonly email?: string;
};

export type ContaAzulExternalAccountInput = {
  readonly integrationId: string;
  readonly externalAccountId: string;
  readonly externalCompanyName: string | null;
  readonly metadata: ContaAzulExternalAccountMetadata | null;
};

export type PublicContaAzulIntegration = {
  readonly provider: 'CONTA_AZUL';
  readonly status: IntegrationStatus;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
  readonly externalAccountId: string | null;
  readonly externalCompanyName: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastErrorCode: ContaAzulPublicErrorCode | null;
};

export type ContaAzulOAuthState = {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly createdAt: string;
};

export type ContaAzulTokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly tokenType: string;
};

export function toPublicErrorCode(code: string | null): ContaAzulPublicErrorCode | null {
  if (!code || !CONTA_AZUL_PUBLIC_ERROR_CODES.has(code)) {
    return null;
  }
  return code as ContaAzulPublicErrorCode;
}

export function disconnectedPublicIntegration(): PublicContaAzulIntegration {
  return {
    provider: 'CONTA_AZUL',
    status: 'DISCONNECTED',
    connectedAt: null,
    disconnectedAt: null,
    externalAccountId: null,
    externalCompanyName: null,
    lastSuccessfulSyncAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
  };
}

export function toPublicContaAzulIntegration(
  record: ContaAzulIntegrationRecord | null,
): PublicContaAzulIntegration {
  if (!record) {
    return disconnectedPublicIntegration();
  }
  return {
    provider: 'CONTA_AZUL',
    status: record.status,
    connectedAt: record.connectedAt?.toISOString() ?? null,
    disconnectedAt: record.disconnectedAt?.toISOString() ?? null,
    externalAccountId: record.externalAccountId,
    externalCompanyName: record.externalCompanyName,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastErrorAt: record.lastErrorAt?.toISOString() ?? null,
    lastErrorCode: toPublicErrorCode(record.lastErrorCode),
  };
}
