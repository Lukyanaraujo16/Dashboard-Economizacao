import { describe, expect, it } from 'vitest';

import {
  loadEnvironment,
  parseAiDefaultProvider,
  parseOptionalSecret,
} from '../src/config/env.js';

const AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const ENCRYPTION_KEY = 'a'.repeat(64);

function testSource(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    AUTH_SECRET,
    REDIS_URL: 'redis://127.0.0.1:6379',
    TEST_STORAGE_PATH: '/tmp/dashboard-economizacao_test',
    INTEGRATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ...overrides,
  };
}

describe('env de IA da plataforma (F13.1)', () => {
  it('aceita chaves ausentes sem impedir o boot', () => {
    const env = loadEnvironment(testSource());
    expect(env.openaiApiKey).toBeNull();
    expect(env.anthropicApiKey).toBeNull();
    expect(env.aiDefaultProvider).toBeNull();
  });

  it('lê OPENAI_API_KEY e ANTHROPIC_API_KEY sem exigir ambas', () => {
    const onlyOpenAi = loadEnvironment(testSource({ OPENAI_API_KEY: ' sk-test-openai ' }));
    expect(onlyOpenAi.openaiApiKey).toBe('sk-test-openai');
    expect(onlyOpenAi.anthropicApiKey).toBeNull();

    const onlyAnthropic = loadEnvironment(testSource({ ANTHROPIC_API_KEY: 'sk-ant-test' }));
    expect(onlyAnthropic.openaiApiKey).toBeNull();
    expect(onlyAnthropic.anthropicApiKey).toBe('sk-ant-test');
  });

  it('AI_PROVIDER é só default de criação e rejeita valor inválido', () => {
    expect(parseAiDefaultProvider(undefined)).toBeNull();
    expect(parseAiDefaultProvider('openai')).toBe('OPENAI');
    expect(parseAiDefaultProvider('ANTHROPIC')).toBe('ANTHROPIC');
    expect(() => parseAiDefaultProvider('CLAUDE_CODE')).toThrow(/OPENAI ou ANTHROPIC/);
    expect(loadEnvironment(testSource({ AI_PROVIDER: 'ANTHROPIC' })).aiDefaultProvider).toBe(
      'ANTHROPIC',
    );
  });

  it('não trata string vazia como secret', () => {
    expect(parseOptionalSecret('')).toBeNull();
    expect(parseOptionalSecret('   ')).toBeNull();
    expect(parseOptionalSecret('secret')).toBe('secret');
  });
});
