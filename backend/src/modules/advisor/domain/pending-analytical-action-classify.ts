/**
 * Extração e resolução semântica de PendingAnalyticalAction via provider.
 * Sem regex de confirmação. Allowlist rígida no parse.
 */
import { randomUUID } from 'node:crypto';
import type { GenerationInput, IaProvider } from '../../../infrastructure/ai/types.js';
import type { AdvisorContextBlock } from './context-blocks.js';
import {
  createPendingAnalyticalAction,
  parsePendingAnalyticalAction,
  parsePendingResolutionResult,
  type PendingAnalyticalAction,
  type PendingAnalyticalAlternative,
  type PendingAnalyticalDomain,
  type PendingAnalyticalFilters,
  type PendingAnalyticalOperation,
  type PendingAnalyticalStep,
  type PendingAllowedTool,
  type PendingOfferKind,
  type PendingResolutionResult,
  isPendingAllowedTool,
  isPendingAnalyticalDomain,
  isPendingAnalyticalOperation,
  PENDING_OFFER_KINDS,
} from './pending-analytical-action.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseJsonObjectFromModelText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed: unknown = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

const EXTRACT_INSTRUCTIONS = [
  'PENDING_ACTION_EXTRACT:',
  'Decida semanticamente se a resposta do assistente oferece ao usuário uma próxima ação analítica concreta e executável.',
  'Não dependa de palavras literais (posso/se quiser/quer que). Avalie o significado da oferta.',
  'Responda SOMENTE JSON válido, sem markdown.',
  'Schema SINGLE/COMPOUND:',
  '{"decision":"PENDING_ANALYTICAL_ACTION","offerKind":"SINGLE|COMPOUND","domain":"PAYABLE|REALIZED_CASH|SNAPSHOT","operation":"RANKING_TOPN|MOVEMENTS|VALUE|LOOKUP|CURRENT_POSITION","objective":"string<=200","offerSnippet":"string<=400","steps":[{"toolName":"payable_titles|cash_movement_lines|cash_realized_breakdown|cash_cost_center_movement_lines|null","filters":{...}}]}',
  'Schema ALTERNATIVES (A OU B — escolha exclusiva, NÃO execute ambos):',
  '{"decision":"PENDING_ANALYTICAL_ACTION","offerKind":"ALTERNATIVES","domain":"<domain da 1ª opção>","operation":"<operation da 1ª opção>","objective":"string<=200","offerSnippet":"string<=400","steps":[<steps da 1ª opção>],"alternatives":[{"id":"A","label":"string<=160","domain":"...","operation":"...","objective":"...","steps":[...]},{"id":"B",...}]}',
  'ou {"decision":"NO_PENDING_ACTION"}',
  'Regras:',
  '- Só use tools/domains/operations da allowlist.',
  '- Nunca inclua tenantId, costCenterId, userId, SQL ou capability inventada.',
  '- COMPOUND = usuário receberá A E B juntos (ex.: caixa + vencidos na mesma leitura).',
  '- ALTERNATIVES = assistente ofereceu caminhos mutuamente exclusivos (1. ... ou 2. ...).',
  '  NÃO modele ALTERNATIVES como COMPOUND. Cada alternativa é uma ação allowlisted completa.',
  '- Oferta composta AND: offerKind=COMPOUND, domain=SNAPSHOT quando misturar preload+payable,',
  '  steps com TODOS os passos allowlisted; se algum não for representável → NO_PENDING_ACTION.',
  '- Oferta única → offerKind=SINGLE, um step basta.',
  '- Se alguma alternativa de ALTERNATIVES for inválida/insegura → NO_PENDING_ACTION (não mutile).',
  '- Se não houver próxima ação analítica executável → NO_PENDING_ACTION.',
  '- offerSnippet / label devem citar a oferta do assistente, não a pergunta do usuário.',
].join('\n');

const RESOLVE_INSTRUCTIONS = [
  'PENDING_ACTION_RESOLVE:',
  'O usuário respondeu a uma ação analítica pendente estruturada.',
  'Classifique semanticamente a mensagem atual (não por frase literal).',
  'Responda SOMENTE JSON válido, sem markdown.',
  'Schema:',
  '{"decision":"ACCEPT"}',
  '{"decision":"AMBIGUOUS_ACCEPT"}',
  '{"decision":"SELECT_ALTERNATIVE","alternativeId":"A|B|..."}',
  '{"decision":"REJECT"}',
  '{"decision":"UNRELATED"}',
  '{"decision":"MODIFY","patch":{"monthKey":"YYYY-MM?","status":"OPEN|PAID|OVERDUE|ALL?","ordering":"VALUE_DESC|DUE_DATE_ASC?","limit":1-20?,"costCenterQuery":"string?","direction":"INFLOW|OUTFLOW?"}}',
  'Regras:',
  '- Se offerKind=SINGLE|COMPOUND: ACCEPT = aceita executar a ação (ou o composto AND).',
  '- Se offerKind=ALTERNATIVES:',
  '  ACCEPT genérico sem escolher opção ("quero", "pode seguir", "manda ver") → AMBIGUOUS_ACCEPT.',
  '  Escolha clara de uma opção (ordinal, paráfrase do label, domínio) → SELECT_ALTERNATIVE + alternativeId.',
  '  Pedido explícito de "os dois" sem confirmação estruturada → AMBIGUOUS_ACCEPT (não execute ambos).',
  '- MODIFY = aceita com alteração allowlisted (só SINGLE/COMPOUND).',
  '- REJECT = recusa seguir.',
  '- UNRELATED = nova pergunta independente.',
  '- Nunca invente tool/domain/capability. Nunca envie tenantId/costCenterId/SQL.',
  '- MODIFY exige patch com pelo menos um campo permitido.',
  '- SELECT_ALTERNATIVE exige alternativeId de uma opção listada em PENDING.',
].join('\n');

export type PendingExtractEvidence = {
  readonly toolName: string;
  readonly ok: boolean;
  readonly contentPreview: string;
};

export async function extractPendingAnalyticalActionFromOffer(input: {
  readonly provider: IaProvider;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly tenantId: string;
  readonly assistantText: string;
  readonly createdFromMessageId: string;
  readonly resolvedMonthKey: string;
  readonly toolEvidence?: readonly PendingExtractEvidence[];
  readonly now?: Date;
}): Promise<PendingAnalyticalAction | null> {
  const evidenceLines =
    input.toolEvidence === undefined || input.toolEvidence.length === 0
      ? 'ABSENT'
      : input.toolEvidence
          .slice(0, 4)
          .map(
            (row) =>
              `${row.toolName} ok=${row.ok} preview=${row.contentPreview.slice(0, 240)}`,
          )
          .join('\n');

  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: EXTRACT_INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
    {
      type: 'USER_QUESTION',
      content: [
        `resolvedMonthKey: ${input.resolvedMonthKey}`,
        'ASSISTANT_ANSWER:',
        input.assistantText.slice(0, 3_000),
        'TOOL_EVIDENCE_PREVIEW:',
        evidenceLines,
      ].join('\n'),
      trustLevel: 'UNTRUSTED',
    },
  ];

  const generated = await input.provider.generate({
    tenantId: input.tenantId,
    provider: input.providerId,
    model: input.model,
    blocks,
  });
  const parsed = parseJsonObjectFromModelText(generated.text ?? '');
  if (parsed === null) {
    return null;
  }
  if (parsed.decision === 'NO_PENDING_ACTION') {
    return null;
  }
  if (parsed.decision !== 'PENDING_ANALYTICAL_ACTION') {
    return null;
  }
  if (
    typeof parsed.domain !== 'string' ||
    !isPendingAnalyticalDomain(parsed.domain) ||
    typeof parsed.operation !== 'string' ||
    !isPendingAnalyticalOperation(parsed.operation) ||
    typeof parsed.objective !== 'string' ||
    typeof parsed.offerSnippet !== 'string' ||
    !Array.isArray(parsed.steps)
  ) {
    return null;
  }

  const offerKind = coerceOfferKind(parsed.offerKind, Array.isArray(parsed.alternatives));
  if (offerKind === null) {
    return null;
  }

  const steps = coerceSteps(parsed.steps, input.resolvedMonthKey);
  if (steps === null || steps.length === 0) {
    return null;
  }

  if (offerKind === 'ALTERNATIVES') {
    const alternatives = coerceAlternatives(parsed.alternatives, input.resolvedMonthKey);
    if (alternatives === null) {
      return null;
    }
    // Shell top-level: 1ª alternativa (compat com steps obrigatórios).
    const first = alternatives[0]!;
    return createPendingAnalyticalAction({
      id: randomUUID(),
      createdFromMessageId: input.createdFromMessageId,
      domain: first.domain,
      operation: first.operation,
      steps: first.steps,
      objective: parsed.objective,
      offerSnippet: parsed.offerSnippet,
      offerKind: 'ALTERNATIVES',
      alternatives,
      now: input.now,
    });
  }

  return createPendingAnalyticalAction({
    id: randomUUID(),
    createdFromMessageId: input.createdFromMessageId,
    domain: parsed.domain as PendingAnalyticalDomain,
    operation: parsed.operation as PendingAnalyticalOperation,
    steps,
    objective: parsed.objective,
    offerSnippet: parsed.offerSnippet,
    offerKind,
    alternatives: null,
    now: input.now,
  });
}

function coerceOfferKind(raw: unknown, hasAlternatives: boolean): PendingOfferKind | null {
  if (raw === undefined || raw === null) {
    return hasAlternatives ? 'ALTERNATIVES' : 'SINGLE';
  }
  if (typeof raw !== 'string' || !(PENDING_OFFER_KINDS as readonly string[]).includes(raw)) {
    return null;
  }
  return raw as PendingOfferKind;
}

function coerceSteps(
  rawSteps: unknown[],
  resolvedMonthKey: string,
): PendingAnalyticalStep[] | null {
  const steps: PendingAnalyticalStep[] = [];
  for (const raw of rawSteps.slice(0, 3)) {
    if (!isRecord(raw)) {
      return null;
    }
    let toolName: PendingAllowedTool | null;
    if (raw.toolName === null || raw.toolName === 'null') {
      toolName = null;
    } else if (typeof raw.toolName === 'string' && isPendingAllowedTool(raw.toolName)) {
      toolName = raw.toolName;
    } else {
      return null;
    }
    const filters = coerceFilters(raw.filters, resolvedMonthKey);
    if (filters === null) {
      return null;
    }
    steps.push({ toolName, filters });
  }
  return steps;
}

function coerceAlternatives(
  value: unknown,
  resolvedMonthKey: string,
): readonly PendingAnalyticalAlternative[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    return null;
  }
  const out: PendingAnalyticalAlternative[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) {
      return null;
    }
    if (
      typeof raw.id !== 'string' ||
      typeof raw.label !== 'string' ||
      typeof raw.domain !== 'string' ||
      !isPendingAnalyticalDomain(raw.domain) ||
      typeof raw.operation !== 'string' ||
      !isPendingAnalyticalOperation(raw.operation) ||
      typeof raw.objective !== 'string' ||
      !Array.isArray(raw.steps)
    ) {
      return null;
    }
    const steps = coerceSteps(raw.steps, resolvedMonthKey);
    if (steps === null || steps.length === 0) {
      return null;
    }
    out.push({
      id: raw.id.trim(),
      label: raw.label.trim(),
      domain: raw.domain as PendingAnalyticalDomain,
      operation: raw.operation as PendingAnalyticalOperation,
      steps,
      objective: raw.objective.trim(),
    });
  }
  return out;
}

function coerceFilters(
  value: unknown,
  fallbackMonthKey: string,
): PendingAnalyticalFilters | null {
  if (value === undefined || value === null) {
    return { monthKey: fallbackMonthKey };
  }
  if (!isRecord(value)) {
    return null;
  }
  // Reusa o parser oficial via createPending draft.
  const probe = parsePendingAnalyticalAction({
    version: 1,
    kind: 'PENDING_ANALYTICAL_ACTION',
    id: 'probe',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdFromMessageId: 'probe',
    domain: 'PAYABLE',
    operation: 'RANKING_TOPN',
    steps: [{ toolName: 'payable_titles', filters: value }],
    objective: 'probe',
    offerSnippet: 'probe',
    status: 'PENDING',
    offerKind: 'SINGLE',
    alternatives: null,
  });
  if (probe === null) {
    return null;
  }
  const filters = { ...probe.steps[0]!.filters };
  if (filters.monthKey === undefined) {
    return { ...filters, monthKey: fallbackMonthKey };
  }
  return filters;
}

export async function resolvePendingAnalyticalActionDecision(input: {
  readonly provider: IaProvider;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly tenantId: string;
  readonly userMessage: string;
  readonly pending: PendingAnalyticalAction;
}): Promise<PendingResolutionResult | null> {
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: RESOLVE_INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
    {
      type: 'USER_QUESTION',
      content: [
        'PENDING_ANALYTICAL_ACTION:',
        JSON.stringify({
          id: input.pending.id,
          offerKind: input.pending.offerKind,
          domain: input.pending.domain,
          operation: input.pending.operation,
          objective: input.pending.objective,
          offerSnippet: input.pending.offerSnippet,
          steps: input.pending.steps,
          alternatives: input.pending.alternatives,
          status: input.pending.status,
          expiresAt: input.pending.expiresAt,
        }),
        'CURRENT_USER_MESSAGE:',
        input.userMessage.slice(0, 1_000),
      ].join('\n'),
      trustLevel: 'UNTRUSTED',
    },
  ];

  const generated = await input.provider.generate({
    tenantId: input.tenantId,
    provider: input.providerId,
    model: input.model,
    blocks,
  });
  const parsed = parseJsonObjectFromModelText(generated.text ?? '');
  if (parsed === null) {
    return null;
  }
  return parsePendingResolutionResult(parsed);
}
