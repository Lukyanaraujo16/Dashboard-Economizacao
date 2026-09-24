import { AdvisorDomainError } from './advisor-domain-error.js';
import { AI_PROVIDER_IDS, type AiProviderId } from './types.js';

/**
 * Allowlist mínima e reversível (F13.1).
 * Modelos dos vendors evoluem sem migration — esta lista é atualizada em código.
 * Defaults técnicos, não contrato de produto. F13.3 pode trocá-los antes da chamada real.
 */
export const AI_PROVIDER_MODEL_CATALOG = {
  OPENAI: {
    models: ['gpt-4o-mini'] as const,
    defaultModel: 'gpt-4o-mini',
  },
  ANTHROPIC: {
    models: ['claude-sonnet-4-5'] as const,
    defaultModel: 'claude-sonnet-4-5',
  },
} as const satisfies Record<
  AiProviderId,
  { readonly models: readonly string[]; readonly defaultModel: string }
>;

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function assertAiProviderId(value: string): asserts value is AiProviderId {
  if (!isAiProviderId(value)) {
    throw new AdvisorDomainError(
      'AI_PROVIDER_INVALID',
      'Provider de IA deve ser OPENAI ou ANTHROPIC.',
    );
  }
}

export function defaultModelForProvider(provider: AiProviderId): string {
  return AI_PROVIDER_MODEL_CATALOG[provider].defaultModel;
}

export function isAllowedAiModel(provider: AiProviderId, model: string): boolean {
  const normalized = model.trim();
  return (AI_PROVIDER_MODEL_CATALOG[provider].models as readonly string[]).includes(normalized);
}

export function assertAllowedAiModel(provider: AiProviderId, model: string): string {
  const normalized = model.trim();
  if (!normalized || !isAllowedAiModel(provider, normalized)) {
    throw new AdvisorDomainError(
      'AI_MODEL_NOT_ALLOWED',
      `Modelo "${model}" não é permitido para o provider ${provider}.`,
    );
  }
  return normalized;
}

export function resolveAiModel(provider: AiProviderId, model?: string): string {
  if (model === undefined) {
    return defaultModelForProvider(provider);
  }
  return assertAllowedAiModel(provider, model);
}
