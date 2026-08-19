import type { ContaAzulEnvironment } from '../../../../config/env.js';
import { decryptSecret, encryptSecret } from '../../../../infrastructure/crypto/secret-box.js';
import {
  ForbiddenError,
  IntegrationUnavailableError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/errors/application-error.js';
import type { AuthenticatedRequestContext } from '../../../auth/domain/authentication-context.js';
import type { TenantRecord } from '../../../tenant/domain/types.js';
import type { TenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import {
  buildContaAzulAuthorizationUrl,
  CONTA_AZUL_ACCESS_TOKEN_REFRESH_SKEW_MS,
  isAccessTokenFresh,
  type ContaAzulCallbackSignal,
} from '../domain/conta-azul-oauth.js';
import { toPublicContaAzulIntegration, type PublicContaAzulIntegration } from '../domain/types.js';
import type { ContaAzulTokenClient } from '../connector/conta-azul-token-client.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import type { ContaAzulOAuthStateStore } from './oauth-state.store.js';

export type ContaAzulOAuthService = {
  getStatus(tenantId: string): Promise<PublicContaAzulIntegration>;
  startConnect(
    tenantId: string,
    auth: AuthenticatedRequestContext,
  ): Promise<{ readonly authorizationUrl: string }>;
  disconnect(tenantId: string): Promise<PublicContaAzulIntegration>;
  handleCallback(input: {
    readonly code: string | null;
    readonly state: string | null;
    readonly oauthError: string | null;
    readonly auth: AuthenticatedRequestContext | null;
  }): Promise<{ readonly tenantId: string | null; readonly signal: ContaAzulCallbackSignal }>;
  getValidAccessToken(tenantId: string): Promise<string>;
  forceRefresh(tenantId: string): Promise<string>;
};

async function requireActiveTenant(
  tenants: TenantRepository,
  tenantId: string,
): Promise<TenantRecord> {
  const tenant = await tenants.findById(tenantId);
  if (!tenant) {
    throw new NotFoundError('Empresa não encontrada.');
  }
  if (tenant.status !== 'ACTIVE') {
    throw new ValidationError('Empresa inativa não pode conectar a Conta Azul.');
  }
  return tenant;
}

function requireEncryptionKey(key: Buffer | null): Buffer {
  if (!key) {
    throw new IntegrationUnavailableError(
      'Cifração de integrações não configurada neste ambiente.',
    );
  }
  return key;
}

export function createContaAzulOAuthService(deps: {
  readonly tenants: TenantRepository;
  readonly integrations: ContaAzulIntegrationRepository;
  readonly stateStore: ContaAzulOAuthStateStore;
  readonly tokenClient: ContaAzulTokenClient;
  readonly contaAzul: ContaAzulEnvironment;
  readonly encryptionKey: Buffer | null;
  readonly identifyConnectedAccount?: (tenantId: string) => Promise<void>;
  readonly assertCanDisconnect?: (tenantId: string) => Promise<void>;
  readonly clock?: () => Date;
  readonly refreshSkewMs?: number;
  readonly autoSyncIntervalMinutes?: number;
}): ContaAzulOAuthService {
  const now = deps.clock ?? (() => new Date());
  const skewMs = deps.refreshSkewMs ?? CONTA_AZUL_ACCESS_TOKEN_REFRESH_SKEW_MS;
  const autoSyncIntervalMinutes = deps.autoSyncIntervalMinutes;

  async function refreshAccessToken(tenantId: string, force: boolean): Promise<string> {
    const key = requireEncryptionKey(deps.encryptionKey);
    if (!force) {
      const loaded = await deps.integrations.findByTenantId(tenantId);
      if (!loaded || loaded.integration.status === 'DISCONNECTED' || !loaded.credential) {
        throw new IntegrationUnavailableError('Esta empresa não está conectada à Conta Azul.');
      }
      if (isAccessTokenFresh(loaded.credential.accessExpiresAt, now(), skewMs)) {
        return decryptSecret(loaded.credential.encryptedAccessToken, key);
      }
    }

    let refreshed;
    try {
      refreshed = await deps.integrations.refreshTokensInLock(tenantId, async (locked) => {
        if (!locked.credential || locked.integration.status === 'DISCONNECTED') {
          return null;
        }
        if (!force && isAccessTokenFresh(locked.credential.accessExpiresAt, now(), skewMs)) {
          return null;
        }

        const refreshToken = decryptSecret(locked.credential.encryptedRefreshToken, key);
        const tokens = await deps.tokenClient.refresh(refreshToken);
        const at = now();
        return {
          encryptedAccessToken: encryptSecret(tokens.accessToken, key),
          encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
          accessExpiresAt: new Date(at.getTime() + tokens.expiresIn * 1000),
          tokenType: tokens.tokenType,
        };
      });
    } catch {
      await deps.integrations.markError(tenantId, 'refresh_failed', now());
      throw new IntegrationUnavailableError(
        'Não foi possível renovar a autorização da Conta Azul. Reconecte a empresa.',
      );
    }

    if (!refreshed) {
      throw new IntegrationUnavailableError('Esta empresa não está conectada à Conta Azul.');
    }

    return decryptSecret(refreshed.encryptedAccessToken, key);
  }

  return {
    async getStatus(tenantId) {
      const tenant = await deps.tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      const record = await deps.integrations.findPublicByTenantId(tenantId);
      return toPublicContaAzulIntegration(record, autoSyncIntervalMinutes);
    },

    async startConnect(tenantId, auth) {
      if (auth.support.active) {
        throw new ForbiddenError('Saia do modo suporte para gerenciar integrações.');
      }
      requireEncryptionKey(deps.encryptionKey);
      await requireActiveTenant(deps.tenants, tenantId);

      const state = await deps.stateStore.create({
        tenantId,
        actorUserId: auth.userId,
        sessionId: auth.sessionId,
        createdAt: now().toISOString(),
      });

      return {
        authorizationUrl: buildContaAzulAuthorizationUrl({
          clientId: deps.contaAzul.clientId,
          redirectUri: deps.contaAzul.redirectUri,
          state,
        }),
      };
    },

    async disconnect(tenantId) {
      const tenant = await deps.tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      await deps.assertCanDisconnect?.(tenantId);
      const record = await deps.integrations.disconnect(tenantId, now());
      return toPublicContaAzulIntegration(record, autoSyncIntervalMinutes);
    },

    async handleCallback(input) {
      if (!input.state) {
        return { tenantId: null, signal: 'invalid' };
      }

      const stored = await deps.stateStore.consume(input.state);
      if (!stored) {
        return { tenantId: null, signal: 'replay' };
      }

      if (!input.auth) {
        return { tenantId: stored.tenantId, signal: 'expired' };
      }
      if (input.auth.support.active) {
        return { tenantId: stored.tenantId, signal: 'error' };
      }
      if (input.auth.userId !== stored.actorUserId || input.auth.sessionId !== stored.sessionId) {
        return { tenantId: stored.tenantId, signal: 'expired' };
      }
      if (input.auth.role !== 'ADMIN' && input.auth.role !== 'SUPER_ADMIN') {
        return { tenantId: stored.tenantId, signal: 'expired' };
      }

      if (input.oauthError === 'access_denied') {
        return { tenantId: stored.tenantId, signal: 'denied' };
      }
      if (input.oauthError || !input.code) {
        return { tenantId: stored.tenantId, signal: 'error' };
      }

      const tenant = await deps.tenants.findById(stored.tenantId);
      if (!tenant || tenant.status !== 'ACTIVE') {
        return { tenantId: stored.tenantId, signal: 'error' };
      }

      try {
        const key = requireEncryptionKey(deps.encryptionKey);
        const tokens = await deps.tokenClient.exchangeAuthorizationCode(
          input.code,
          deps.contaAzul.redirectUri,
        );
        const at = now();
        await deps.integrations.persistConnectedTokens({
          tenantId: stored.tenantId,
          encryptedAccessToken: encryptSecret(tokens.accessToken, key),
          encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
          accessExpiresAt: new Date(at.getTime() + tokens.expiresIn * 1000),
          tokenType: tokens.tokenType,
          at,
        });
        if (deps.identifyConnectedAccount) {
          try {
            await deps.identifyConnectedAccount(stored.tenantId);
          } catch {
            // Falha transitória de identidade não reverte o OAuth nem apaga tokens.
          }
        }
        return { tenantId: stored.tenantId, signal: 'connected' };
      } catch {
        return { tenantId: stored.tenantId, signal: 'error' };
      }
    },

    async getValidAccessToken(tenantId) {
      return refreshAccessToken(tenantId, false);
    },

    async forceRefresh(tenantId) {
      return refreshAccessToken(tenantId, true);
    },
  };
}
