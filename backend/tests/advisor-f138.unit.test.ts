import { describe, expect, it } from 'vitest';

import {
  AI_EMOJI_PREFERENCE_INSTRUCTIONS,
  DEFAULT_EMOJI_PREFERENCE,
  assertAiEmojiPreference,
  consultantActivationBlockedReason,
  createAdminConsultantService,
  isAiEmojiPreference,
  resolveEmojiInstruction,
} from '../src/modules/advisor/index.js';
import { ConflictError } from '../src/shared/errors/application-error.js';

describe('F13.8.1 emojiPreference', () => {
  it('aceita NONE, MODERATE e FREE e default é MODERATE', () => {
    expect(DEFAULT_EMOJI_PREFERENCE).toBe('MODERATE');
    expect(isAiEmojiPreference('NONE')).toBe(true);
    expect(isAiEmojiPreference('MODERATE')).toBe(true);
    expect(isAiEmojiPreference('FREE')).toBe(true);
    expect(isAiEmojiPreference('true')).toBe(false);
    expect(assertAiEmojiPreference('FREE')).toBe('FREE');
    expect(() => assertAiEmojiPreference('LOTS')).toThrow(/inválida/);
  });

  it('resolve instruções autoritativas sem alterar fatos', () => {
    expect(resolveEmojiInstruction('NONE')).toBe(AI_EMOJI_PREFERENCE_INSTRUCTIONS.NONE);
    expect(resolveEmojiInstruction('MODERATE')).toBe(AI_EMOJI_PREFERENCE_INSTRUCTIONS.MODERATE);
    expect(resolveEmojiInstruction('FREE')).toBe(AI_EMOJI_PREFERENCE_INSTRUCTIONS.FREE);
    expect(resolveEmojiInstruction(undefined)).toBe(AI_EMOJI_PREFERENCE_INSTRUCTIONS.MODERATE);
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.NONE).toContain('Do not use emojis');
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.MODERATE).toContain('sparingly');
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.FREE).toContain('naturally');
  });
});

describe('F13.8.1 ativação com credencial', () => {
  it('não bloqueia DISABLED nem NODE_ENV=test', () => {
    expect(
      consultantActivationBlockedReason({
        status: 'DISABLED',
        provider: 'OPENAI',
        credentialAvailable: false,
        nodeEnv: 'development',
      }),
    ).toBeNull();
    expect(
      consultantActivationBlockedReason({
        status: 'ACTIVE',
        provider: 'OPENAI',
        credentialAvailable: false,
        nodeEnv: 'test',
      }),
    ).toBeNull();
  });

  it('bloqueia ACTIVE sem credencial fora de test', () => {
    expect(
      consultantActivationBlockedReason({
        status: 'ACTIVE',
        provider: 'OPENAI',
        credentialAvailable: false,
        nodeEnv: 'development',
      }),
    ).toBe('Configure uma credencial da OpenAI antes de ativar este Consultor.');
    expect(
      consultantActivationBlockedReason({
        status: 'ACTIVE',
        provider: 'ANTHROPIC',
        credentialAvailable: false,
        nodeEnv: 'production',
      }),
    ).toBe('Configure uma credencial da Anthropic antes de ativar este Consultor.');
    expect(
      consultantActivationBlockedReason({
        status: 'ACTIVE',
        provider: 'OPENAI',
        credentialAvailable: true,
        nodeEnv: 'development',
      }),
    ).toBeNull();
  });

  it('admin upsert recusa ACTIVE sem credencial em development', async () => {
    const tenantId = '8b7e9b53-3435-476a-be47-56908ca846c5';
    const service = createAdminConsultantService({
      nodeEnv: 'development',
      resolveProviderApiKey: async () => null,
      tenants: {
        async findById(id) {
          return id === tenantId ? ({ id } as never) : null;
        },
      } as never,
      settings: {
        async findSettingsByTenant() {
          return null;
        },
        async upsertSettings() {
          throw new Error('não deveria persistir ACTIVE sem credencial');
        },
      },
      knowledge: {
        async listKnowledge() {
          return [];
        },
      } as never,
    });

    await expect(
      service.upsertSettings(tenantId, {
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        status: 'ACTIVE',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
