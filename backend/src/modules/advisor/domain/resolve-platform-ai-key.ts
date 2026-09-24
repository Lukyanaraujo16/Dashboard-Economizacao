import { decryptSecret } from '../../../infrastructure/crypto/secret-box.js';
import type { AiProviderId } from './types.js';

export type ResolvePlatformAiApiKeyInput = {
  readonly provider: AiProviderId;
  readonly platformCiphertext: string | null;
  readonly encryptionKey: Buffer | null;
  readonly envOpenAi: string | null;
  readonly envAnthropic: string | null;
};

/**
 * Precedência F13.7:
 * 1. credencial administrada (ciphertext da plataforma);
 * 2. fallback temporário para a env do mesmo provider.
 *
 * Sem fallback entre providers.
 */
export function resolvePlatformAiApiKey(input: ResolvePlatformAiApiKeyInput): string | null {
  if (input.platformCiphertext && input.encryptionKey) {
    try {
      const decrypted = decryptSecret(input.platformCiphertext, input.encryptionKey).trim();
      if (decrypted.length > 0) {
        return decrypted;
      }
    } catch {
      // Ciphertext inválido: cai no fallback de env do mesmo provider.
    }
  }

  const envKey = input.provider === 'OPENAI' ? input.envOpenAi : input.envAnthropic;
  const trimmed = envKey?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

export function isPlatformAiProviderConfigured(input: ResolvePlatformAiApiKeyInput): boolean {
  return resolvePlatformAiApiKey(input) !== null;
}
