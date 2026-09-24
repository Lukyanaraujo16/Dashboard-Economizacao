import type { AiProviderId, AiRunErrorCode } from '../../modules/advisor/domain/types.js';
import { assertMatchingProvider } from './adapter-guards.js';
import { iaProviderError } from './map-http-error.js';
import type { GenerationInput, GenerationOutput, GenerationUsage, IaProvider } from './types.js';

export type FakeIaProviderBehavior = 'success' | 'timeout' | 'error';

export type FakeIaProviderOptions = {
  readonly id?: AiProviderId;
  readonly behavior?: FakeIaProviderBehavior;
  readonly text?: string;
  readonly errorCode?: AiRunErrorCode;
  readonly usage?: GenerationUsage;
};

export type FakeIaProvider = IaProvider & {
  lastInput: GenerationInput | null;
};

const DEFAULT_FAKE_TEXT = 'Resposta simulada do Consultor.';

export function createFakeIaProvider(options: FakeIaProviderOptions = {}): FakeIaProvider {
  const id = options.id ?? 'OPENAI';
  const behavior = options.behavior ?? 'success';
  const provider: FakeIaProvider = {
    id,
    lastInput: null,
    async generate(input: GenerationInput): Promise<GenerationOutput> {
      provider.lastInput = input;
      assertMatchingProvider(id, input);
      if (behavior === 'timeout') {
        throw iaProviderError('TIMEOUT');
      }
      if (behavior === 'error') {
        throw iaProviderError(options.errorCode ?? 'PROVIDER_ERROR');
      }
      return {
        text: options.text ?? DEFAULT_FAKE_TEXT,
        usage: options.usage ?? { inputTokens: null, outputTokens: null },
      };
    },
  };
  return provider;
}
