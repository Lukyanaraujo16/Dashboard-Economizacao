import { describe, expect, it, vi } from 'vitest';

import { createAnthropicProvider, IaProviderError } from '../src/infrastructure/ai/index.js';
import type { GenerationInput } from '../src/infrastructure/ai/index.js';
import type { AdvisorContextBlock } from '../src/modules/advisor/domain/context-blocks.js';
import { listAdvisorAnalyticalTools } from '../src/modules/advisor/index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function anthropicSuccess(
  text = 'Resposta Anthropic',
  usage?: { input_tokens?: number; output_tokens?: number },
) {
  return jsonResponse({
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: usage ?? { input_tokens: 20, output_tokens: 6 },
  });
}

const blocks: AdvisorContextBlock[] = [
  { type: 'PLATFORM_INSTRUCTIONS', content: 'Você é o Consultor.', trustLevel: 'PLATFORM' },
  { type: 'TENANT_PROFILE', content: 'Comércio varejista.', trustLevel: 'TENANT_CONFIG' },
  { type: 'ADMIN_CONTEXT', content: 'Tom objetivo.', trustLevel: 'TENANT_CONFIG' },
  { type: 'FINANCIAL_FACTS', content: 'caixa: 50', trustLevel: 'ANALYTICAL_FACT' },
  {
    type: 'CONVERSATION_HISTORY',
    content: 'USER: qual o caixa?\nCONSULTANT: O caixa está em 50.',
    trustLevel: 'UNTRUSTED',
  },
  { type: 'USER_QUESTION', content: 'E a inadimplência?', trustLevel: 'UNTRUSTED' },
];

function sampleInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    tenantId: 'tenant-9',
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-5',
    blocks,
    ...overrides,
  };
}

function requestBody(fetchImpl: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body)) as Record<string, unknown>;
}

describe('adapter Anthropic Messages (F13.3)', () => {
  it('converte blocks, mapeia histórico USER/CONSULTANT e normaliza usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(anthropicSuccess());
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl });

    await expect(provider.generate(sampleInput())).resolves.toEqual({
      text: 'Resposta Anthropic',
      usage: { inputTokens: 20, outputTokens: 6 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://api.anthropic.com/v1/messages');
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();

    const body = requestBody(fetchImpl);
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(1024);
    expect(body.system).toBe(
      'Você é o Consultor.\n\n[TENANT_CONFIG TENANT_PROFILE]\nComércio varejista.',
    );
    expect(body.messages).toEqual([
      {
        role: 'user',
        content:
          '[TENANT_CONFIG ADMIN_CONTEXT]\nTom objetivo.\n\n[ANALYTICAL_FACT FINANCIAL_FACTS]\ncaixa: 50\n\nqual o caixa?',
      },
      { role: 'assistant', content: 'O caixa está em 50.' },
      { role: 'user', content: '[UNTRUSTED USER_QUESTION]\nE a inadimplência?' },
    ]);
    expect(JSON.stringify(body)).not.toContain('anthropic.messages');
  });

  it('envia histórico delimitado quando o parse simples falha', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(anthropicSuccess('ok'));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl });
    await provider.generate(
      sampleInput({
        blocks: [
          { type: 'PLATFORM_INSTRUCTIONS', content: 'Regra.', trustLevel: 'PLATFORM' },
          {
            type: 'CONVERSATION_HISTORY',
            content: 'histórico sem marcadores de papel',
            trustLevel: 'UNTRUSTED',
          },
          { type: 'USER_QUESTION', content: 'Segue?', trustLevel: 'UNTRUSTED' },
        ],
      }),
    );
    expect(requestBody(fetchImpl).messages).toEqual([
      {
        role: 'user',
        content:
          '[UNTRUSTED CONVERSATION_HISTORY]\nhistórico sem marcadores de papel\n\n[UNTRUSTED USER_QUESTION]\nSegue?',
      },
    ]);
  });

  it('usa null em usage quando ausente', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl });
    await expect(provider.generate(sampleInput())).resolves.toEqual({
      text: 'ok',
      usage: { inputTokens: null, outputTokens: null },
    });
  });

  it('recusa vendor errado sem chamar o fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl });
    await expect(provider.generate(sampleInput({ provider: 'OPENAI' }))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sem chave lança AUTH sem fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = createAnthropicProvider({ apiKey: '   ', fetchImpl });
    await expect(provider.generate(sampleInput())).rejects.toBeInstanceOf(IaProviderError);
    await expect(provider.generate(sampleInput())).rejects.toMatchObject({ code: 'AUTH' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mapeia 401/403 AUTH, 429 RATE_LIMIT, AbortError TIMEOUT e 400 BAD_REQUEST', async () => {
    const auth = vi.fn().mockResolvedValue(jsonResponse({ error: { type: 'auth' } }, 403));
    await expect(
      createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl: auth }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'AUTH' });

    const limited = vi.fn().mockResolvedValue(jsonResponse({ error: { type: 'rate' } }, 429));
    await expect(
      createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl: limited }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });

    const timeout = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    await expect(
      createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl: timeout }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    const bad = vi.fn().mockResolvedValue(jsonResponse({ error: { type: 'invalid_request_error' } }, 400));
    await expect(
      createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl: bad }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('mapeia refusal para CONTENT_REJECTED', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: '' }], stop_reason: 'refusal' }),
    );
    await expect(
      createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
  });

  it('envia tools e normaliza tool_use no contrato interno', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [
          {
            type: 'tool_use',
            id: 'toolu-1',
            name: 'compare_cash_months',
            input: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 11, output_tokens: 5 },
      }),
    );
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetchImpl });
    await expect(
      provider.generate(
        sampleInput({
          tools: [...listAdvisorAnalyticalTools()],
        }),
      ),
    ).resolves.toEqual({
      text: '',
      usage: { inputTokens: 11, outputTokens: 5 },
      toolCalls: [
        {
          id: 'toolu-1',
          name: 'compare_cash_months',
          arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
        },
      ],
    });
    const body = requestBody(fetchImpl);
    expect(JSON.stringify(body.tools)).toContain('compare_cash_months');
    expect(JSON.stringify(body.tools)).toContain('cash_realized_breakdown');
    expect(JSON.stringify(body.tools)).toContain('cash_movement_lines');
    expect(JSON.stringify(body.tools)).not.toContain('tenantId');
  });
});
