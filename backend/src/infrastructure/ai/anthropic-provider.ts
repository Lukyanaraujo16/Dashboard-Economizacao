import { assertMatchingProvider, readFiniteNumber, resolveConfiguredApiKey } from './adapter-guards.js';
import {
  composeSystemText,
  formatDelimitedBlock,
  isSystemContextBlock,
  tryParseConversationTurns,
} from './context-block-mapping.js';
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

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MAX_TOKENS = 1024;

type AnthropicContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
    >;

type AnthropicChatMessage = {
  role: 'user' | 'assistant';
  content: AnthropicContent;
};

function pushOrMerge(messages: AnthropicChatMessage[], next: AnthropicChatMessage): void {
  const last = messages[messages.length - 1];
  if (last && last.role === next.role && typeof last.content === 'string' && typeof next.content === 'string') {
    last.content = `${last.content}\n\n${next.content}`;
    return;
  }
  messages.push(next);
}

function toAnthropicTools(tools: readonly IaToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function appendAnthropicToolRounds(
  messages: AnthropicChatMessage[],
  rounds: readonly IaToolRound[],
): void {
  for (const round of rounds) {
    messages.push({
      role: 'assistant',
      content: round.calls.map((call) => ({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.arguments,
      })),
    });
    messages.push({
      role: 'user',
      content: round.results.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.id,
        content: result.content,
        is_error: !result.ok,
      })),
    });
  }
}

function toAnthropicMessages(input: GenerationInput): AnthropicChatMessage[] {
  const messages: AnthropicChatMessage[] = [];

  for (const block of input.blocks) {
    if (isSystemContextBlock(block)) {
      continue;
    }
    if (block.type === 'CONVERSATION_HISTORY') {
      const turns = tryParseConversationTurns(block.content);
      if (turns) {
        for (const turn of turns) {
          pushOrMerge(messages, { role: turn.role, content: turn.text });
        }
        continue;
      }
    }
    pushOrMerge(messages, { role: 'user', content: formatDelimitedBlock(block) });
  }

  appendAnthropicToolRounds(messages, input.toolRounds ?? []);

  if (messages.length === 0) {
    return [{ role: 'user', content: formatDelimitedBlock({
      type: 'USER_QUESTION',
      content: '',
      trustLevel: 'UNTRUSTED',
    }) }];
  }
  if (messages[0]!.role === 'assistant') {
    messages.unshift({ role: 'user', content: '[PLATFORM CONTEXT]' });
  }
  if (messages[messages.length - 1]!.role === 'assistant') {
    messages.push({
      role: 'user',
      content: formatDelimitedBlock({
        type: 'USER_QUESTION',
        content: '',
        trustLevel: 'UNTRUSTED',
      }),
    });
  }
  return messages;
}

function readAnthropicToolCalls(
  content: Array<{ type?: unknown; id?: unknown; name?: unknown; input?: unknown }>,
): IaToolCall[] {
  const calls: IaToolCall[] = [];
  for (const item of content) {
    if (item.type !== 'tool_use' || typeof item.id !== 'string' || typeof item.name !== 'string') {
      continue;
    }
    const args =
      item.input !== null && typeof item.input === 'object' && !Array.isArray(item.input)
        ? (item.input as Record<string, unknown>)
        : {};
    calls.push({ id: item.id, name: item.name, arguments: args });
  }
  return calls;
}

function readAnthropicOutput(json: unknown): GenerationOutput {
  if (isContentRejectedPayload(json)) {
    throw iaProviderError('CONTENT_REJECTED');
  }
  if (json === null || typeof json !== 'object') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  const payload = json as {
    content?: Array<{ type?: unknown; text?: unknown; id?: unknown; name?: unknown; input?: unknown }>;
    stop_reason?: unknown;
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
    };
  };
  if (payload.stop_reason === 'refusal') {
    throw iaProviderError('CONTENT_REJECTED');
  }
  const content = payload.content ?? [];
  const toolCalls = readAnthropicToolCalls(content);
  const texts = content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => String(item.text));
  const text = texts.join('\n');
  if (toolCalls.length === 0 && typeof content[0]?.text !== 'string') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  return {
    text,
    usage: {
      inputTokens: readFiniteNumber(payload.usage?.input_tokens),
      outputTokens: readFiniteNumber(payload.usage?.output_tokens),
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export function createAnthropicProvider(config: IaHttpClientConfig): IaProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_IA_HTTP_TIMEOUT_MS;

  return {
    id: 'ANTHROPIC',
    async generate(input: GenerationInput): Promise<GenerationOutput> {
      assertMatchingProvider('ANTHROPIC', input);
      const apiKey = await resolveConfiguredApiKey(config);
      const system = composeSystemText(input.blocks);
      const tools = input.tools ?? [];
      const json = await postIaJson({
        fetchImpl,
        timeoutMs,
        url: ANTHROPIC_MESSAGES_URL,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: {
          model: input.model,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          ...(system ? { system } : {}),
          messages: toAnthropicMessages(input),
          ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
        },
      });
      return readAnthropicOutput(json);
    },
  };
}
