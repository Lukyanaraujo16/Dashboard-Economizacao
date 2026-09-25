import type { AiConsultantStatus, AiProviderId } from './types.js';

export function consultantActivationCredentialMessage(provider: AiProviderId): string {
  return provider === 'OPENAI'
    ? 'Configure uma credencial da OpenAI antes de ativar este Consultor.'
    : 'Configure uma credencial da Anthropic antes de ativar este Consultor.';
}

/**
 * Bloqueia ACTIVE sem credencial do provider, fora de NODE_ENV=test
 * (testes HTTP continuam usando Fake/availability de teste).
 */
export function consultantActivationBlockedReason(input: {
  readonly status: AiConsultantStatus;
  readonly provider: AiProviderId;
  readonly credentialAvailable: boolean;
  readonly nodeEnv: string;
}): string | null {
  if (input.status !== 'ACTIVE') {
    return null;
  }
  if (input.nodeEnv === 'test') {
    return null;
  }
  if (input.credentialAvailable) {
    return null;
  }
  return consultantActivationCredentialMessage(input.provider);
}
