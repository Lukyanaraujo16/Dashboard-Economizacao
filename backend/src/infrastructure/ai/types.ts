import type {
  AdvisorAnalyticalToolCall,
  AdvisorAnalyticalToolDefinition,
  AdvisorAnalyticalToolResult,
} from '../../modules/advisor/domain/advisor-analytical-tools.js';
import type { AdvisorContextBlock } from '../../modules/advisor/domain/context-blocks.js';
import type { AiProviderId, AiRunErrorCode } from '../../modules/advisor/domain/types.js';

export type GenerationUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
};

export type IaToolDefinition = AdvisorAnalyticalToolDefinition;
export type IaToolCall = AdvisorAnalyticalToolCall;
export type IaToolResult = AdvisorAnalyticalToolResult;

export type IaToolRound = {
  readonly calls: readonly IaToolCall[];
  readonly results: readonly IaToolResult[];
};

export type GenerationInput = {
  readonly tenantId: string;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly blocks: readonly AdvisorContextBlock[];
  readonly tools?: readonly IaToolDefinition[];
  readonly toolRounds?: readonly IaToolRound[];
};

export type GenerationOutput = {
  readonly text: string;
  readonly usage: GenerationUsage;
  readonly toolCalls?: readonly IaToolCall[];
};

export type IaProvider = {
  readonly id: AiProviderId;
  generate(input: GenerationInput): Promise<GenerationOutput>;
};

export class IaProviderError extends Error {
  readonly code: AiRunErrorCode;

  constructor(code: AiRunErrorCode, message: string) {
    super(message);
    this.name = 'IaProviderError';
    this.code = code;
  }
}

export type IaFetch = typeof fetch;

export type IaHttpClientConfig = {
  readonly apiKey?: string | null;
  readonly resolveApiKey?: () => Promise<string | null>;
  readonly fetchImpl?: IaFetch;
  readonly timeoutMs?: number;
};

export const DEFAULT_IA_HTTP_TIMEOUT_MS = 30_000;
