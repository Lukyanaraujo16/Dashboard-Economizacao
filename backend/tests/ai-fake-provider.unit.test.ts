import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider, IaProviderError } from '../src/infrastructure/ai/index.js';
import type { GenerationInput } from '../src/infrastructure/ai/index.js';

const input: GenerationInput = {
  tenantId: 'tenant-1',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  blocks: [
    { type: 'PLATFORM_INSTRUCTIONS', content: 'Regra.', trustLevel: 'PLATFORM' },
    { type: 'USER_QUESTION', content: 'Pergunta.', trustLevel: 'UNTRUSTED' },
  ],
};

describe('fake IaProvider (F13.3)', () => {
  it('captura o input e retorna texto determinístico sem fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = createFakeIaProvider();
    expect(provider.id).toBe('OPENAI');
    expect(provider.lastInput).toBeNull();

    await expect(provider.generate(input)).resolves.toEqual({
      text: 'Resposta simulada do Consultor.',
      usage: { inputTokens: null, outputTokens: null },
    });
    expect(provider.lastInput).toEqual(input);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('simula timeout e erro tipados', async () => {
    const timeout = createFakeIaProvider({ behavior: 'timeout' });
    await expect(timeout.generate(input)).rejects.toBeInstanceOf(IaProviderError);
    await expect(timeout.generate(input)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(timeout.lastInput).toEqual(input);

    const error = createFakeIaProvider({
      id: 'ANTHROPIC',
      behavior: 'error',
      errorCode: 'RATE_LIMIT',
    });
    await expect(
      error.generate({ ...input, provider: 'ANTHROPIC', model: 'claude-sonnet-5' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    expect(error.lastInput?.provider).toBe('ANTHROPIC');
  });

  it('rejeita vendor divergente com BAD_REQUEST', async () => {
    const provider = createFakeIaProvider({ id: 'OPENAI' });
    await expect(provider.generate({ ...input, provider: 'ANTHROPIC' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(provider.lastInput?.provider).toBe('ANTHROPIC');
  });

  it('aceita texto e usage injetados no sucesso', async () => {
    const provider = createFakeIaProvider({
      text: 'eco',
      usage: { inputTokens: 3, outputTokens: 7 },
    });
    await expect(provider.generate(input)).resolves.toEqual({
      text: 'eco',
      usage: { inputTokens: 3, outputTokens: 7 },
    });
  });

  it('executa script de tool calling sem rede', async () => {
    const provider = createFakeIaProvider({
      script: [
        {
          toolCalls: [
            {
              id: '1',
              name: 'compare_cash_months',
              arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
            },
          ],
        },
        { text: 'Diferença oficial pré-calculada.' },
      ],
    });
    const first = await provider.generate({
      ...input,
      tools: [{ name: 'compare_cash_months', description: 'cmp', inputSchema: {} }],
    });
    expect(first.toolCalls?.[0]?.name).toBe('compare_cash_months');
    const second = await provider.generate({
      ...input,
      toolRounds: [
        {
          calls: first.toolCalls ?? [],
          results: [
            {
              id: '1',
              name: 'compare_cash_months',
              ok: true,
              content: '{"difference":{"billing":"88130.31"}}',
            },
          ],
        },
      ],
    });
    expect(second).toEqual({
      text: 'Diferença oficial pré-calculada.',
      usage: { inputTokens: null, outputTokens: null },
    });
    expect(provider.generateCalls).toHaveLength(2);
  });
});
