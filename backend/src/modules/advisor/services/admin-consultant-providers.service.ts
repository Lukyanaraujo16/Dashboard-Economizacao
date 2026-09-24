import { encryptSecret } from '../../../infrastructure/crypto/secret-box.js';
import { AI_PROVIDER_IDS, type AiProviderId } from '../domain/types.js';
import { deriveManagedCredentialDisplayHint } from '../domain/credential-display-hint.js';
import { resolveProviderCredentialSource } from '../domain/credential-source.js';
import type { AdvisorPlatformCredentialRepository } from '../repositories/advisor-platform-credential.repository.js';
import type { PublicConsultantProviderStatus } from '../http/public-dtos.js';

export type AdminConsultantProvidersService = {
  listProviders(): Promise<readonly PublicConsultantProviderStatus[]>;
  upsertCredential(provider: AiProviderId, credential: string): Promise<PublicConsultantProviderStatus>;
  deleteCredential(provider: AiProviderId): Promise<PublicConsultantProviderStatus>;
};

function hasEnvSecret(value: string | null): boolean {
  return (value?.trim().length ?? 0) > 0;
}

export function createAdminConsultantProvidersService(deps: {
  readonly credentials: AdvisorPlatformCredentialRepository;
  readonly encryptionKey: Buffer | null;
  readonly envOpenAi: string | null;
  readonly envAnthropic: string | null;
}): AdminConsultantProvidersService {
  function envPresent(provider: AiProviderId): boolean {
    return hasEnvSecret(provider === 'OPENAI' ? deps.envOpenAi : deps.envAnthropic);
  }

  async function toStatus(provider: AiProviderId): Promise<PublicConsultantProviderStatus> {
    const stored = await deps.credentials.findByProvider(provider);
    const source = resolveProviderCredentialSource({
      hasManaged: stored !== null,
      hasEnv: envPresent(provider),
    });

    if (source === 'MANAGED' && stored) {
      return {
        provider,
        configured: true,
        source,
        displayHint: stored.displayHint,
        configuredAt: stored.updatedAt.toISOString(),
      };
    }

    if (source === 'ENV') {
      return {
        provider,
        configured: true,
        source,
        displayHint: null,
        configuredAt: null,
      };
    }

    return {
      provider,
      configured: false,
      source: 'NONE',
      displayHint: null,
      configuredAt: null,
    };
  }

  return {
    async listProviders() {
      return Promise.all(AI_PROVIDER_IDS.map((provider) => toStatus(provider)));
    },

    async upsertCredential(provider, credential) {
      if (deps.encryptionKey === null) {
        throw new Error('INTEGRATION_ENCRYPTION_KEY ausente.');
      }
      const displayHint = deriveManagedCredentialDisplayHint(credential);
      const encryptedSecret = encryptSecret(credential, deps.encryptionKey);
      await deps.credentials.upsert(provider, { encryptedSecret, displayHint });
      return toStatus(provider);
    },

    async deleteCredential(provider) {
      await deps.credentials.deleteByProvider(provider);
      return toStatus(provider);
    },
  };
}
