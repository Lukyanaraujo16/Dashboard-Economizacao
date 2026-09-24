import { describe, expect, it, vi } from 'vitest';

import {
  createFakeIaProvider,
  createIaProviderRegistry,
  IaProviderError,
} from '../src/infrastructure/ai/index.js';
import type { GenerationInput, IaProvider } from '../src/infrastructure/ai/index.js';

const openAiInput: GenerationInput = {
  tenantId: 'tenant-1',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  blocks: [{ type: 'USER_QUESTION', content: 'Oi', trustLevel: 'UNTRUSTED' }],
};

describe('registry IaProvider (F13.3)', () => {
  it('resolve o provider pedido sem fallback cruzado', async () => {
    const openai = createFakeIaProvider({ id: 'OPENAI', text: 'openai-ok' });
    const anthropic = createFakeIaProvider({ id: 'ANTHROPIC', text: 'anthropic-ok' });
    const registry = createIaProviderRegistry({ openai, anthropic });

    expect(registry.resolve('OPENAI')).toBe(openai);
    expect(registry.resolve('ANTHROPIC')).toBe(anthropic);
    expect(registry.resolve('OPENAI').id).toBe('OPENAI');
    expect(registry.resolve('ANTHROPIC').id).toBe('ANTHROPIC');

    await expect(registry.resolve('ANTHROPIC').generate({
      ...openAiInput,
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5',
    })).resolves.toMatchObject({ text: 'anthropic-ok' });
    expect(openai.lastInput).toBeNull();
  });

  it('não chama Anthropic quando o caminho OpenAI falha', async () => {
    const openaiGenerate = vi.fn().mockRejectedValue(
      new IaProviderError('PROVIDER_ERROR', 'falha openai'),
    );
    const anthropicGenerate = vi.fn();
    const openai: IaProvider = { id: 'OPENAI', generate: openaiGenerate };
    const anthropic: IaProvider = { id: 'ANTHROPIC', generate: anthropicGenerate };
    const registry = createIaProviderRegistry({ openai, anthropic });

    await expect(registry.resolve('OPENAI').generate(openAiInput)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    expect(openaiGenerate).toHaveBeenCalledTimes(1);
    expect(anthropicGenerate).not.toHaveBeenCalled();
    expect(registry.resolve('ANTHROPIC')).toBe(anthropic);
  });
});
