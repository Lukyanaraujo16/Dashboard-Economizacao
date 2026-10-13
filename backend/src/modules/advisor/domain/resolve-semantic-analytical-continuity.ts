/**
 * C.2.5 — Continuidade semântica via provider.
 * Provider só propõe decision + patch allowlisted. Nunca executa, nunca escolhe IDs.
 */
import type { GenerationInput, IaProvider } from '../../../infrastructure/ai/types.js';
import type { AdvisorContextBlock } from './context-blocks.js';
import type { AnalyticalDimensionPatch } from './analytical-dimension-patch.js';
import {
  ANALYTICAL_CONTINUITY_DECISIONS,
  type AnalyticalContinuityDecision,
} from './classify-analytical-continuity.js';
import type { LastAnalyticalQuery } from './last-analytical-query.js';
import {
  isAnalyticalDirection,
  isAnalyticalMetricKey,
} from './analytical/analytical-keys.js';
import { isAnalyticalMonthKey } from './analytical/analytical-period.js';
import { patchPeriodMonthKey } from './analytical-dimension-patch.js';

export type SemanticContinuityProposal =
  | {
      readonly decision: 'CONTINUE';
      readonly patch: AnalyticalDimensionPatch;
      readonly extraProviderCalls: 1;
    }
  | {
      readonly decision: 'NEW_QUERY' | 'CLARIFY';
      readonly reason: string;
      readonly message?: string;
      readonly extraProviderCalls: 1;
    }
  | {
      readonly decision: 'UNAVAILABLE';
      readonly reason: string;
      readonly extraProviderCalls: 0 | 1;
    };

const INSTRUCTIONS = [
  'Você classifica CONTINUIDADE analítica. Não execute consultas. Não invente IDs.',
  'Responda APENAS JSON:',
  '{"decision":"CONTINUE|NEW_QUERY|CLARIFY","patch":{"monthKey":"YYYY-MM?","costCenterQuery":"texto?","limit":number?,"direction":"INFLOW|OUTFLOW|NET?","metric":"BILLING|REALIZED_CASH|CASH_RESULT?"},"clarifyMessage":"texto?"}',
  'CONTINUE: alterar só dimensões pedidas sobre a consulta anterior.',
  'NEW_QUERY: pergunta independente (nova métrica/assunto).',
  'CLARIFY: ambíguo demais.',
  'Proibido: tenantId, costCenterId, SQL, tool names, valores financeiros.',
].join('\n');

export async function resolveSemanticAnalyticalContinuity(input: {
  readonly provider: IaProvider;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly tenantId: string;
  readonly userMessage: string;
  readonly prior: LastAnalyticalQuery;
}): Promise<SemanticContinuityProposal> {
  const blocks: AdvisorContextBlock[] = [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
    {
      type: 'USER_QUESTION',
      content: [
        'PRIOR_CAPABILITY:',
        input.prior.capabilityKey,
        'PRIOR_QUERY_JSON:',
        JSON.stringify(sanitizePriorForPrompt(input.prior)),
        'CURRENT_USER_MESSAGE:',
        input.userMessage.slice(0, 1_500),
      ].join('\n'),
      trustLevel: 'UNTRUSTED',
    },
  ];

  let text: string;
  try {
    const generated = await input.provider.generate({
      tenantId: input.tenantId,
      provider: input.providerId,
      model: input.model,
      blocks,
    });
    text = generated.text ?? '';
  } catch {
    return {
      decision: 'UNAVAILABLE',
      reason: 'PROVIDER_ERROR',
      extraProviderCalls: 1,
    };
  }

  const parsed = parseJsonObjectFromModelText(text);
  if (parsed === null) {
    return {
      decision: 'CLARIFY',
      reason: 'INVALID_PROVIDER_JSON',
      message:
        'Não consegui interpretar a continuação. Reformule indicando período, centro ou limite.',
      extraProviderCalls: 1,
    };
  }

  const decisionRaw = parsed.decision;
  if (
    typeof decisionRaw !== 'string' ||
    !(ANALYTICAL_CONTINUITY_DECISIONS as readonly string[]).includes(decisionRaw)
  ) {
    return {
      decision: 'CLARIFY',
      reason: 'INVALID_DECISION',
      message: 'Não consegui classificar a continuação. Reformule a pergunta.',
      extraProviderCalls: 1,
    };
  }
  const decision = decisionRaw as AnalyticalContinuityDecision;

  if (decision === 'NEW_QUERY') {
    return { decision: 'NEW_QUERY', reason: 'PROVIDER_NEW_QUERY', extraProviderCalls: 1 };
  }
  if (decision === 'CLARIFY') {
    const message =
      typeof parsed.clarifyMessage === 'string' && parsed.clarifyMessage.trim() !== ''
        ? parsed.clarifyMessage.trim().slice(0, 400)
        : 'Pode esclarecer o que deseja alterar na consulta anterior?';
    return {
      decision: 'CLARIFY',
      reason: 'PROVIDER_CLARIFY',
      message,
      extraProviderCalls: 1,
    };
  }

  const patchResult = parseAllowlistedPatch(parsed.patch, input.prior);
  if (!patchResult.ok) {
    return {
      decision: 'CLARIFY',
      reason: patchResult.reason,
      message: patchResult.message,
      extraProviderCalls: 1,
    };
  }
  if (Object.keys(patchResult.patch).length === 0) {
    return {
      decision: 'CLARIFY',
      reason: 'EMPTY_PATCH',
      message: 'Não identifiquei dimensões para alterar. Seja mais específico.',
      extraProviderCalls: 1,
    };
  }
  return {
    decision: 'CONTINUE',
    patch: patchResult.patch,
    extraProviderCalls: 1,
  };
}

/**
 * Só chama o provider quando a classificação determinística ficou ambígua
 * e há prior + mensagem curta com âncora de continuação.
 */
export function shouldAttemptSemanticContinuity(input: {
  readonly content: string;
  readonly deterministicDecision: AnalyticalContinuityDecision;
  readonly prior: LastAnalyticalQuery | null;
}): boolean {
  if (input.prior === null) {
    return false;
  }
  if (input.deterministicDecision !== 'CLARIFY') {
    return false;
  }
  const folded = input.content
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
  return /^(?:e|agora)\b/.test(folded) || folded.split(/\s+/).length <= 12;
}

function sanitizePriorForPrompt(prior: LastAnalyticalQuery): object {
  return {
    capabilityKey: prior.capabilityKey,
    semanticFamily: prior.query.semanticFamily,
    metric: prior.query.metric,
    operation: prior.query.operation,
    direction: prior.query.direction ?? null,
    period: prior.query.period,
    dimension: prior.query.dimension ?? null,
    filters: prior.query.filters ?? null,
    limit: prior.query.limit ?? null,
  };
}

function parseAllowlistedPatch(
  raw: unknown,
  prior: LastAnalyticalQuery,
):
  | { readonly ok: true; readonly patch: AnalyticalDimensionPatch }
  | { readonly ok: false; readonly reason: string; readonly message: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, patch: {} };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      reason: 'INVALID_PATCH',
      message: 'Patch inválido do classificador.',
    };
  }
  const record = raw as Record<string, unknown>;
  const allowed = new Set([
    'monthKey',
    'costCenterQuery',
    'limit',
    'direction',
    'metric',
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        reason: 'UNKNOWN_PATCH_FIELD',
        message: `Campo não permitido no patch: ${key}`,
      };
    }
    if (
      /id$/i.test(key) ||
      key.toLowerCase().includes('tenant') ||
      key.toLowerCase().includes('sql')
    ) {
      return {
        ok: false,
        reason: 'FORBIDDEN_PATCH_FIELD',
        message: 'Patch contém campo proibido.',
      };
    }
  }

  let period: AnalyticalDimensionPatch['period'];
  let costCenterQuery: string | undefined;
  let limit: number | undefined;
  let direction: AnalyticalDimensionPatch['direction'];
  let metric: AnalyticalDimensionPatch['metric'];

  if (record.monthKey !== undefined) {
    if (typeof record.monthKey !== 'string' || !isAnalyticalMonthKey(record.monthKey)) {
      return {
        ok: false,
        reason: 'INVALID_MONTH',
        message: 'monthKey inválido no patch.',
      };
    }
    period = patchPeriodMonthKey(prior.query.period, record.monthKey);
  }
  if (record.costCenterQuery !== undefined) {
    if (
      typeof record.costCenterQuery !== 'string' ||
      record.costCenterQuery.trim() === '' ||
      record.costCenterQuery.trim().length > 120
    ) {
      return {
        ok: false,
        reason: 'INVALID_COST_CENTER',
        message: 'costCenterQuery inválido no patch.',
      };
    }
    costCenterQuery = record.costCenterQuery.trim();
  }
  if (record.limit !== undefined) {
    if (
      typeof record.limit !== 'number' ||
      !Number.isInteger(record.limit) ||
      record.limit < 1 ||
      record.limit > 200
    ) {
      return {
        ok: false,
        reason: 'INVALID_LIMIT',
        message: 'limit inválido no patch.',
      };
    }
    limit = record.limit;
  }
  if (record.direction !== undefined) {
    if (typeof record.direction !== 'string' || !isAnalyticalDirection(record.direction)) {
      return {
        ok: false,
        reason: 'INVALID_DIRECTION',
        message: 'direction inválida no patch.',
      };
    }
    direction = record.direction;
  }
  if (record.metric !== undefined) {
    if (typeof record.metric !== 'string' || !isAnalyticalMetricKey(record.metric)) {
      return {
        ok: false,
        reason: 'INVALID_METRIC',
        message: 'metric inválida no patch.',
      };
    }
    metric = record.metric;
  }
  const patch: AnalyticalDimensionPatch = {
    ...(period !== undefined ? { period } : {}),
    ...(costCenterQuery !== undefined ? { costCenterQuery } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(direction !== undefined ? { direction } : {}),
    ...(metric !== undefined ? { metric } : {}),
  };
  return { ok: true, patch };
}

function parseJsonObjectFromModelText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
