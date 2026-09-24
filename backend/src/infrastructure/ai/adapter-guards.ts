import type { AiProviderId } from '../../modules/advisor/domain/types.js';
import { iaProviderError } from './map-http-error.js';
import type { GenerationInput } from './types.js';

export async function resolveConfiguredApiKey(config: {
  readonly apiKey?: string | null;
  readonly resolveApiKey?: () => Promise<string | null>;
}): Promise<string> {
  const resolved = config.resolveApiKey ? await config.resolveApiKey() : (config.apiKey ?? null);
  return requireApiKey(resolved);
}

export function requireApiKey(apiKey: string | null | undefined): string {
  const key = apiKey?.trim() ?? '';
  if (!key) {
    throw iaProviderError('AUTH', 'A chave do provedor de IA não está configurada.');
  }
  return key;
}

export function assertMatchingProvider(adapterId: AiProviderId, input: GenerationInput): void {
  if (input.provider !== adapterId) {
    throw iaProviderError(
      'BAD_REQUEST',
      'O adapter de IA não executa o vendor informado na entrada.',
    );
  }
}

export function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
