import { describe, expect, it } from 'vitest';

import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import {
  DEFAULT_CONSULTANT_NAME,
  assertConsultantName,
  deriveConsultantConversationTitle,
  deriveManagedCredentialDisplayHint,
  resolveConsultantDisplayName,
  resolvePlatformAiApiKey,
  resolveProviderCredentialSource,
  resolveToneInstruction,
} from '../src/modules/advisor/index.js';
import { resolveConsultantAvailability } from '../src/modules/advisor/services/consultant.service.js';

const KEY = Buffer.from('0'.repeat(64), 'hex');

describe('F13.7 título determinístico', () => {
  it('gera título a partir da primeira pergunta sem provedor', () => {
    expect(deriveConsultantConversationTitle('Qual foi meu faturamento em agosto de 2026?')).toBe(
      'Faturamento em agosto de 2026',
    );
    expect(deriveConsultantConversationTitle('   ')).toBe('Nova conversa');
    expect(deriveConsultantConversationTitle('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('F13.7 consultantName', () => {
  it('usa Consultor quando vazio e valida conteúdo', () => {
    expect(resolveConsultantDisplayName(null)).toBe(DEFAULT_CONSULTANT_NAME);
    expect(resolveConsultantDisplayName('  Clara  ')).toBe('Clara');
    expect(assertConsultantName('Consultor Financeiro')).toBe('Consultor Financeiro');
    expect(() => assertConsultantName('<script>')).toThrow();
  });
});

describe('F13.7 tone presets', () => {
  it('usa instrução do backend e custom só em PERSONALIZADO', () => {
    expect(resolveToneInstruction('CONSULTIVO', 'ignorar frontend')).toContain('consultor financeiro');
    expect(resolveToneInstruction('PERSONALIZADO', 'Fale como um sócio.')).toBe('Fale como um sócio.');
    expect(resolveToneInstruction('PERSONALIZADO', '   ')).toContain('profissional');
  });
});

describe('F13.7.1A origem da credencial', () => {
  it('classifica MANAGED > ENV > NONE sem fallback cruzado', () => {
    expect(resolveProviderCredentialSource({ hasManaged: true, hasEnv: true })).toBe('MANAGED');
    expect(resolveProviderCredentialSource({ hasManaged: false, hasEnv: true })).toBe('ENV');
    expect(resolveProviderCredentialSource({ hasManaged: false, hasEnv: false })).toBe('NONE');
  });

  it('displayHint usa só prefixo de família e nunca o restante da chave', () => {
    const openai = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
    const anthropic = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789';
    const generic = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';
    expect(deriveManagedCredentialDisplayHint(openai)).toBe('sk-proj-••••••••');
    expect(deriveManagedCredentialDisplayHint(anthropic)).toBe('sk-ant-••••••••');
    expect(deriveManagedCredentialDisplayHint(generic)).toBe('sk-••••••••');
    expect(deriveManagedCredentialDisplayHint('plain-token-value')).toBe('••••••••');
    expect(deriveManagedCredentialDisplayHint(openai)).not.toContain('abcd');
    expect(deriveManagedCredentialDisplayHint(openai)).not.toContain('6789');
  });
});

describe('F13.7 credencial plataforma vs env', () => {
  it('prioriza ciphertext e não faz fallback cruzado', () => {
    const stored = encryptSecret('sk-platform-openai', KEY);
    expect(
      resolvePlatformAiApiKey({
        provider: 'OPENAI',
        platformCiphertext: stored,
        encryptionKey: KEY,
        envOpenAi: 'sk-env-openai',
        envAnthropic: 'sk-env-anthropic',
      }),
    ).toBe('sk-platform-openai');

    expect(
      resolvePlatformAiApiKey({
        provider: 'ANTHROPIC',
        platformCiphertext: null,
        encryptionKey: KEY,
        envOpenAi: 'sk-env-openai',
        envAnthropic: 'sk-env-anthropic',
      }),
    ).toBe('sk-env-anthropic');

    expect(
      resolvePlatformAiApiKey({
        provider: 'OPENAI',
        platformCiphertext: null,
        encryptionKey: KEY,
        envOpenAi: null,
        envAnthropic: 'sk-env-anthropic',
      }),
    ).toBeNull();
  });
});

describe('F13.7 availability com credencial', () => {
  it('ACTIVE só com key do provider configurado', () => {
    expect(
      resolveConsultantAvailability({
        settings: {
          tenantId: 't1',
          status: 'ACTIVE',
          provider: 'OPENAI',
          consultantName: 'Clara',
        },
        tenantId: 't1',
        nodeEnv: 'production',
        openaiApiKey: 'sk-ok',
        anthropicApiKey: null,
      }),
    ).toEqual({ status: 'ACTIVE', consultantName: 'Clara' });

    expect(
      resolveConsultantAvailability({
        settings: {
          tenantId: 't1',
          status: 'ACTIVE',
          provider: 'OPENAI',
          consultantName: 'Clara',
        },
        tenantId: 't1',
        nodeEnv: 'production',
        openaiApiKey: null,
        anthropicApiKey: 'sk-ant',
      }),
    ).toEqual({ status: 'UNAVAILABLE', consultantName: 'Clara' });
  });
});
