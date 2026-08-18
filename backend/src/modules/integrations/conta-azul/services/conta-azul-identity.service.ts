import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';
import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  ContaAzulIdentityMappingError,
  mapContaAzulConnectedCompany,
} from '../domain/conta-azul-identity.js';
import { toPublicContaAzulIntegration, type PublicContaAzulIntegration } from '../domain/types.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';

export type ContaAzulIdentifyMode = 'callback' | 'verify';

export type ContaAzulIdentityService = {
  identify(tenantId: string, mode: ContaAzulIdentifyMode): Promise<PublicContaAzulIntegration>;
};

function transientMessage(error: unknown): string {
  if (error instanceof ContaAzulApiError) {
    if (error.kind === 'rate_limited') {
      return 'A Conta Azul limitou temporariamente as solicitações. Tente novamente em instantes.';
    }
    if (error.kind === 'timeout') {
      return 'A Conta Azul não respondeu a tempo.';
    }
  }
  return 'A Conta Azul está temporariamente indisponível.';
}

export function createContaAzulIdentityService(deps: {
  readonly integrations: ContaAzulIntegrationRepository;
  readonly apiClient: ContaAzulApiClient;
  readonly getValidAccessToken: (tenantId: string) => Promise<string>;
  readonly clock?: () => Date;
}): ContaAzulIdentityService {
  const now = deps.clock ?? (() => new Date());

  return {
    async identify(tenantId, mode) {
      const loaded = await deps.integrations.findByTenantId(tenantId);
      if (!loaded) {
        if (mode === 'verify') {
          throw new IntegrationUnavailableError('Esta empresa não está conectada à Conta Azul.');
        }
        return toPublicContaAzulIntegration(null);
      }
      if (loaded.integration.status === 'DISCONNECTED' || !loaded.credential) {
        if (mode === 'verify') {
          throw new IntegrationUnavailableError('Esta empresa não está conectada à Conta Azul.');
        }
        return toPublicContaAzulIntegration(loaded.integration);
      }

      let accessToken: string;
      try {
        accessToken = await deps.getValidAccessToken(tenantId);
      } catch (error) {
        if (mode === 'verify') {
          throw error;
        }
        const current = await deps.integrations.findPublicByTenantId(tenantId);
        return toPublicContaAzulIntegration(current);
      }

      try {
        const payload = await deps.apiClient.getConnectedCompany(accessToken);
        const mapped = mapContaAzulConnectedCompany(payload);
        const conflict = await deps.integrations.findConnectedConflict({
          externalAccountId: mapped.externalAccountId,
          excludeIntegrationId: loaded.integration.id,
        });

        await deps.integrations.upsertExternalAccount({
          integrationId: loaded.integration.id,
          externalAccountId: mapped.externalAccountId,
          externalCompanyName: mapped.externalCompanyName,
          metadata: mapped.metadata,
        });

        if (conflict) {
          await deps.integrations.markError(tenantId, 'external_account_conflict', now());
        } else {
          await deps.integrations.markHealthy(tenantId);
        }
      } catch (error) {
        if (error instanceof ContaAzulIdentityMappingError) {
          await deps.integrations.markError(tenantId, 'identity_incomplete', now());
        } else if (error instanceof ContaAzulApiError && error.kind === 'unauthorized') {
          await deps.integrations.markError(tenantId, 'identity_unauthorized', now());
        } else if (mode === 'verify') {
          throw new IntegrationUnavailableError(transientMessage(error), { cause: error });
        }
      }

      const current = await deps.integrations.findPublicByTenantId(tenantId);
      return toPublicContaAzulIntegration(current);
    },
  };
}
