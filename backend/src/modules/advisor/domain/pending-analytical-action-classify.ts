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
  type PendingAnalyticalDomain,
  type PendingAnalyticalFilters,
  type PendingAnalyticalOperation,
  type PendingAnalyticalStep,
  type PendingAllowedTool,
  type PendingResolutionResult,
  isPendingAllowedTool,
  isPendingAnalyticalDomain,
  isPendingAnalyticalOperation,
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
  'Schema:',
  '{"decision":"NO_PENDING_ACTION"}',
  'ou',
  '{"decision":"PENDING_ANALYTICAL_ACTION","domain":"PAYABLE|REALIZED_CASH|SNAPSHOT","operation":"RANKING_TOPN|MOVEMENTS|VALUE|LOOKUP|CURRENT_POSITION","objective":"string<=200","offerSnippet":"string<=400","steps":[{"toolName":"payable_titles|cash_movement_lines|cash_realized_breakdown|cash_cost_center_movement_lines|null","filters":{"monthKey":"YYYY-MM?","status":"OPEN|PAID|OVERDUE|ALL?","ordering":"VALUE_DESC|DUE_DATE_ASC?","limit":1-20?,"costCenterQuery":"string?","direction":"INFLOW|OUTFLOW?"}}]}',
  'Regras:',
  '- Só use tools/domains/operations da allowlist.',
  '- Nunca inclua tenantId, costCenterId, userId, SQL ou capability inventada.',
  '- Oferta composta (ex.: posição atual do caixa + títulos vencidos/compromissos):',
  '  domain=SNAPSHOT, operation=CURRENT_POSITION,',
  '  steps: [{toolName:null, filters:{monthKey}} para posição/caixa via FINANCIAL_FACTS,',
  '          {toolName:"payable_titles", filters:{status:"OVERDUE"|OPEN, ordering, limit, monthKey}}].',
  '- Inclua TODOS os steps da oferta composta quando TODOS forem allowlisted.',
  '- Se QUALQUER etapa da oferta composta NÃO for representável com segurança → NO_PENDING_ACTION (não mutile a oferta).',
  '- Se a oferta for uma única ação independente clara → um step basta.',
  '- Se não houver próxima ação analítica executável → NO_PENDING_ACTION.',
  '- offerSnippet deve citar a oferta do assistente, não a pergunta do usuário.',
].join('\n');

const RESOLVE_INSTRUCTIONS = [
  'PENDING_ACTION_RESOLVE:',
  'O usuário respondeu a uma ação analítica pendente estruturada.',
  'Classifique semanticamente a mensagem atual (não por frase literal).',
  'Responda SOMENTE JSON válido, sem markdown.',
  'Schema:',
  '{"decision":"ACCEPT"}',
  '{"decision":"REJECT"}',
  '{"decision":"UNRELATED"}',
  '{"decision":"MODIFY","patch":{"monthKey":"YYYY-MM?","status":"OPEN|PAID|OVERDUE|ALL?","ordering":"VALUE_DESC|DUE_DATE_ASC?","limit":1-20?,"costCenterQuery":"string?","direction":"INFLOW|OUTFLOW?"}}',
  'Regras:',
  '- ACCEPT = usuário aceita a ação pendente (qualquer formulação natural equivalente).',
  '- MODIFY = aceita com alteração allowlisted (centro, mês, limit, status, ordering, direction).',
  '- REJECT = recusa seguir com a ação.',
  '- UNRELATED = nova pergunta independente.',
  '- Nunca invente tool/domain/capability. Nunca envie tenantId/costCenterId/SQL.',
  '- MODIFY exige patch com pelo menos um campo permitido.',
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

  const steps: PendingAnalyticalStep[] = [];
  for (const raw of parsed.steps.slice(0, 3)) {
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
    const filters = coerceFilters(raw.filters, input.resolvedMonthKey);
    if (filters === null) {
      return null;
    }
    steps.push({ toolName, filters });
  }
  if (steps.length === 0) {
    return null;
  }

  return createPendingAnalyticalAction({
    id: randomUUID(),
    createdFromMessageId: input.createdFromMessageId,
    domain: parsed.domain as PendingAnalyticalDomain,
    operation: parsed.operation as PendingAnalyticalOperation,
    steps,
    objective: parsed.objective,
    offerSnippet: parsed.offerSnippet,
    now: input.now,
  });
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
          domain: input.pending.domain,
          operation: input.pending.operation,
          objective: input.pending.objective,
          offerSnippet: input.pending.offerSnippet,
          steps: input.pending.steps,
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
