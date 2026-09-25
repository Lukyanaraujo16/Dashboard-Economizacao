import { assertMatchingProvider, readFiniteNumber, resolveConfiguredApiKey } from './adapter-guards.js';
import { composeSystemText, formatDelimitedBlock, isSystemContextBlock } from './context-block-mapping.js';
import { postIaJson } from './ia-http.js';
import { iaProviderError, isContentRejectedPayload } from './map-http-error.js';
import type {
  GenerationInput,
  GenerationOutput,
  IaHttpClientConfig,
  IaProvider,
  IaToolCall,
  IaToolDefinition,
  IaToolRound,
} from './types.js';
import { DEFAULT_IA_HTTP_TIMEOUT_MS } from './types.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

type OpenAiChatMessage = {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content?: string | null;
  readonly tool_calls?: readonly {
    readonly id: string;
    readonly type: 'function';
    readonly function: { readonly name: string; readonly arguments: string };
  }[];
  readonly tool_call_id?: string;
};

function toOpenAiMessages(input: GenerationInput): OpenAiChatMessage[] {
  const messages: OpenAiChatMessage[] = [];
  const system = composeSystemText(input.blocks);
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  for (const block of input.blocks) {
    if (isSystemContextBlock(block)) {
      continue;
    }
    messages.push({ role: 'user', content: formatDelimitedBlock(block) });
  }
  appendOpenAiToolRounds(messages, input.toolRounds ?? []);
  return messages;
}

function appendOpenAiToolRounds(
  messages: OpenAiChatMessage[],
  rounds: readonly IaToolRound[],
): void {
  for (const round of rounds) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: round.calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    });
    for (const result of round.results) {
      messages.push({
        role: 'tool',
        tool_call_id: result.id,
        content: result.content,
      });
    }
  }
}

function toOpenAiTools(tools: readonly IaToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function readOpenAiToolCalls(message: {
  readonly tool_calls?: Array<{
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  }>;
}): IaToolCall[] {
  const calls: IaToolCall[] = [];
  for (const item of message.tool_calls ?? []) {
    if (typeof item.id !== 'string' || typeof item.function?.name !== 'string') {
      continue;
    }
    calls.push({
      id: item.id,
      name: item.function.name,
      arguments: parseToolArguments(item.function.arguments),
    });
  }
  return calls;
}

function readOpenAiOutput(json: unknown): GenerationOutput {
  if (isContentRejectedPayload(json)) {
    throw iaProviderError('CONTENT_REJECTED');
  }
  if (json === null || typeof json !== 'object') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  const payload = json as {
    choices?: Array<{
      finish_reason?: unknown;
      message?: {
        content?: unknown;
        tool_calls?: Array<{
          id?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
    };
  };
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    throw iaProviderError('CONTENT_REJECTED');
  }
  const message = choice?.message;
  const toolCalls = message ? readOpenAiToolCalls(message) : [];
  const text = typeof message?.content === 'string' ? message.content : '';
  if (toolCalls.length === 0 && typeof message?.content !== 'string') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  return {
    text,
    usage: {
      inputTokens: readFiniteNumber(payload.usage?.prompt_tokens),
      outputTokens: readFiniteNumber(payload.usage?.completion_tokens),
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export function createOpenAiProvider(config: IaHttpClientConfig): IaProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_IA_HTTP_TIMEOUT_MS;

  return {
    id: 'OPENAI',
    async generate(input: GenerationInput): Promise<GenerationOutput> {
      assertMatchingProvider('OPENAI', input);
      const apiKey = await resolveConfiguredApiKey(config);
      const tools = input.tools ?? [];
      const json = await postIaJson({
        fetchImpl,
        timeoutMs,
        url: OPENAI_CHAT_COMPLETIONS_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: {
          model: input.model,
          messages: toOpenAiMessages(input),
          ...(tools.length > 0 ? { tools: toOpenAiTools(tools), tool_choice: 'auto' } : {}),
        },
      });
      return readOpenAiOutput(json);
    },
  };
}
