import { AdvisorDomainError } from './advisor-domain-error.js';
import { AI_EMOJI_PREFERENCES, type AiEmojiPreference } from './types.js';

export const DEFAULT_EMOJI_PREFERENCE: AiEmojiPreference = 'MODERATE';

export const AI_EMOJI_PREFERENCE_LABELS: Record<AiEmojiPreference, string> = {
  NONE: 'Não usar emojis',
  MODERATE: 'Usar com moderação',
  FREE: 'Usar livremente',
};

/**
 * Instruções de apresentação controladas pelo backend.
 * Não alteram fatos, isolamento, rate limit nem PLATFORM_INSTRUCTIONS.
 */
export const AI_EMOJI_PREFERENCE_INSTRUCTIONS: Record<AiEmojiPreference, string> = {
  NONE: 'Do not use emojis.',
  MODERATE: 'Use emojis sparingly and only when they improve readability.',
  FREE: 'Emojis may be used naturally when appropriate.',
};

export function isAiEmojiPreference(value: string): value is AiEmojiPreference {
  return (AI_EMOJI_PREFERENCES as readonly string[]).includes(value);
}

export function assertAiEmojiPreference(value: string): AiEmojiPreference {
  if (!isAiEmojiPreference(value)) {
    throw new AdvisorDomainError(
      'AI_EMOJI_PREFERENCE_INVALID',
      'Preferência de emojis do Consultor é inválida.',
    );
  }
  return value;
}

export function resolveEmojiInstruction(
  preference: AiEmojiPreference | null | undefined,
): string {
  const resolved =
    preference && isAiEmojiPreference(preference) ? preference : DEFAULT_EMOJI_PREFERENCE;
  return AI_EMOJI_PREFERENCE_INSTRUCTIONS[resolved];
}

export function toPublicEmojiPreferenceOptions(): ReadonlyArray<{
  readonly id: AiEmojiPreference;
  readonly label: string;
}> {
  return AI_EMOJI_PREFERENCES.map((id) => ({
    id,
    label: AI_EMOJI_PREFERENCE_LABELS[id],
  }));
}
