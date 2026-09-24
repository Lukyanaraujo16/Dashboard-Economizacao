import type { AiProviderId } from '../../modules/advisor/domain/types.js';
import { iaProviderError } from './map-http-error.js';
import type { IaProvider } from './types.js';

export type IaProviderRegistry = {
  resolve(id: AiProviderId): IaProvider;
};

/**
 * Resolve o adapter pelo id do tenant. Sem fallback cruzado e sem ler AI_PROVIDER.
 */
export function createIaProviderRegistry(providers: {
  readonly openai: IaProvider;
  readonly anthropic: IaProvider;
}): IaProviderRegistry {
  return {
    resolve(id: AiProviderId): IaProvider {
      if (id === 'OPENAI') {
        return providers.openai;
      }
      if (id === 'ANTHROPIC') {
        return providers.anthropic;
      }
      throw iaProviderError('BAD_REQUEST', 'Provider de IA não suportado.');
    },
  };
}
