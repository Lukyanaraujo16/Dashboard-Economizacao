export type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type ContaAzulIntegrationRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: 'CONTA_AZUL';
  readonly status: IntegrationStatus;
  readonly connectedAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly lastErrorCode: string | null;
};

export type ContaAzulCredentialRecord = {
  readonly id: string;
  readonly integrationId: string;
  readonly encryptedAccessToken: string;
  readonly encryptedRefreshToken: string;
  readonly accessExpiresAt: Date;
  readonly tokenType: string;
};

export type PublicContaAzulIntegration = {
  readonly provider: 'CONTA_AZUL';
  readonly status: IntegrationStatus;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
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
