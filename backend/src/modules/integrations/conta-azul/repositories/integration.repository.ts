import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import { CONTA_AZUL_PROVIDER } from '../domain/conta-azul-oauth.js';
import type {
  ContaAzulCredentialRecord,
  ContaAzulIntegrationRecord,
  IntegrationStatus,
} from '../domain/types.js';

export type IntegrationWithCredential = {
  readonly integration: ContaAzulIntegrationRecord;
  readonly credential: ContaAzulCredentialRecord | null;
};

export type PersistConnectedTokensInput = {
  readonly tenantId: string;
  readonly encryptedAccessToken: string;
  readonly encryptedRefreshToken: string;
  readonly accessExpiresAt: Date;
  readonly tokenType: string;
  readonly at: Date;
};

export type ContaAzulIntegrationRepository = {
  findByTenantId(tenantId: string): Promise<IntegrationWithCredential | null>;
  findPublicByTenantId(tenantId: string): Promise<ContaAzulIntegrationRecord | null>;
  persistConnectedTokens(input: PersistConnectedTokensInput): Promise<ContaAzulIntegrationRecord>;
  disconnect(tenantId: string, at: Date): Promise<ContaAzulIntegrationRecord>;
  markError(tenantId: string, code: string, at: Date): Promise<void>;
  refreshTokensInLock(
    tenantId: string,
    work: (locked: IntegrationWithCredential) => Promise<{
      readonly encryptedAccessToken: string;
      readonly encryptedRefreshToken: string;
      readonly accessExpiresAt: Date;
      readonly tokenType: string;
    } | null>,
  ): Promise<ContaAzulCredentialRecord | null>;
};

function mapIntegration(row: {
  id: string;
  tenantId: string;
  provider: 'CONTA_AZUL';
  status: IntegrationStatus;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
}): ContaAzulIntegrationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: CONTA_AZUL_PROVIDER,
    status: row.status,
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt,
    lastErrorAt: row.lastErrorAt,
    lastErrorCode: row.lastErrorCode,
  };
}

function mapCredential(row: {
  id: string;
  integrationId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessExpiresAt: Date;
  tokenType: string;
}): ContaAzulCredentialRecord {
  return {
    id: row.id,
    integrationId: row.integrationId,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken,
    accessExpiresAt: row.accessExpiresAt,
    tokenType: row.tokenType,
  };
}

const integrationSelect = {
  id: true,
  tenantId: true,
  provider: true,
  status: true,
  connectedAt: true,
  disconnectedAt: true,
  lastErrorAt: true,
  lastErrorCode: true,
} as const;

const credentialSelect = {
  id: true,
  integrationId: true,
  encryptedAccessToken: true,
  encryptedRefreshToken: true,
  accessExpiresAt: true,
  tokenType: true,
} as const;

export function createContaAzulIntegrationRepository(
  prisma: PrismaClient,
): ContaAzulIntegrationRepository {
  return {
    async findByTenantId(tenantId) {
      const row = await prisma.integration.findUnique({
        where: { tenantId_provider: { tenantId, provider: CONTA_AZUL_PROVIDER } },
        select: {
          ...integrationSelect,
          credential: { select: credentialSelect },
        },
      });
      if (!row) {
        return null;
      }
      return {
        integration: mapIntegration(row),
        credential: row.credential ? mapCredential(row.credential) : null,
      };
    },

    async findPublicByTenantId(tenantId) {
      const row = await prisma.integration.findUnique({
        where: { tenantId_provider: { tenantId, provider: CONTA_AZUL_PROVIDER } },
        select: integrationSelect,
      });
      return row ? mapIntegration(row) : null;
    },

    async persistConnectedTokens(input) {
      return prisma.$transaction(async (tx) => {
        const integration = await tx.integration.upsert({
          where: {
            tenantId_provider: { tenantId: input.tenantId, provider: CONTA_AZUL_PROVIDER },
          },
          create: {
            tenantId: input.tenantId,
            provider: CONTA_AZUL_PROVIDER,
            status: 'CONNECTED',
            connectedAt: input.at,
            disconnectedAt: null,
            lastErrorAt: null,
            lastErrorCode: null,
          },
          update: {
            status: 'CONNECTED',
            connectedAt: input.at,
            disconnectedAt: null,
            lastErrorAt: null,
            lastErrorCode: null,
          },
          select: integrationSelect,
        });

        await tx.integrationCredential.upsert({
          where: { integrationId: integration.id },
          create: {
            integrationId: integration.id,
            encryptedAccessToken: input.encryptedAccessToken,
            encryptedRefreshToken: input.encryptedRefreshToken,
            accessExpiresAt: input.accessExpiresAt,
            tokenType: input.tokenType,
          },
          update: {
            encryptedAccessToken: input.encryptedAccessToken,
            encryptedRefreshToken: input.encryptedRefreshToken,
            accessExpiresAt: input.accessExpiresAt,
            tokenType: input.tokenType,
          },
        });

        return mapIntegration(integration);
      });
    },

    async disconnect(tenantId, at) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.integration.findUnique({
          where: { tenantId_provider: { tenantId, provider: CONTA_AZUL_PROVIDER } },
          select: integrationSelect,
        });

        if (!existing) {
          const created = await tx.integration.create({
            data: {
              tenantId,
              provider: CONTA_AZUL_PROVIDER,
              status: 'DISCONNECTED',
              disconnectedAt: at,
            },
            select: integrationSelect,
          });
          return mapIntegration(created);
        }

        await tx.integrationCredential.deleteMany({ where: { integrationId: existing.id } });
        const updated = await tx.integration.update({
          where: { id: existing.id },
          data: {
            status: 'DISCONNECTED',
            disconnectedAt: at,
            lastErrorAt: null,
            lastErrorCode: null,
          },
          select: integrationSelect,
        });
        return mapIntegration(updated);
      });
    },

    async markError(tenantId, code, at) {
      await prisma.integration.updateMany({
        where: { tenantId, provider: CONTA_AZUL_PROVIDER },
        data: {
          status: 'ERROR',
          lastErrorAt: at,
          lastErrorCode: code,
        },
      });
    },

    async refreshTokensInLock(tenantId, work) {
      return prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM integrations WHERE tenant_id = ${tenantId}::uuid AND provider = 'CONTA_AZUL' FOR UPDATE`,
          );

          const row = await tx.integration.findUnique({
            where: { tenantId_provider: { tenantId, provider: CONTA_AZUL_PROVIDER } },
            select: {
              ...integrationSelect,
              credential: { select: credentialSelect },
            },
          });
          if (!row) {
            return null;
          }

          const locked: IntegrationWithCredential = {
            integration: mapIntegration(row),
            credential: row.credential ? mapCredential(row.credential) : null,
          };

          const next = await work(locked);
          if (!next || !row.credential) {
            return row.credential ? mapCredential(row.credential) : null;
          }

          const updated = await tx.integrationCredential.update({
            where: { id: row.credential.id },
            data: {
              encryptedAccessToken: next.encryptedAccessToken,
              encryptedRefreshToken: next.encryptedRefreshToken,
              accessExpiresAt: next.accessExpiresAt,
              tokenType: next.tokenType,
            },
            select: credentialSelect,
          });

          await tx.integration.update({
            where: { id: row.id },
            data: {
              status: 'CONNECTED',
              lastErrorAt: null,
              lastErrorCode: null,
            },
          });

          return mapCredential(updated);
        },
        { timeout: 20_000 },
      );
    },
  };
}
