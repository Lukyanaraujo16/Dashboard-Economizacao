import { describe, expect, it, vi } from 'vitest';

import { createOpenAiProvider, IaProviderError } from '../src/infrastructure/ai/index.js';
import type { GenerationInput } from '../src/infrastructure/ai/index.js';
import type { AdvisorContextBlock } from '../src/modules/advisor/domain/context-blocks.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openaiSuccess(text = 'Resposta OpenAI', usage?: { prompt_tokens?: number; completion_tokens?: number }) {
  return jsonResponse({
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: usage ?? { prompt_tokens: 12, completion_tokens: 4 },
  });
}

const blocks: AdvisorContextBlock[] = [
  { type: 'PLATFORM_INSTRUCTIONS', content: 'Você é o Consultor.', trustLevel: 'PLATFORM' },
  { type: 'TENANT_PROFILE', content: 'Comércio varejista.', trustLevel: 'TENANT_CONFIG' },
  { type: 'TENANT_KNOWLEDGE', content: 'Fecha aos domingos.', trustLevel: 'UNTRUSTED' },
  { type: 'FINANCIAL_FACTS', content: 'inadimplencia: 100', trustLevel: 'ANALYTICAL_FACT' },
  { type: 'CONVERSATION_HISTORY', content: 'USER: oi\nCONSULTANT: olá', trustLevel: 'UNTRUSTED' },
  { type: 'USER_QUESTION', content: 'Como está a inadimplência?', trustLevel: 'UNTRUSTED' },
];

function sampleInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    tenantId: 'tenant-1',
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    blocks,
    ...overrides,
  };
}

function requestBody(fetchImpl: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body)) as Record<string, unknown>;
}

describe('adapter OpenAI (F13.3)', () => {
  it('converte blocks em messages do vendor e normaliza usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openaiSuccess());
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });

    await expect(provider.generate(sampleInput())).resolves.toEqual({
      text: 'Resposta OpenAI',
      usage: { inputTokens: 12, outputTokens: 4 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://api.openai.com/v1/chat/completions');
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.stringify(headers)).not.toContain('sk-test-other');

    const body = requestBody(fetchImpl);
    expect(body.model).toBe('gpt-4o-mini');
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'Você é o Consultor.\n\n[TENANT_CONFIG TENANT_PROFILE]\nComércio varejista.',
    });
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: '[UNTRUSTED TENANT_KNOWLEDGE]\nFecha aos domingos.' },
      { role: 'user', content: '[ANALYTICAL_FACT FINANCIAL_FACTS]\ninadimplencia: 100' },
      { role: 'user', content: '[UNTRUSTED CONVERSATION_HISTORY]\nUSER: oi\nCONSULTANT: olá' },
      { role: 'user', content: '[UNTRUSTED USER_QUESTION]\nComo está a inadimplência?' },
    ]);
  });

  it('usa null em usage quando o vendor omite tokens', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await expect(provider.generate(sampleInput())).resolves.toEqual({
      text: 'ok',
      usage: { inputTokens: null, outputTokens: null },
    });
  });

  it('recusa vendor errado sem chamar o fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await expect(provider.generate(sampleInput({ provider: 'ANTHROPIC' }))).rejects.toMatchObject({
      name: 'IaProviderError',
      code: 'BAD_REQUEST',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sem chave lança AUTH sem fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = createOpenAiProvider({ apiKey: null, fetchImpl });
    await expect(provider.generate(sampleInput())).rejects.toBeInstanceOf(IaProviderError);
    await expect(provider.generate(sampleInput())).rejects.toMatchObject({ code: 'AUTH' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mapeia 401 para AUTH', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'nope' } }, 401));
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await expect(provider.generate(sampleInput())).rejects.toMatchObject({ code: 'AUTH' });
    const error = await provider.generate(sampleInput()).catch((caught: unknown) => caught);
    expect(String(error)).not.toContain('nope');
    expect(String(error)).not.toContain('sk-test');
  });

  it('mapeia 429 para RATE_LIMIT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { type: 'rate_limit' } }, 429));
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await expect(provider.generate(sampleInput())).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('mapeia AbortError para TIMEOUT', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl, timeoutMs: 20 });
    await expect(provider.generate(sampleInput())).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('mapeia 400 para BAD_REQUEST e 404 para MODEL_UNAVAILABLE', async () => {
    const bad = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad' } }, 400));
    await expect(
      createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: bad }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const missing = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'gone' } }, 404));
    await expect(
      createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: missing }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });

  it('mapeia content_filter para CONTENT_REJECTED e 5xx para PROVIDER_ERROR', async () => {
    const filtered = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'content_filter' } }, 400),
    );
    await expect(
      createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: filtered }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });

    const down = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'down' } }, 503));
    await expect(
      createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: down }).generate(sampleInput()),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('envia tools oficiais e normaliza tool_calls sem tenant no schema', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'compare_cash_months',
                    arguments: '{"monthKey":"2026-08","comparisonMonthKey":"2026-07"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 9, completion_tokens: 3 },
      }),
    );
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await expect(
      provider.generate(
        sampleInput({
          tools: [
            {
              name: 'compare_cash_months',
              description: 'Compara dois meses',
              inputSchema: { type: 'object', properties: { monthKey: { type: 'string' } } },
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      text: '',
      usage: { inputTokens: 9, outputTokens: 3 },
      toolCalls: [
        {
          id: 'call-1',
          name: 'compare_cash_months',
          arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
        },
      ],
    });
    const body = requestBody(fetchImpl);
    expect(body.tool_choice).toBe('auto');
    expect(JSON.stringify(body.tools)).toContain('compare_cash_months');
    expect(JSON.stringify(body.tools)).not.toContain('tenantId');
  });

  it('reenvia tool result na rodada seguinte', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openaiSuccess('delta oficial'));
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    await provider.generate(
      sampleInput({
        tools: [{ name: 'compare_cash_months', description: 'cmp', inputSchema: {} }],
        toolRounds: [
          {
            calls: [
              {
                id: 'call-1',
                name: 'compare_cash_months',
                arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' },
              },
            ],
            results: [
              {
                id: 'call-1',
                name: 'compare_cash_months',
                ok: true,
                content: '{"difference":{"billing":"88130.31"}}',
              },
            ],
          },
        ],
      }),
    );
    const messages = requestBody(fetchImpl).messages as Array<Record<string, unknown>>;
    expect(messages.at(-2)).toMatchObject({ role: 'assistant' });
    expect(messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
    });
  });
});
