import { formatAdvisorAgentScopeNote } from '../domain/advisor-agent-scope-summary.js';
import type {
  GenerationInput,
  GenerationOutput,
  GenerationUsage,
  IaConversationTurn,
  IaToolResult,
  IaToolRound,
} from '../../../infrastructure/ai/types.js';
import type { AdvisorAnalyticalToolExecutor } from '../domain/advisor-analytical-tools.js';
import type { AdvisorContextBlock } from '../domain/context-blocks.js';
import type { AiMessageRecord, AiProviderId } from '../domain/types.js';

export const ADVISOR_AGENT_MAX_TOOL_ROUNDS = 8;
export const ADVISOR_AGENT_HISTORY_LIMIT = 20;
export const ADVISOR_AGENT_HISTORY_TURN_MAX_CHARS = 4_000;
export const ADVISOR_AGENT_MAX_OUTPUT_TOKENS = 4_096;
const TOOL_RESULT_MAX_CHARS = 24_000;

export const ADVISOR_AGENT_EMPTY_ANSWER =
  'Não consegui concluir a análise agora. Pode reformular ou detalhar um pouco mais a pergunta?';

/** Blocos do turno atual. Histórico vai como turnos reais; instruções legadas saem. */
const AGENT_DROPPED_BLOCKS = new Set(['PLATFORM_INSTRUCTIONS', 'CONVERSATION_HISTORY', 'ANALYTICAL_FACTS']);

export function buildAdvisorAgentBlocks(
  blocks: readonly AdvisorContextBlock[],
  instructions: string,
): AdvisorContextBlock[] {
  return [
    { type: 'PLATFORM_INSTRUCTIONS', content: instructions, trustLevel: 'PLATFORM' },
    ...blocks.filter((block) => !AGENT_DROPPED_BLOCKS.has(block.type)),
  ];
}

/** Turnos anteriores da mesma conversa/tenant, sem a mensagem atual. */
export function buildAdvisorAgentConversation(input: {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly currentMessageId: string;
  readonly messages: readonly AiMessageRecord[];
  /** consultantMessageId → filtros usados naquela resposta (ai_analytical_results.scope_summary). */
  readonly scopeByConsultantMessageId?: ReadonlyMap<string, string>;
}): IaConversationTurn[] {
  return input.messages
    .filter(
      (message) =>
        message.tenantId === input.tenantId &&
        message.conversationId === input.conversationId &&
        message.id !== input.currentMessageId &&
        message.content.trim() !== '',
    )
    .slice(-ADVISOR_AGENT_HISTORY_LIMIT)
    .map((message) => {
      const content = message.content.slice(0, ADVISOR_AGENT_HISTORY_TURN_MAX_CHARS);
      if (message.senderType === 'USER') {
        return { role: 'user' as const, content };
      }
      // Os filtros da resposta anterior ficam explícitos para o follow-up herdar (ex.: centro).
      const scope = input.scopeByConsultantMessageId?.get(message.id);
      return {
        role: 'assistant' as const,
        content: scope ? `${content}\n\n${formatAdvisorAgentScopeNote(scope)}` : content,
      };
    });
}

export type AdvisorAgentLoopResult = {
  readonly text: string;
  readonly usage: GenerationUsage;
  readonly rounds: readonly IaToolRound[];
};

function addUsage(left: GenerationUsage, right: GenerationUsage): GenerationUsage {
  const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  return {
    inputTokens: sum(left.inputTokens, right.inputTokens),
    outputTokens: sum(left.outputTokens, right.outputTokens),
  };
}

/**
 * Loop agente: o modelo pede tools, o backend executa (tenant do runtime), repete até a resposta.
 * Chamadas idênticas reutilizam o resultado. Esgotado o teto, o modelo recebe aviso e responde.
 */
export async function runAdvisorAgentLoop(input: {
  readonly tenantId: string;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly blocks: readonly AdvisorContextBlock[];
  readonly conversation: readonly IaConversationTurn[];
  readonly tools: AdvisorAnalyticalToolExecutor;
  readonly resolvedMonthKey: string;
  readonly now?: Date;
  readonly generate: (payload: GenerationInput) => Promise<GenerationOutput>;
}): Promise<AdvisorAgentLoopResult> {
  const rounds: IaToolRound[] = [];
  const cache = new Map<string, IaToolResult>();
  let usage: GenerationUsage = { inputTokens: null, outputTokens: null };

  // +1: última chamada após o aviso de limite.
  for (let round = 0; round <= ADVISOR_AGENT_MAX_TOOL_ROUNDS; round += 1) {
    const generated = await input.generate({
      tenantId: input.tenantId,
      provider: input.provider,
      model: input.model,
      blocks: input.blocks,
      conversation: input.conversation,
      maxOutputTokens: ADVISOR_AGENT_MAX_OUTPUT_TOKENS,
      tools: input.tools.tools,
      ...(rounds.length > 0 ? { toolRounds: rounds } : {}),
    });
    usage = addUsage(usage, generated.usage);
    const calls = generated.toolCalls ?? [];
    if (calls.length === 0) {
      const text = generated.text.trim();
      return { text: text === '' ? ADVISOR_AGENT_EMPTY_ANSWER : text, usage, rounds };
    }
    if (round === ADVISOR_AGENT_MAX_TOOL_ROUNDS) {
      break;
    }
    const budgetExhausted = round === ADVISOR_AGENT_MAX_TOOL_ROUNDS - 1;
    const results = await Promise.all(
      calls.map(async (call): Promise<IaToolResult> => {
        if (budgetExhausted) {
          return {
            id: call.id,
            name: call.name,
            ok: false,
            content: JSON.stringify({
              status: 'LIMIT_REACHED',
              message: 'Limite de consultas desta resposta atingido. Responda agora com os dados já obtidos e diga o que ficou faltando.',
            }),
          };
        }
        const fingerprint = `${call.name}:${JSON.stringify(call.arguments)}`;
        const cached = cache.get(fingerprint);
        const result =
          cached ??
          (await input.tools.execute({
            tenantId: input.tenantId,
            call,
            resolvedMonthKey: input.resolvedMonthKey,
            now: input.now,
          }));
        cache.set(fingerprint, result);
        return {
          ...result,
          id: call.id,
          content: result.content.slice(0, TOOL_RESULT_MAX_CHARS),
        };
      }),
    );
    rounds.push({ calls, results });
  }
  return { text: ADVISOR_AGENT_EMPTY_ANSWER, usage, rounds };
}
