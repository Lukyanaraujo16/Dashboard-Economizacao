import { encryptSecret } from '../../../infrastructure/crypto/secret-box.js';
import { AI_PROVIDER_IDS, type AiProviderId } from '../domain/types.js';
import { resolvePlatformAiApiKey } from '../domain/resolve-platform-ai-key.js';
import type { AdvisorPlatformCredentialRepository } from '../repositories/advisor-platform-credential.repository.js';
import type { PublicConsultantProviderStatus } from '../http/public-dtos.js';

export type AdminConsultantProvidersService = {
  listProviders(): Promise<readonly PublicConsultantProviderStatus[]>;
  upsertCredential(provider: AiProviderId, credential: string): Promise<PublicConsultantProviderStatus>;
  deleteCredential(provider: AiProviderId): Promise<PublicConsultantProviderStatus>;
};

export function createAdminConsultantProvidersService(deps: {
  readonly credentials: AdvisorPlatformCredentialRepository;
  readonly encryptionKey: Buffer;
  readonly envOpenAi: string | null;
  readonly envAnthropic: string | null;
}): AdminConsultantProvidersService {
  async function toStatus(provider: AiProviderId): Promise<PublicConsultantProviderStatus> {
    const stored = await deps.credentials.findByProvider(provider);
    const configured = resolvePlatformAiApiKey({
      provider,
      platformCiphertext: stored?.encryptedSecret ?? null,
      encryptionKey: deps.encryptionKey,
      envOpenAi: deps.envOpenAi,
      envAnthropic: deps.envAnthropic,
    }) !== null;

    return { provider, configured };
  }

  return {
    async listProviders() {
      return Promise.all(AI_PROVIDER_IDS.map((provider) => toStatus(provider)));
    },

    async upsertCredential(provider, credential) {
      const encryptedSecret = encryptSecret(credential, deps.encryptionKey);
      await deps.credentials.upsert(provider, encryptedSecret);
      return toStatus(provider);
    },

    async deleteCredential(provider) {
      await deps.credentials.deleteByProvider(provider);
      return toStatus(provider);
    },
  };
}
