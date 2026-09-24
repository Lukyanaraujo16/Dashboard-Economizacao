import type { AdvisorContextBlock } from '../../modules/advisor/domain/context-blocks.js';
import { assertMatchingProvider, readFiniteNumber, resolveConfiguredApiKey } from './adapter-guards.js';
import { composeSystemText, formatDelimitedBlock, isSystemContextBlock } from './context-block-mapping.js';
import { postIaJson } from './ia-http.js';
import { iaProviderError, isContentRejectedPayload } from './map-http-error.js';
import type { GenerationInput, GenerationOutput, IaHttpClientConfig, IaProvider } from './types.js';
import { DEFAULT_IA_HTTP_TIMEOUT_MS } from './types.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

type OpenAiChatMessage = {
  readonly role: 'system' | 'user';
  readonly content: string;
};

function toOpenAiMessages(blocks: readonly AdvisorContextBlock[]): OpenAiChatMessage[] {
  const messages: OpenAiChatMessage[] = [];
  const system = composeSystemText(blocks);
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  for (const block of blocks) {
    if (isSystemContextBlock(block)) {
      continue;
    }
    messages.push({ role: 'user', content: formatDelimitedBlock(block) });
  }
  return messages;
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
      message?: { content?: unknown };
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
  const text = choice?.message?.content;
  if (typeof text !== 'string') {
    throw iaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou uma resposta inválida.');
  }
  return {
    text,
    usage: {
      inputTokens: readFiniteNumber(payload.usage?.prompt_tokens),
      outputTokens: readFiniteNumber(payload.usage?.completion_tokens),
    },
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
          messages: toOpenAiMessages(input.blocks),
        },
      });
      return readOpenAiOutput(json);
    },
  };
}
