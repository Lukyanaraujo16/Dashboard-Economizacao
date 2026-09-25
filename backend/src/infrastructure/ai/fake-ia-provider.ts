import type { AiProviderId, AiRunErrorCode } from '../../modules/advisor/domain/types.js';
import { assertMatchingProvider } from './adapter-guards.js';
import { iaProviderError } from './map-http-error.js';
import type {
  GenerationInput,
  GenerationOutput,
  GenerationUsage,
  IaProvider,
  IaToolCall,
} from './types.js';

export type FakeIaProviderBehavior = 'success' | 'timeout' | 'error';

export type FakeIaProviderStep = {
  readonly text?: string;
  readonly toolCalls?: readonly IaToolCall[];
  readonly errorCode?: AiRunErrorCode;
};

export type FakeIaProviderOptions = {
  readonly id?: AiProviderId;
  readonly behavior?: FakeIaProviderBehavior;
  readonly text?: string;
  readonly errorCode?: AiRunErrorCode;
  readonly usage?: GenerationUsage;
  readonly script?: readonly FakeIaProviderStep[];
};

export type FakeIaProvider = IaProvider & {
  lastInput: GenerationInput | null;
  generateCalls: GenerationInput[];
};

const DEFAULT_FAKE_TEXT = 'Resposta simulada do Consultor.';

export function createFakeIaProvider(options: FakeIaProviderOptions = {}): FakeIaProvider {
  const id = options.id ?? 'OPENAI';
  const behavior = options.behavior ?? 'success';
  let scriptIndex = 0;
  const provider: FakeIaProvider = {
    id,
    lastInput: null,
    generateCalls: [],
    async generate(input: GenerationInput): Promise<GenerationOutput> {
      provider.lastInput = input;
      provider.generateCalls.push(input);
      assertMatchingProvider(id, input);
      if (behavior === 'timeout') {
        throw iaProviderError('TIMEOUT');
      }
      if (behavior === 'error') {
        throw iaProviderError(options.errorCode ?? 'PROVIDER_ERROR');
      }
      const step = options.script?.[scriptIndex];
      if (options.script !== undefined) {
        scriptIndex += 1;
      }
      if (step?.errorCode !== undefined) {
        throw iaProviderError(step.errorCode);
      }
      const toolCalls = step?.toolCalls;
      return {
        text: step?.text ?? options.text ?? DEFAULT_FAKE_TEXT,
        usage: options.usage ?? { inputTokens: null, outputTokens: null },
        ...(toolCalls !== undefined && toolCalls.length > 0 ? { toolCalls } : {}),
      };
    },
  };
  return provider;
}
