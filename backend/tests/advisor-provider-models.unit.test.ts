import { describe, expect, it } from 'vitest';

import {
  AdvisorDomainError,
  AI_PROVIDER_IDS,
  AI_PROVIDER_MODEL_CATALOG,
  assertAllowedAiModel,
  defaultModelForProvider,
  isAllowedAiModel,
  resolveAiModel,
} from '../src/modules/advisor/index.js';

describe('allowlist de provider/model do Consultor (F13.1)', () => {
  it('suporta OPENAI e ANTHROPIC com default reversível por provider', () => {
    expect([...AI_PROVIDER_IDS]).toEqual(['OPENAI', 'ANTHROPIC']);
    expect(defaultModelForProvider('OPENAI')).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);
    expect(defaultModelForProvider('ANTHROPIC')).toBe(
      AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel,
    );
    expect(typeof defaultModelForProvider('OPENAI')).toBe('string');
    expect(typeof defaultModelForProvider('ANTHROPIC')).toBe('string');
  });

  it('aceita combinação provider/model da allowlist e rejeita inválida', () => {
    expect(isAllowedAiModel('OPENAI', AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel)).toBe(true);
    expect(isAllowedAiModel('ANTHROPIC', AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel)).toBe(
      true,
    );
    expect(isAllowedAiModel('OPENAI', AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel)).toBe(false);
    expect(isAllowedAiModel('ANTHROPIC', 'modelo-inventado')).toBe(false);
    expect(() => assertAllowedAiModel('OPENAI', 'gpt-nao-existente')).toThrow(AdvisorDomainError);
    expect(() => assertAllowedAiModel('OPENAI', 'gpt-nao-existente')).toThrow(
      expect.objectContaining({ code: 'AI_MODEL_NOT_ALLOWED' }),
    );
  });

  it('resolve model omitido para o default do provider sem inventar catálogo cruzado', () => {
    expect(resolveAiModel('OPENAI')).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);
    expect(resolveAiModel('ANTHROPIC')).toBe(AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel);
  });
});
