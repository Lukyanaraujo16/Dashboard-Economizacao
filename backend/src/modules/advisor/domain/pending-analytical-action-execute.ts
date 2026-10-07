/**
 * Execução de PendingAnalyticalAction via tools allowlisted existentes.
 * Resultado de execução ≠ resposta user-facing: composição natural é feita
 * pelo provider + evidence gate (ver send-advisor-message).
 */
import type { GenerationInput } from '../../../infrastructure/ai/types.js';
import type { AdvisorContextBlock } from './context-blocks.js';
import type { AdvisorAnalyticalToolExecutor } from './advisor-analytical-tools.js';
import {
  buildToolArgumentsFromPendingStep,
  type PendingAnalyticalAction,
} from './pending-analytical-action.js';

export type PendingActionToolExecution = {
  readonly id: string;
  readonly name: string;
  readonly ok: boolean;
  readonly content: string;
  readonly resultCardinality?: number;
  readonly arguments: Record<string, unknown>;
};

export type PendingActionExecutionResult =
  | {
      readonly status: 'OK';
      readonly executions: readonly PendingActionToolExecution[];
      readonly snapshotOnly: boolean;
    }
  | {
      readonly status: 'PARTIAL_UNAVAILABLE';
      readonly executions: readonly PendingActionToolExecution[];
      readonly unavailable: readonly string[];
      readonly snapshotOnly: boolean;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly message: string;
      readonly snapshotOnly: boolean;
    };

export async function executePendingAnalyticalAction(input: {
  readonly action: PendingAnalyticalAction;
  readonly tenantId: string;
  readonly resolvedMonthKey: string;
  readonly analyticalTools: AdvisorAnalyticalToolExecutor;
  readonly now?: Date;
}): Promise<PendingActionExecutionResult> {
  const snapshotOnly = input.action.steps.every((step) => step.toolName === null);
  if (snapshotOnly) {
    return { status: 'OK', executions: [], snapshotOnly: true };
  }

  const executions: PendingActionToolExecution[] = [];
  const unavailable: string[] = [];
  let seq = 0;

  for (const step of input.action.steps) {
    if (step.toolName === null) {
      continue;
    }
    const available = input.analyticalTools.tools.some((tool) => tool.name === step.toolName);
    if (!available) {
      unavailable.push(step.toolName);
      continue;
    }
    const args = buildToolArgumentsFromPendingStep(step, input.resolvedMonthKey);
    if (args === null) {
      unavailable.push(step.toolName);
      continue;
    }
    seq += 1;
    const callId = `pending-${input.action.id.slice(0, 8)}-${seq}`;
    const result = await input.analyticalTools.execute({
      tenantId: input.tenantId,
      resolvedMonthKey: input.resolvedMonthKey,
      now: input.now,
      call: {
        id: callId,
        name: step.toolName,
        arguments: args,
      },
    });
    executions.push({
      id: result.id,
      name: result.name,
      ok: result.ok,
      content: result.content,
      resultCardinality: result.resultCardinality,
      arguments: args,
    });
  }

  if (executions.length === 0 && unavailable.length > 0) {
    return {
      status: 'UNAVAILABLE',
      message: `Ação pendente indisponível: ${unavailable.join(', ')}.`,
      snapshotOnly: false,
    };
  }
  if (unavailable.length > 0) {
    return {
      status: 'PARTIAL_UNAVAILABLE',
      executions,
      unavailable,
      snapshotOnly: false,
    };
  }
  return { status: 'OK', executions, snapshotOnly: false };
}

/**
 * Instruções de composição user-facing após ACCEPT/MODIFY.
 * Evidência fica nos blocos FINANCIAL_FACTS / ANALYTICAL_FACTS / toolRounds —
 * nunca deve ser ecoada crua na resposta.
 */
export const PENDING_ACTION_USER_COMPOSE_INSTRUCTIONS = [
  'PENDING_ACTION_USER_COMPOSE:',
  'O usuário aceitou (ou aceitou com ajuste) uma ação analítica pendente já executada.',
  'Escreva a RESPOSTA FINAL em português, como consultor financeiro, em linguagem natural.',
  'Regras:',
  '- Use APENAS cifras e entidades presentes em FINANCIAL_FACTS, ANALYTICAL_FACTS e tool results.',
  '- Não invente números, totais, percentuais, entidades ou conclusões além da evidência.',
  '- Se faltar dado operacional para concluir (ex.: custo mensal de uma decisão), diga isso naturalmente e peça o dado faltante.',
  '- Una evidências de múltiplos steps em UMA leitura coerente (não concatene dumps técnicos).',
  '- NÃO mencione: PendingAnalyticalAction, tools, capabilities, entityScope, provenance,',
  '  temporalScope, evidenceRefs, JSON, contratos internos, "Resultado da ação aceita",',
  '  nomes canônicos internos (cash.realized.*, stock.payables.*, etc.).',
  '- Formate valores monetários de forma legível (ex.: R$ 1.234,56) quando citar cifras oficiais.',
  '- Respeite domínio: títulos a pagar ≠ despesa realizada; faturamento ≠ entrada de caixa.',
].join('\n');

/**
 * Blocos de contexto para o provider compor a resposta natural.
 * Contêm evidência estruturada — não são a resposta final.
 */
export function buildPendingActionComposeBlocks(input: {
  readonly action: PendingAnalyticalAction;
  readonly execution: PendingActionExecutionResult;
  readonly snapshotFactsText?: string | null;
  readonly userMessage: string;
  readonly resolvedMonthKey: string;
}): GenerationInput['blocks'] {
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: PENDING_ACTION_USER_COMPOSE_INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
  ];

  const facts = input.snapshotFactsText?.trim();
  if (facts !== undefined && facts !== '') {
    blocks.push({
      type: 'FINANCIAL_FACTS',
      content: facts.slice(0, 3_000),
      trustLevel: 'ANALYTICAL_FACT',
    });
  }

  if (input.execution.status !== 'UNAVAILABLE') {
    for (const exec of input.execution.executions) {
      if (!exec.ok) {
        continue;
      }
      blocks.push({
        type: 'ANALYTICAL_FACTS',
        content: [
          `toolEvidence:${exec.name}`,
          `ok:${exec.ok}`,
          exec.content.slice(0, 4_000),
        ].join('\n'),
        trustLevel: 'ANALYTICAL_FACT',
      });
    }
    if (input.execution.status === 'PARTIAL_UNAVAILABLE') {
      blocks.push({
        type: 'ANALYTICAL_FACTS',
        content: `limitation:parts_unavailable:${input.execution.unavailable.join(',')}`,
        trustLevel: 'ANALYTICAL_FACT',
      });
    }
  } else {
    blocks.push({
      type: 'ANALYTICAL_FACTS',
      content: `limitation:execution_unavailable`,
      trustLevel: 'ANALYTICAL_FACT',
    });
  }

  blocks.push({
    type: 'USER_QUESTION',
    content: [
      `resolvedMonthKey: ${input.resolvedMonthKey}`,
      `pendingObjective: ${input.action.objective}`,
      `offerSnippet: ${input.action.offerSnippet}`,
      `domain: ${input.action.domain}`,
      `operation: ${input.action.operation}`,
      'CURRENT_USER_MESSAGE:',
      input.userMessage.slice(0, 1_000),
    ].join('\n'),
    trustLevel: 'UNTRUSTED',
  });

  return blocks;
}

/** Fallback seguro se o provider falhar — nunca devolve dump técnico. */
export function pendingActionCompositionFallback(): string {
  return 'Consultei os dados oficiais disponíveis, mas não consegui redigir a leitura agora. Pode tentar de novo em instantes?';
}

/**
 * Digest interno opcional (testes / debug). NÃO usar como content user-facing.
 * @deprecated Preferir buildPendingActionComposeBlocks + provider.
 */
export function composePendingActionAnswer(input: {
  readonly action: PendingAnalyticalAction;
  readonly execution: PendingActionExecutionResult;
  readonly snapshotFactsText?: string | null;
}): string {
  if (input.execution.status === 'UNAVAILABLE') {
    return input.execution.message;
  }
  const lines: string[] = [`internal_pending_digest:${input.action.objective}`];
  if (input.execution.status === 'PARTIAL_UNAVAILABLE') {
    lines.push(`limitation:${input.execution.unavailable.join(',')}`);
  }
  for (const exec of input.execution.executions) {
    lines.push(`tool:${exec.name}:ok=${exec.ok}:cardinality=${exec.resultCardinality ?? 0}`);
  }
  return lines.join('\n');
}

/** Heurística de regressão: detecta dump técnico típico do bug de homologação. */
export function pendingAnswerLooksLikeTechnicalDump(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('resultado da ação aceita') ||
    t.includes('entityscope:') ||
    t.includes('provenance:') ||
    t.includes('temporalscope:') ||
    t.includes('evidencerefs') ||
    t.includes('posição / fatos oficiais de snapshot') ||
    /\bcash\.realized\./i.test(text) ||
    /\bstock\.payables\./i.test(text) ||
    t.includes('pendinganalyticalaction') ||
    /^\s*\{[\s\S]*"lines"\s*:/m.test(text.trim())
  );
}
