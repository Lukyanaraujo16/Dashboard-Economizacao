/**
 * Extração semântica de USER_ASSUMPTION via provider.
 * Sem catálogo de frases. Runtime valida allowlist.
 */
import { randomUUID } from 'node:crypto';
import type { GenerationInput, IaProvider } from '../../../infrastructure/ai/types.js';
import type { AdvisorContextBlock } from './context-blocks.js';
import {
  applyUserAssumptionToList,
  createUserAnalyticalAssumption,
  messageHasAssumptionMagnitudeCue,
  type UserAnalyticalAssumption,
  type UserAssumptionCadence,
  type UserAssumptionRole,
  type UserAssumptionValueKind,
  USER_ASSUMPTION_CADENCES,
  USER_ASSUMPTION_ROLES,
  USER_ASSUMPTION_VALUE_KINDS,
} from './user-analytical-assumption.js';
import { parseJsonObjectFromModelText } from './pending-analytical-action-classify.js';

const EXTRACT_INSTRUCTIONS = [
  'USER_ASSUMPTION_EXTRACT:',
  'Decida semanticamente se a mensagem atual do usuário FORNECE uma premissa/estimativa/cenário',
  'para análise condicional (não se apenas pergunta um fato oficial).',
  'Responda SOMENTE JSON válido, sem markdown.',
  'Schema:',
  '{"decision":"NO_ASSUMPTION"}',
  'ou',
  '{"decision":"USER_ASSUMPTION","valueKind":"AMOUNT|PERCENT|DELTA_AMOUNT","value":number,"cadence":"MONTHLY|ONE_OFF|ANNUAL|UNSPECIFIED","role":"COST|REVENUE|INFLOW|OUTFLOW|GENERIC","label":"string<=120","replacesPrior":boolean}',
  'Regras:',
  '- Premissa = valor que o usuário pede para CONSIDERAR no cenário (estimativa, hipótese, orçamento).',
  '- Pergunta sobre fato oficial ("quanto foi / meu aluguel foi X?") → NO_ASSUMPTION.',
  '- Pedido de listagem/ranking de dados oficiais → NO_ASSUMPTION.',
  '- "uns R$ 5 mil por mês" / "considera 10%" / "e se subir R$ 2 mil" → USER_ASSUMPTION quando for input de cenário.',
  '- value: AMOUNT/DELTA em reais (5000 para "5 mil"); PERCENT em pontos (10 para 10%).',
  '- replacesPrior=true quando o usuário corrige/substitui a premissa anterior (ex.: "na verdade 7 mil").',
  '- Nunca inclua tenantId, costCenterId, userId, SQL ou IDs inventados.',
  '- label: descrição operacional curta do que o valor representa, sem inventar entidade oficial.',
].join('\n');

export type UserAssumptionExtractResult =
  | { readonly decision: 'NO_ASSUMPTION' }
  | {
      readonly decision: 'USER_ASSUMPTION';
      readonly assumption: UserAnalyticalAssumption;
      readonly assumptions: readonly UserAnalyticalAssumption[];
    };

export async function extractUserAnalyticalAssumption(input: {
  readonly provider: IaProvider;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly tenantId: string;
  readonly userMessage: string;
  readonly createdFromMessageId: string;
  readonly existingAssumptions: readonly UserAnalyticalAssumption[];
  readonly recentConsultantSnippet?: string | null;
  readonly now?: Date;
}): Promise<UserAssumptionExtractResult> {
  if (!messageHasAssumptionMagnitudeCue(input.userMessage)) {
    return { decision: 'NO_ASSUMPTION' };
  }

  const active = input.existingAssumptions.filter((row) => row.status === 'ACTIVE');
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: EXTRACT_INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
    {
      type: 'USER_QUESTION',
      content: [
        'RECENT_CONSULTANT_SNIPPET:',
        input.recentConsultantSnippet?.slice(0, 800) || 'ABSENT',
        'ACTIVE_ASSUMPTIONS:',
        active.length === 0
          ? 'ABSENT'
          : active
              .map(
                (row) =>
                  `${row.id}|${row.valueKind}|${row.value}|${row.cadence}|${row.role}|${row.label}`,
              )
              .join('\n'),
        'CURRENT_USER_MESSAGE:',
        input.userMessage.slice(0, 1_500),
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
  if (parsed === null || parsed.decision === 'NO_ASSUMPTION') {
    return { decision: 'NO_ASSUMPTION' };
  }
  if (parsed.decision !== 'USER_ASSUMPTION') {
    return { decision: 'NO_ASSUMPTION' };
  }
  if (
    typeof parsed.valueKind !== 'string' ||
    !(USER_ASSUMPTION_VALUE_KINDS as readonly string[]).includes(parsed.valueKind) ||
    typeof parsed.value !== 'number' ||
    typeof parsed.cadence !== 'string' ||
    !(USER_ASSUMPTION_CADENCES as readonly string[]).includes(parsed.cadence) ||
    typeof parsed.role !== 'string' ||
    !(USER_ASSUMPTION_ROLES as readonly string[]).includes(parsed.role) ||
    typeof parsed.label !== 'string'
  ) {
    return { decision: 'NO_ASSUMPTION' };
  }

  const replacesPrior = parsed.replacesPrior === true;
  const created = createUserAnalyticalAssumption({
    id: randomUUID(),
    createdFromMessageId: input.createdFromMessageId,
    valueKind: parsed.valueKind as UserAssumptionValueKind,
    value: parsed.value,
    cadence: parsed.cadence as UserAssumptionCadence,
    role: parsed.role as UserAssumptionRole,
    label: parsed.label,
    replacesAssumptionId: replacesPrior
      ? (active[active.length - 1]?.id ?? null)
      : null,
    now: input.now,
  });
  if (created === null) {
    return { decision: 'NO_ASSUMPTION' };
  }

  const nextList = applyUserAssumptionToList(input.existingAssumptions, created);
  return {
    decision: 'USER_ASSUMPTION',
    assumption: created,
    assumptions: nextList,
  };
}

export function isEligibleForUserAssumptionExtract(input: {
  readonly userMessage: string;
}): boolean {
  return messageHasAssumptionMagnitudeCue(input.userMessage);
}
