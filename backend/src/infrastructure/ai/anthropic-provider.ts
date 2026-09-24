import type { AdvisorContextBlock } from '../../modules/advisor/domain/context-blocks.js';
import { assertMatchingProvider, readFiniteNumber, resolveConfiguredApiKey } from './adapter-guards.js';
import {
  composeSystemText,
  formatDelimitedBlock,
  isSystemContextBlock,
  tryParseConversationTurns,
} from './context-block-mapping.js';
import { postIaJson } from './ia-http.js';
import { iaProviderError, isContentRejectedPayload } from './map-http-error.js';
import type { GenerationInput, GenerationOutput, IaHttpClientConfig, IaProvider } from './types.js';
import { DEFAULT_IA_HTTP_TIMEOUT_MS } from './types.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MAX_TOKENS = 1024;

type AnthropicChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function pushOrMerge(messages: AnthropicChatMessage[], next: AnthropicChatMessage): void {
  const last = messages[messages.length - 1];
  if (last && last.role === next.role) {
    last.content = `${last.content}\n\n${next.content}`;
    return;
  }
  messages.push(next);
}

function toAnthropicMessages(blocks: readonly AdvisorContextBlock[]): AnthropicChatMessage[] {
  const messages: AnthropicChatMessage[] = [];

  for (const block of blocks) {
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

function readAnthropicOutput(json: unknown): GenerationOutput {
  if (isContentRejectedPayload(json)) {
    throw iaProviderError('CONTENT_REJECTED');
  }
  if (json === null || typeof json !== 'object') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  const payload = json as {
    content?: Array<{ type?: unknown; text?: unknown }>;
    stop_reason?: unknown;
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
    };
  };
  if (payload.stop_reason === 'refusal') {
    throw iaProviderError('CONTENT_REJECTED');
  }
  const first = payload.content?.[0];
  const text = first?.text;
  if (typeof text !== 'string') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  return {
    text,
    usage: {
      inputTokens: readFiniteNumber(payload.usage?.input_tokens),
      outputTokens: readFiniteNumber(payload.usage?.output_tokens),
    },
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
          messages: toAnthropicMessages(input.blocks),
        },
      });
      return readAnthropicOutput(json);
    },
  };
}
